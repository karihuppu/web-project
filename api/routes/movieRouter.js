import { Router } from 'express'
import { listMovies, getMovie, listMovieReviews } from '../controllers/MovieController.js'

const router = Router()

router.get('/', listMovies)
router.get('/:id', getMovie)
router.get('/:id/reviews', listMovieReviews)

export default router
