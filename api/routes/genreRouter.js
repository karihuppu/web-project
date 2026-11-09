import { Router } from 'express'
import { listGenres } from '../controllers/GenreController.js'

const router = Router()

router.get('/', listGenres)

export default router
