import jwt from 'jsonwebtoken'
import { getJwtSecret, JWT_ALGORITHM } from '../config/auth.js'
import { userExists } from '../models/User.js'

const unauthorized = () => {
  const error = new Error('Kirjaudu sisään jatkaaksesi.')
  error.status = 401
  return error
}

// Checks "Authorization: Bearer <token>", that the account still exists,
// and stores the user id in req.userId.
// A token of a deleted account -> 401. A database failure is NOT turned into 401:
// it goes to errorHandler as 500/503, so it is not mistaken for a bad token.
// Note: the account can still be deleted after this check; writes are protected by the
// foreign keys and row locks in the database (see docs/api.md, "Tilin poisto").
const requireAuth = async (req, _res, next) => {
  try {
    const header = req.get('authorization') || ''
    const [scheme, token] = header.split(' ')
    if (scheme !== 'Bearer' || !token) throw unauthorized()

    let payload
    try {
      payload = jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] })
    } catch (error) {
      if (error.status) throw error // 503: auth not configured
      throw unauthorized() // expired, malformed or wrong signature
    }

    const userId = Number(payload.sub)
    if (!Number.isSafeInteger(userId) || userId <= 0) throw unauthorized()
    if (!(await userExists(userId))) throw unauthorized()

    req.userId = userId
    next()
  } catch (error) {
    next(error)
  }
}

export default requireAuth
