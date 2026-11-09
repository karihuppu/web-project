import { getAllGenres } from '../models/Genre.js'

// GET /api/genres
const listGenres = async (_req, res, next) => {
  try {
    res.status(200).json(await getAllGenres())
  } catch (error) {
    next(error)
  }
}

export { listGenres }
