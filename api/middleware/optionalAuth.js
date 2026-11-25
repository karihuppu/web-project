import requireAuth from './requireAuth.js'

// For pages that guests may also open (e.g. a public group):
//   * no Authorization header -> guest (req.userId stays undefined),
//   * a header is sent -> it must be valid, exactly like requireAuth (otherwise 401),
//     so an expired session is not silently shown as a guest view.
const optionalAuth = (req, res, next) => {
  if (!req.get('authorization')) return next()
  return requireAuth(req, res, next)
}

export default optionalAuth
