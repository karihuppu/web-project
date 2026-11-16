import { Router } from 'express'
import { listMovies, getMovie, listMovieReviews } from '../controllers/MovieController.js'
import {
  getMyReview,
  createMyReview,
  updateMyReview,
  deleteMyReview,
} from '../controllers/ReviewController.js'
import requireAuth from '../middleware/requireAuth.js'

const router = Router()

// Public
router.get('/', listMovies)
router.get('/:id', getMovie)
router.get('/:id/reviews', listMovieReviews)

// Own review of the signed-in user (author comes from the JWT)
router.post('/:id/reviews', requireAuth, createMyReview)
router.get('/:id/review', requireAuth, getMyReview)
router.put('/:id/review', requireAuth, updateMyReview)
router.delete('/:id/review', requireAuth, deleteMyReview)

export default router
