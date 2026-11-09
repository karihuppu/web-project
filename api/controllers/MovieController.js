import { SORTS, getMovies, getMovieById, getMovieReviews, movieExists } from '../models/Movie.js'
import { badRequest, parsePositiveInt, parsePagination } from '../middleware/validation.js'

const notFound = () => {
  const error = new Error('Movie not found')
  error.status = 404
  return error
}

// GET /api/movies?sort=newest|rating|title&genre=<id>&q=<text>&limit=20&offset=0
const listMovies = async (req, res, next) => {
  try {
    const sort = req.query.sort ?? 'newest'
    if (typeof sort !== 'string' || !Object.hasOwn(SORTS, sort)) {
      throw badRequest(`sort must be one of: ${Object.keys(SORTS).join(', ')}`)
    }

    let search = null
    if (req.query.q !== undefined) {
      if (typeof req.query.q !== 'string') throw badRequest('q must be a string')
      search = req.query.q.trim() || null
      if (search && search.length > 100) throw badRequest('q is too long')
    }

    const { limit, offset } = parsePagination(req.query)
    const genreId = parsePositiveInt(req.query.genre, 'genre')

    const items = await getMovies({ sort, limit, offset, genreId, search })
    res.status(200).json({ items, limit, offset })
  } catch (error) {
    next(error)
  }
}

// GET /api/movies/:id
const getMovie = async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, 'id')
    const movie = await getMovieById(id)
    if (!movie) throw notFound()
    res.status(200).json(movie)
  } catch (error) {
    next(error)
  }
}

// GET /api/movies/:id/reviews?limit=20&offset=0
const listMovieReviews = async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, 'id')
    const { limit, offset } = parsePagination(req.query)
    if (!(await movieExists(id))) throw notFound()

    const items = await getMovieReviews(id, { limit, offset })
    res.status(200).json({ items, limit, offset })
  } catch (error) {
    next(error)
  }
}

export { listMovies, getMovie, listMovieReviews }
