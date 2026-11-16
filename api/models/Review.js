import { pool } from './db.js'

// Same public shape as GET /api/movies/:id/reviews: no email, no password_hash.
const PUBLIC_REVIEW = `
  r.id,
  r.rating,
  r.comment,
  r.created_at,
  r.updated_at,
  json_build_object('id', u.id, 'nickname', u.nickname) AS author`

// Every query is limited to BOTH the movie and the signed-in user,
// so a user can only ever read or change their own review.

const findOwnReview = async (movieId, userId) => {
  const result = await pool.query(
    `SELECT ${PUBLIC_REVIEW}
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.movie_id = $1 AND r.user_id = $2`,
    [movieId, userId],
  )
  return result.rows[0] ?? null
}

// A second review for the same movie fails with 23505 (reviews_user_movie_uq) -> 409.
const createReview = async ({ movieId, userId, rating, comment }) => {
  const result = await pool.query(
    `WITH r AS (
       INSERT INTO reviews (movie_id, user_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       RETURNING *
     )
     SELECT ${PUBLIC_REVIEW} FROM r JOIN users u ON u.id = r.user_id`,
    [movieId, userId, rating, comment],
  )
  return result.rows[0]
}

const updateOwnReview = async ({ movieId, userId, rating, comment }) => {
  const result = await pool.query(
    `WITH r AS (
       UPDATE reviews
       SET rating = $3, comment = $4, updated_at = now()
       WHERE movie_id = $1 AND user_id = $2
       RETURNING *
     )
     SELECT ${PUBLIC_REVIEW} FROM r JOIN users u ON u.id = r.user_id`,
    [movieId, userId, rating, comment],
  )
  return result.rows[0] ?? null
}

const deleteOwnReview = async (movieId, userId) => {
  const result = await pool.query(
    'DELETE FROM reviews WHERE movie_id = $1 AND user_id = $2',
    [movieId, userId],
  )
  return result.rowCount > 0
}

export { findOwnReview, createReview, updateOwnReview, deleteOwnReview }
