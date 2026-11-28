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

// Same movie fields and formats as /api/movies (api/models/Movie.js):
// release_date as 'YYYY-MM-DD' text (no time zone shift), tmdb_vote_average as a number.
export async function moviesOf(id) {
  const { rows } = await pool.query(
    `SELECT m.id,
            m.tmdb_id,
            m.title,
            m.original_title,
            m.release_date::text AS release_date,
            m.runtime_minutes,
            m.poster_path,
            m.tmdb_vote_average::float8 AS tmdb_vote_average,
            wm.added_at
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


// The movie is already in our database: movies.id for this TMDB id, or null.
export async function localMovieId(tmdbId) {
  const { rows } = await pool.query(`SELECT id FROM movies WHERE tmdb_id = $1`, [tmdbId]);
  return rows[0]?.id ?? null;
}

// Adds a movie to the user's list by TMDB id. `movie` = TMDB details fetched BEFORE this call
// (no network request inside the transaction), or null when the movie is already ours.
//
// Concurrency (READ COMMITTED):
//   * the list row is locked (FOR KEY SHARE) and its owner checked again, so a list that was
//     deleted or is not the user's never gets the movie;
//   * movies_tmdb_id_uq + ON CONFLICT DO NOTHING: parallel imports create one movies row; the loser
//     waits for the winner's commit and then reads its id;
//   * the watchlist_movies primary key + ON CONFLICT DO NOTHING: the same movie is on a list once.
// Returns { status: 'not_found' } | { status: 'needs_details' } | { status: 'added'|'exists', item, created }
export async function addTmdbMovie(id, userId, tmdbId, movie) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query(
      `SELECT id FROM watchlists WHERE id = $1 AND user_id = $2 FOR KEY SHARE`,
      [id, userId]
    );
    if (!owned.rowCount) {
      await client.query("ROLLBACK");
      return { status: "not_found" };
    }

    let created = false;
    let movieId = (await client.query(`SELECT id FROM movies WHERE tmdb_id = $1`, [tmdbId])).rows[0]?.id;
    if (!movieId) {
      if (!movie) {
        // Removed meanwhile (not possible today: reviews and lists RESTRICT deletes); fetch details first.
        await client.query("ROLLBACK");
        return { status: "needs_details" };
      }
      const inserted = await client.query(
        `INSERT INTO movies (tmdb_id, title, original_title, overview, release_date, runtime_minutes,
                             poster_path, backdrop_path, tmdb_vote_average, tmdb_vote_count, tmdb_synced_at)
         VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, now())
         ON CONFLICT (tmdb_id) DO NOTHING
         RETURNING id`,
        [tmdbId, movie.title, movie.original_title, movie.overview, movie.release_date, movie.runtime_minutes,
         movie.poster_path, movie.backdrop_path, movie.tmdb_vote_average, movie.tmdb_vote_count]
      );
      if (inserted.rowCount) {
        created = true;
        movieId = inserted.rows[0].id;
        // Genres that exist in our genres table (matched by TMDB genre id); others are skipped.
        await client.query(
          `INSERT INTO movie_genres (movie_id, genre_id)
           SELECT $1, g.id FROM genres g WHERE g.tmdb_id = ANY($2::int[])
           ON CONFLICT DO NOTHING`,
          [movieId, movie.genres.map((g) => g.tmdb_id)]
        );
      } else {
        movieId = (await client.query(`SELECT id FROM movies WHERE tmdb_id = $1`, [tmdbId])).rows[0].id;
      }
    }

    const link = await client.query(
      `INSERT INTO watchlist_movies (watchlist_id, movie_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING *`,
      [id, movieId]
    );
    await client.query("COMMIT");
    if (!link.rowCount) return { status: "exists", movieId, created };
    return { status: "added", item: link.rows[0], movieId, created };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
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