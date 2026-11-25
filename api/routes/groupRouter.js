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
  searchPrivate,
  requestToJoin,
  listRequests,
  approveRequest,
  rejectRequest,
} from '../controllers/GroupController.js'
import requireAuth from '../middleware/requireAuth.js'
import optionalAuth from '../middleware/optionalAuth.js'

const router = Router()

// Public / optional login
router.get('/', listPublic)
router.get('/mine', requireAuth, mine) // before '/:id'
router.get('/private', requireAuth, searchPrivate) // before '/:id'
router.get('/:id', optionalAuth, show)

// Signed-in user
router.post('/', requireAuth, create)
router.post('/:id/join', requireAuth, join)
router.delete('/:id/membership', requireAuth, leave)
router.post('/:id/requests', requireAuth, requestToJoin)

// Group admin (role checked in the database transaction)
router.post('/:id/members', requireAuth, addMember)
router.delete('/:id/members/:userId', requireAuth, kickMember)
router.get('/:id/requests', requireAuth, listRequests)
router.post('/:id/requests/:requestId/approve', requireAuth, approveRequest)
router.post('/:id/requests/:requestId/reject', requireAuth, rejectRequest)

export default router
