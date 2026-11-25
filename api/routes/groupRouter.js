import { Router } from 'express'
import {
  create,
  mine,
  listPublic,
  show,
  join,
  leave,
  addMember,
  kickMember,
} from '../controllers/GroupController.js'
import requireAuth from '../middleware/requireAuth.js'
import optionalAuth from '../middleware/optionalAuth.js'

const router = Router()

// Public / optional login
router.get('/', listPublic)
router.get('/mine', requireAuth, mine) // before '/:id'
router.get('/:id', optionalAuth, show)

// Signed-in user
router.post('/', requireAuth, create)
router.post('/:id/join', requireAuth, join)
router.delete('/:id/membership', requireAuth, leave)

// Group admin (role checked in the database transaction)
router.post('/:id/members', requireAuth, addMember)
router.delete('/:id/members/:userId', requireAuth, kickMember)

export default router
