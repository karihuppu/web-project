import jwt from 'jsonwebtoken'
import { getJwtSecret, JWT_ALGORITHM } from '../config/auth.js'

const unauthorized = () => {
  const error = new Error('Kirjaudu sisään jatkaaksesi.')
  error.status = 401
  return error
}

// Checks "Authorization: Bearer <token>" and stores the user id in req.userId.
const requireAuth = (req, _res, next) => {
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
    req.userId = userId
    next()
  } catch (error) {
    next(error)
  }
}

export default requireAuth
