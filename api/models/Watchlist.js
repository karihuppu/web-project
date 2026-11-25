import { pool } from './db.js'

export async function listByUser(userId) {
  const { rows } = await pool.query(
    `SELECT w.id, w.name, w.created_at, w.updated_at,
            count(wm.movie_id)::int AS movie_count
     FROM watchlists w
     LEFT JOIN watchlist_movies wm ON wm.watchlist_id = w.id
     WHERE w.user_id = $1
     GROUP BY w.id
     ORDER BY w.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function create(userId, name) {
  const { rows } = await pool.query(
    `INSERT INTO watchlists (user_id, name) VALUES ($1, $2)
     RETURNING id, name, created_at, updated_at`,
    [userId, name]
  );
  return rows[0];
}

export async function findOwned(id, userId) {
  const { rows } = await pool.query(
    `SELECT id, name, created_at, updated_at
     FROM watchlists WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] ?? null;
}

export async function moviesOf(id) {
  const { rows } = await pool.query(
    `SELECT m.*, wm.added_at
     FROM watchlist_movies wm
     JOIN movies m ON m.id = wm.movie_id
     WHERE wm.watchlist_id = $1
     ORDER BY wm.added_at DESC`,
    [id]
  );
  return rows;
}

export async function remove(id, userId) {
  const { rowCount } = await pool.query(
    `DELETE FROM watchlists WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rowCount > 0;
}


export async function addMovie(id, userId, movieId) {
  const list = await findOwned(id, userId);
  if (!list) return null;
  const { rows } = await pool.query(
    `INSERT INTO watchlist_movies (watchlist_id, movie_id) VALUES ($1, $2) RETURNING *`,
    [id, movieId]
  );
  return rows[0];
}


export async function removeMovie(id, userId, movieId) {
  const list = await findOwned(id, userId);
  if (!list) return false;
  const { rowCount } = await pool.query(
    `DELETE FROM watchlist_movies WHERE watchlist_id = $1 AND movie_id = $2`,
    [id, movieId]
  );
  return rowCount > 0;
}