import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { BCRYPT_COST, TOKEN_TTL, JWT_ALGORITHM, getJwtSecret } from '../config/auth.js'
import { createUser, findUserByEmail, findUserById } from '../models/User.js'

// Same rules as the frontend (src/auth/AuthPages.jsx), so messages match.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NICKNAME_MIN = 3
const NICKNAME_MAX = 20
const PASSWORD_MIN = 8
const PASSWORD_MAX_BYTES = 72 // bcrypt ignores everything after 72 bytes

// Used when the email is unknown, so a failed login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('timing-protection-only', BCRYPT_COST)

const validationError = (fields) => {
  const error = new Error('Tarkista syöttämäsi tiedot.')
  error.status = 400
  error.fields = fields
  return error
}

const invalidCredentials = () => {
  const error = new Error('Väärä sähköposti tai salasana.')
  error.status = 401
  return error
}

const text = (value) => (typeof value === 'string' ? value : '')

const normalizeEmail = (value) => text(value).trim().toLowerCase()

const checkEmail = (email, fields) => {
  if (!email) fields.email = 'Syötä sähköpostiosoite.'
  else if (email.length > 254 || !EMAIL.test(email)) fields.email = 'Sähköpostiosoite ei ole kelvollinen.'
}

const signToken = (userId) =>
  jwt.sign({}, getJwtSecret(), {
    subject: String(userId),
    expiresIn: TOKEN_TTL,
    algorithm: JWT_ALGORITHM,
  })

// Seed users have a placeholder hash ("!…") that must never match.
const passwordMatches = (password, hash) =>
  typeof hash === 'string' && hash.startsWith('$2') ? bcrypt.compare(password, hash) : Promise.resolve(false)

const toPublicUser = ({ id, email, nickname, created_at }) => ({ id, email, nickname, created_at })

// POST /api/auth/register { email, nickname, password } -> 201 { token, user }
const register = async (req, res, next) => {
  try {
    const body = req.body ?? {}
    const email = normalizeEmail(body.email)
    const nickname = text(body.nickname).trim()
    const password = text(body.password)

    const fields = {}
    checkEmail(email, fields)
    if (nickname.length < NICKNAME_MIN) fields.nickname = 'Nimimerkissä pitää olla vähintään 3 merkkiä.'
    else if (nickname.length > NICKNAME_MAX) fields.nickname = 'Nimimerkki saa olla enintään 20 merkkiä.'
    if (password.length < PASSWORD_MIN) fields.password = 'Salasanassa pitää olla vähintään 8 merkkiä.'
    else if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) fields.password = 'Salasana on liian pitkä.'
    if (Object.keys(fields).length) throw validationError(fields)

    getJwtSecret() // fail with 503 before creating an account that cannot log in

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
    const user = await createUser({ email, nickname, passwordHash })
    res.status(201).json({ token: signToken(user.id), user: toPublicUser(user) })
  } catch (error) {
    next(error)
  }
}

// POST /api/auth/login { email, password } -> 200 { token, user }
const login = async (req, res, next) => {
  try {
    const body = req.body ?? {}
    const email = normalizeEmail(body.email)
    const password = text(body.password)

    const fields = {}
    checkEmail(email, fields)
    if (!password) fields.password = 'Syötä salasana.'
    if (Object.keys(fields).length) throw validationError(fields)

    getJwtSecret()

    const user = await findUserByEmail(email)
    const ok = await passwordMatches(password, user ? user.password_hash : DUMMY_HASH)
    if (!user || !ok) throw invalidCredentials()

    res.status(200).json({ token: signToken(user.id), user: toPublicUser(user) })
  } catch (error) {
    next(error)
  }
}

// GET /api/auth/me (Authorization: Bearer <token>) -> 200 { user }
const me = async (req, res, next) => {
  try {
    const user = await findUserById(req.userId)
    if (!user) {
      // Account was deleted after the token was issued.
      const error = new Error('Kirjaudu sisään jatkaaksesi.')
      error.status = 401
      throw error
    }
    res.status(200).json({ user: toPublicUser(user) })
  } catch (error) {
    next(error)
  }
}

export { register, login, me }
