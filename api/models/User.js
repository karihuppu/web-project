import { pool } from './db.js'

// Columns that are safe to send to the client (never password_hash).
const PUBLIC_COLUMNS = 'id, email, nickname, created_at'

const findUserByEmail = async (email) => {
  const result = await pool.query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE lower(email) = lower($1)`,
    [email],
  )
  return result.rows[0] ?? null
}

const findUserById = async (id) => {
  const result = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id])
  return result.rows[0] ?? null
}

// Unique violations (email / nickname, case-insensitive) are raised by the database
// and turned into 409 responses by errorHandler.
const createUser = async ({ email, nickname, passwordHash }) => {
  const result = await pool.query(
    `INSERT INTO users (email, nickname, password_hash)
     VALUES ($1, $2, $3)
     RETURNING ${PUBLIC_COLUMNS}`,
    [email, nickname, passwordHash],
  )
  return result.rows[0]
}

export { findUserByEmail, findUserById, createUser }
