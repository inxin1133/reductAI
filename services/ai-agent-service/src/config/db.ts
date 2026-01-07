import { Pool } from "pg"
import dotenv from "dotenv"

dotenv.config()

const pool = new Pool({
  // connectionString: process.env.DATABASE_URL,
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
})

pool.on("error", (err: Error) => {
  console.error("Unexpected error on idle client", err)
  process.exit(-1)
})

export const query = (text: string, params?: any[]) => pool.query(text, params)
export default pool


