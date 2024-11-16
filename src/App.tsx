import { useEffect, useState } from "react";
import {invoke} from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import ollama from 'ollama'
import "./App.css";

type User = {
  id: number;
  name: string;
  email: string;
};

function App() {
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function getUsers() {
    try {
      const db = await Database.load("sqlite:test.db");
      const dbUsers = await db.select<User[]>("SELECT * FROM users");
      const decryptedUsers = dbUsers.map(async (user) => {
        const email = await invoke('decrypt_string', { value: user.email })
        return {
          ...user,
          email: `${email}`
        }
      })
      const users = await Promise.all(decryptedUsers)
      console.log(users)

      setError("");
      setUsers(users);
      setIsLoadingUsers(false);
    } catch (error) {
      console.log(error);
      setError("Failed to get users - check console");
    }
  }

  async function setUser(user: Omit<User, "id">) {
    try {
      setIsLoadingUsers(true);
      const db = await Database.load("sqlite:test.db");
      const email = await invoke("encrypt_string", { value: user.email })

      await db.execute("INSERT INTO users (name, email) VALUES ($1, $2)", [
        user.name,
        email,
      ]);

      getUsers().then(() => setIsLoadingUsers(false));
    } catch (error) {
      console.log(error);
      setError("Failed to insert user - check console");
    }
  }

  async function removeUser(id: number) {
    try {
      setIsLoadingUsers(true);
      const db = await Database.load("sqlite:test.db");

      await db.execute("DELETE FROM users WHERE id = $1", [id]);

      getUsers().then(() => setIsLoadingUsers(false));
    } catch (error) {
      console.log(error);
      setError("Failed to remove user - check console");
    }
  }

  useEffect(() => {
    getUsers();
  }, []);

  async function testMySqlDb() {
    const result = await invoke("read_mysql_database")
    console.log(result)
  }

  async function testOllama() {
    try {
      const message = { role: 'user', content: 'list top 10 javascript frameworks' }
      const response = await ollama.chat({ model: 'llama3.1', messages: [message], stream: true })
      for await (const part of response) {
        console.log(part.message.content)
      }
    } catch (error) {
      console.error('Error :', error);
    }
  }

  return (
      <main className="container">
        <h1>Welcome to Tauri + SQLite</h1>

        {isLoadingUsers ? (
            <div>Loading users...</div>
        ) : (
          <div style={{display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setUser({ name, email });
                  }}
              >
                <input
                    id="name-input"
                    onChange={(e) => setName(e.currentTarget.value)}
                    placeholder="Enter a name..."
                />
                <input
                    type="email"
                    id="email-input"
                    onChange={(e) => setEmail(e.currentTarget.value)}
                    placeholder="Enter an email..."
                />
                <button type="submit">Add User</button>
              </form>

            <div style={{display: "flex", flexDirection: "column", gap: "2rem"}}>
              <button onClick={testMySqlDb}>Test MySQL DB</button>
            </div>

            <div style={{display: "flex", flexDirection: "column", gap: "2rem"}}>
              <button onClick={testOllama}>Test Ollama</button>
            </div>

            <div style={{display: "flex", flexDirection: "column", gap: "2rem" }}>
                <h1>Users</h1>
                <table>
                  <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Remove</th>
                  </tr>
                  </thead>
                  <tbody>
                  {users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.id}</td>
                        <td>{user.name}</td>
                        <td>{user.email}</td>
                        <td>
                          <button onClick={(e) => {
                            e.preventDefault();
                            removeUser(user.id);
                          }}>
                            Remove User
                          </button>
                        </td>
                      </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            </div>
        )}

        {error && <p>{error}</p>}
      </main>
  );
}

export default App;