import { Router } from 'express'
import optionalAuth from '../middleware/optionalAuth.js'
import requireAuth from '../middleware/requireAuth.js'
import * as C from '../controllers/WatchlistShareController.js'

const router = Router({ mergeParams: true }) 

router.get('/', optionalAuth, C.groupLists)
router.get('/:id', optionalAuth, C.groupList)
router.post('/:id/copy', requireAuth, C.copy)

export default router