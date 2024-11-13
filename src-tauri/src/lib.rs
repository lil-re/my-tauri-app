#[macro_use] extern crate magic_crypt;

use magic_crypt::MagicCryptTrait;
use tauri_plugin_sql::{Migration, MigrationKind};
use mysql::*;
use mysql::prelude::*;
use serde_json::json;
use serde_json::Value;
use reqwest::Client;
use ollama_rs::{
    generation::completion::{
        request::GenerationRequest, GenerationContext,
    },
    Ollama,
};

#[tauri::command]
fn encrypt_string(value: &str) -> String {
    let mcrypt = new_magic_crypt!("magickey", 256);
    mcrypt.encrypt_str_to_base64(value)
}

#[tauri::command]
fn decrypt_string(value: &str) -> String {
    let mcrypt = new_magic_crypt!("magickey", 256);
    mcrypt.decrypt_base64_to_string(&value).unwrap()
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn read_mysql_database() -> Result<Value, String> {
    let database_url = "mysql://test:test@localhost:3306/coin_wombat_db";

    // Create a connection to the database
    let pool = match Pool::new(database_url) {
        Ok(p) => p,
        Err(e) => return Err(format!("Database connection error: {}", e)),
    };

    let mut conn = match pool.get_conn() {
        Ok(c) => c,
        Err(e) => return Err(format!("Failed to get connection: {}", e)),
    };

    // Execute the query and fetch the results
    let result = conn.query_iter("SELECT id, symbol, label from coin");

    match result {
        Ok(mut result_set) => {
            let mut rows = Vec::new();

            // Iterate through each row in the result set
            while let Some(result_row) = result_set.next() {
                match result_row {
                    Ok(row) => {
                        let mut json_row = serde_json::Map::new();

                        // Populate json_row with each column value in the row
                        for (index, column) in row.columns_ref().iter().enumerate() {
                            let column_name = column.name_str().to_string();

                            // Use get_opt to handle different types
                            let column_value: Value = match row.get_opt(index) {
                                Some(Ok(Some(val))) => {
                                    // Convert to serde_json::Value based on type
                                    match val {
                                        mysql::Value::Int(i) => serde_json::json!(i),
                                        mysql::Value::UInt(u) => serde_json::json!(u),
                                        mysql::Value::Float(f) => serde_json::json!(f),
                                        mysql::Value::Double(d) => serde_json::json!(d),
                                        mysql::Value::Bytes(b) => serde_json::json!(String::from_utf8_lossy(b.as_slice())),
                                        mysql::Value::NULL => Value::Null,
                                        _ => Value::Null,
                                    }
                                }
                                _ => Value::Null,
                            };

                            json_row.insert(column_name, column_value);
                        }

                        rows.push(Value::Object(json_row));
                    }
                    Err(e) => return Err(format!("Error fetching row: {}", e)),
                }
            }

            Ok(Value::Array(rows))
        },
        Err(e) => Err(format!("Failed to execute query: {}", e)),
    }
}

#[tauri::command]
async fn generate_sql(prompt: String) -> String {
    // By default it will connect to localhost:11434
    let ollama = Ollama::default();

    let model = "llama3:latest".to_string();
    let prompt = "Why is the sky blue?".to_string();

    let res = ollama.generate(GenerationRequest::new(model, prompt)).await;

    res.unwrap().response
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create users table",
            sql: "CREATE TABLE IF NOT EXISTS users (  
                id INTEGER PRIMARY KEY AUTOINCREMENT,  
                name TEXT NOT NULL,  
                email TEXT  
            )",
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:test.db", migrations)
                .build()
        )
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet, encrypt_string, decrypt_string, read_mysql_database, generate_sql])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}