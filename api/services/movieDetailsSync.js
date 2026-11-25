// Fills poster_path and missing overviews of movies that already exist in our database (issue #3).
//
// Rules:
//   * only movies already in `movies` (matched by tmdb_id); nothing is inserted or deleted,
//     movies.id, reviews and watchlist links are untouched;
//   * poster_path: saved when TMDB returns a valid relative path ("/abc123.jpg"); a missing or
//     invalid value never clears an existing poster;
//   * overview: only an EMPTY overview is filled, first from fi-FI, then from en-US;
//     an existing text (e.g. our short Finnish description) is never overwritten;
//   * any TMDB error (timeout, HTTP error, empty response) keeps the current data of that movie.

export const VALID_POSTER_PATH = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i

const text = (value) => (typeof value === 'string' ? value.trim() : '')

export const syncMovieDetails = async ({ db, tmdb, dryRun = false, onlyTmdbIds = null, log = console.log }) => {
  const params = []
  let where = ''
  if (onlyTmdbIds?.length) {
    params.push(onlyTmdbIds)
    where = 'WHERE tmdb_id = ANY($1::int[])'
  }
  const { rows: movies } = await db.query(
    `SELECT id, tmdb_id, title, overview, poster_path FROM movies ${where} ORDER BY id`,
    params,
  )

  const summary = { checked: 0, updated: 0, unchanged: 0, errors: 0 }

  for (const movie of movies) {
    summary.checked += 1
    const label = `#${movie.id} "${movie.title}" (tmdb ${movie.tmdb_id})`

    let fi
    try {
      fi = await tmdb.getMovie(movie.tmdb_id, 'fi-FI')
    } catch (error) {
      // A rejected token fails for every movie: stop at once with the hint, nothing has been written.
      if (error.kind === 'unauthorized') throw error
      summary.errors += 1
      log(`  ERROR      ${label}: ${error.message}; data kept`)
      continue
    }

    const changes = {}

    const poster = text(fi.poster_path)
    if (poster && VALID_POSTER_PATH.test(poster) && poster !== movie.poster_path) {
      changes.poster_path = poster
    } else if (poster && !VALID_POSTER_PATH.test(poster)) {
      log(`  WARNING    ${label}: ignored invalid poster_path from TMDB`)
    }

    if (!text(movie.overview)) {
      let overview = text(fi.overview)
      let language = 'fi-FI'
      if (!overview) {
        try {
          overview = text((await tmdb.getMovie(movie.tmdb_id, 'en-US')).overview)
          language = 'en-US'
        } catch (error) {
          summary.errors += 1
          log(`  ERROR      ${label}: en-US overview: ${error.message}; overview kept empty`)
        }
      }
      if (overview) {
        changes.overview = overview
        changes.language = language
      }
    }

    if (!changes.poster_path && !changes.overview) {
      summary.unchanged += 1
      log(`  unchanged  ${label}`)
      continue
    }

    const parts = []
    if (changes.poster_path) parts.push(`poster ${movie.poster_path ?? '(none)'} -> ${changes.poster_path}`)
    if (changes.overview) parts.push(`overview filled (${changes.language}, ${changes.overview.length} chars)`)

    if (!dryRun) {
      try {
        // The CASE keeps an overview that someone wrote meanwhile; COALESCE keeps the old poster.
        await db.query(
          `UPDATE movies
           SET poster_path = COALESCE($2, poster_path),
               overview = CASE
                 WHEN (overview IS NULL OR btrim(overview) = '') AND $3::text IS NOT NULL THEN $3
                 ELSE overview
               END,
               tmdb_synced_at = now(),
               updated_at = now()
           WHERE id = $1`,
          [movie.id, changes.poster_path ?? null, changes.overview ?? null],
        )
      } catch (error) {
        summary.errors += 1
        log(`  ERROR      ${label}: database update failed (${error.code ?? error.message}); data kept`)
        continue
      }
    }
    summary.updated += 1
    log(`  ${dryRun ? 'would set ' : 'updated   '} ${label}: ${parts.join('; ')}`)
  }

  return summary
}
