import process from 'node:process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pkg from 'pg'

dotenv.config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
})

const { Pool } = pkg

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: true }
    : false,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000,
})

pool.on('error', (error) => {
  console.error('Unexpected database pool error:', error)
})

export { pool }