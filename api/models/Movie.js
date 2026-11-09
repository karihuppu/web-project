import { pool } from './db.js'

// Allowed sort orders. Values are fixed SQL fragments, never user input.
const SORTS = {
  newest: 'm.release_date DESC NULLS LAST, m.id DESC',
  rating: 'm.tmdb_vote_average DESC NULLS LAST, m.id DESC',
  title: 'm.title ASC, m.id ASC',
}

// release_date as 'YYYY-MM-DD' text (avoids time zone shifts in JSON),
// tmdb_vote_average as a number (NUMERIC is returned as a string by pg).
const MOVIE_COLUMNS = `
  m.id,
  m.tmdb_id,
  m.title,
  m.original_title,
  m.release_date::text AS release_date,
  m.runtime_minutes,
  m.poster_path,
  m.backdrop_path,
  m.tmdb_vote_average::float8 AS tmdb_vote_average,
  m.tmdb_vote_count`

const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`)

const getMovies = async ({ sort = 'newest', limit = 20, offset = 0, genreId = null, search = null }) => {
  const result = await pool.query(
    `SELECT ${MOVIE_COLUMNS},
            COALESCE(
              (SELECT array_agg(g.name ORDER BY g.name)
               FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id
               WHERE mg.movie_id = m.id),
              '{}'
            ) AS genres
     FROM movies m
     WHERE ($1::int IS NULL OR EXISTS (
             SELECT 1 FROM movie_genres mg WHERE mg.movie_id = m.id AND mg.genre_id = $1))
       AND ($2::text IS NULL OR m.title ILIKE '%' || $2 || '%' OR m.original_title ILIKE '%' || $2 || '%')
     ORDER BY ${SORTS[sort]}
     LIMIT $3 OFFSET $4`,
    [genreId, search === null ? null : escapeLike(search), limit, offset],
  )
  return result.rows
}

const getMovieById = async (id) => {
  const result = await pool.query(
    `SELECT ${MOVIE_COLUMNS},
            m.overview,
            COALESCE(
              (SELECT json_agg(json_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
               FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id
               WHERE mg.movie_id = m.id),
              '[]'
            ) AS genres,
            (SELECT count(*)::int FROM reviews r WHERE r.movie_id = m.id) AS review_count
     FROM movies m
     WHERE m.id = $1`,
    [id],
  )
  return result.rows[0] ?? null
}

// Reviews of a movie, newest first. author is null when the account was deleted.
const getMovieReviews = async (movieId, { limit = 20, offset = 0 }) => {
  const result = await pool.query(
    `SELECT r.id,
            r.rating,
            r.comment,
            r.created_at,
            r.updated_at,
            CASE WHEN u.id IS NULL THEN NULL
                 ELSE json_build_object('id', u.id, 'nickname', u.nickname)
            END AS author
     FROM reviews r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.movie_id = $1
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $2 OFFSET $3`,
    [movieId, limit, offset],
  )
  return result.rows
}

const movieExists = async (id) => {
  const result = await pool.query('SELECT 1 FROM movies WHERE id = $1', [id])
  return result.rowCount > 0
}

export { SORTS, getMovies, getMovieById, getMovieReviews, movieExists }
