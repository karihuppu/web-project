import { pool } from './db.js'

const getAllGenres = async () => {
  const result = await pool.query('SELECT id, tmdb_id, name FROM genres ORDER BY name')
  return result.rows
}

export { getAllGenres }
