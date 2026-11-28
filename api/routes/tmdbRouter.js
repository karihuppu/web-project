import { Router } from 'express'
import { search, movie } from '../controllers/TmdbController.js'

// Public: search and movie details come from TMDB through our server (the token stays here).
const router = Router()

router.get('/search', search)
router.get('/movies/:tmdbId', movie)

export default router
