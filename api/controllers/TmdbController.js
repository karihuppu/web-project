import { badRequest, parsePositiveInt } from '../middleware/validation.js'
import { localIdsByTmdbIds } from '../models/Movie.js'
import { searchMovies, getMovieDetails, toHttpError } from '../services/tmdbMovies.js'

// TMDB returns at most 500 result pages.
const MAX_PAGE = 500

// GET /api/tmdb/search?q=<full or partial title>&page=1
// Every item has local_id: movies.id when the movie is already in our database, otherwise null.
const search = async (req, res, next) => {
  try {
    if (typeof req.query.q !== 'string') throw badRequest('q is required')
    const q = req.query.q.trim()
    if (!q) throw badRequest('q is required')
    if ([...q].length > 100) throw badRequest('q is too long')
    const page = parsePositiveInt(req.query.page, 'page', { defaultValue: 1, max: MAX_PAGE })

    const result = await searchMovies(q, page)
    const local = await localIdsByTmdbIds(result.items.map((movie) => movie.tmdb_id))
    res.status(200).json({
      ...result,
      items: result.items.map((movie) => ({ ...movie, local_id: local.get(movie.tmdb_id) ?? null })),
    })
  } catch (error) {
    next(toHttpError(error))
  }
}

// GET /api/tmdb/movies/:tmdbId
// When local_id is set the frontend opens /movies/:local_id (reviews live there).
const movie = async (req, res, next) => {
  try {
    const tmdbId = parsePositiveInt(req.params.tmdbId, 'tmdbId')
    // A movie that is already ours does not need TMDB at all.
    const local = await localIdsByTmdbIds([tmdbId])
    if (local.has(tmdbId)) {
      res.status(200).json({ tmdb_id: tmdbId, local_id: local.get(tmdbId) })
      return
    }
    const details = await getMovieDetails(tmdbId)
    res.status(200).json({ ...details, local_id: null })
  } catch (error) {
    next(toHttpError(error))
  }
}

export { search, movie }
