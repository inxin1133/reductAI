const fs = require("fs")
const path = require("path")
const { Client } = require(path.resolve(__dirname, "..", "services", "ai-agent-service", "node_modules", "pg"))

function parseEnvFile(filePath) {
  const out = {}
  const raw = fs.readFileSync(filePath, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let val = trimmed.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

async function main() {
  const envPath = path.resolve(__dirname, "..", ".env")
  const env = fs.existsSync(envPath) ? parseEnvFile(envPath) : {}
  const user = env.POSTGRES_USER || process.env.POSTGRES_USER
  const password = env.POSTGRES_PASSWORD || process.env.POSTGRES_PASSWORD
  let host = env.POSTGRES_HOST || process.env.POSTGRES_HOST
  const port = env.POSTGRES_PORT || process.env.POSTGRES_PORT
  const db = env.POSTGRES_DB || process.env.POSTGRES_DB

  if (host === "host.docker.internal") host = "127.0.0.1"
  if (!user || !password || !host || !port || !db) {
    throw new Error("Missing Postgres connection info (POSTGRES_USER/PASSWORD/HOST/PORT/DB)")
  }

  const url =
    "postgresql://" +
    encodeURIComponent(user) +
    ":" +
    encodeURIComponent(password) +
    "@" +
    host +
    ":" +
    port +
    "/" +
    db

  const c = new Client({ connectionString: url })
  await c.connect()
  try {
    await c.query("ALTER TABLE model_messages ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'none';")
    await c.query(
      "UPDATE model_messages SET status = CASE WHEN role = $1 THEN $2 ELSE $3 END WHERE status IS NULL;",
      ["assistant", "success", "none"]
    )
    await c.query("ALTER TABLE model_messages ALTER COLUMN status SET DEFAULT 'none';")
    await c.query("ALTER TABLE model_messages ALTER COLUMN status SET NOT NULL;")
    const chk = await c.query("SELECT 1 FROM pg_constraint WHERE conname = 'chk_model_messages_status' LIMIT 1;")
    if (chk.rowCount === 0) {
      await c.query(
        "ALTER TABLE model_messages ADD CONSTRAINT chk_model_messages_status CHECK (status IN ('none', 'in_progress', 'success', 'failed', 'stopped'));"
      )
    }
    console.log("[OK] model_messages.status added/updated")
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error("[FAIL]", e)
  process.exit(1)
})
