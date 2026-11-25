// Shared connection settings for the manual command-line tools (migrations, TMDB import).
// The web application uses api/models/db.js; these tools open their own short-lived connection.
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// Same .env as the application. Variables already set in the shell win.
dotenv.config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
})

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'database'])

export const getConfig = (applicationName) => {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL } = process.env
  if (!DB_HOST || !DB_NAME || !DB_USER) {
    throw new Error('DB_HOST, DB_NAME and DB_USER must be set (.env or shell environment)')
  }
  return {
    host: DB_HOST,
    port: Number(DB_PORT || 5432),
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
    connectionTimeoutMillis: 10000,
    application_name: applicationName,
  }
}

// Printed before anything else, so the operator sees where the command will connect.
export const describeTarget = (config) =>
  `Target: ${config.user}@${config.host}:${config.port}/${config.database} (ssl ${config.ssl ? 'on' : 'off'})`

// Writing to a non-local database (e.g. Azure) needs --confirm=<DB_NAME>.
export const requireConfirmation = (config, flags) => {
  if (LOCAL_HOSTS.has(config.host)) return
  const confirm = flags.find((flag) => flag.startsWith('--confirm='))?.slice('--confirm='.length)
  if (confirm !== config.database) {
    throw new Error(
      `Refusing to write to non-local database "${config.database}" on ${config.host}. ` +
      `Re-run with --confirm=${config.database} if this is intended.`,
    )
  }
}
