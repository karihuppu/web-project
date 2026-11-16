import process from 'node:process'

// Settings for password hashing and JSON Web Tokens.
// JWT_SECRET comes from the environment (.env locally, App Settings in Azure).

export const BCRYPT_COST = 10 // ~100 ms per hash; Free F1 has limited CPU time
export const TOKEN_TTL = '24h' // a token stays valid until it expires (no server-side logout)
export const JWT_ALGORITHM = 'HS256'

const MIN_SECRET_LENGTH = 32

export const isAuthConfigured = () =>
  typeof process.env.JWT_SECRET === 'string' && process.env.JWT_SECRET.length >= MIN_SECRET_LENGTH

// Read on every call, so a missing secret disables auth instead of crashing the whole app.
export const getJwtSecret = () => {
  if (!isAuthConfigured()) {
    const error = new Error('Kirjautuminen ei ole juuri nyt käytettävissä.')
    error.status = 503
    error.expose = true // safe, user-facing message
    console.error('JWT_SECRET is missing or shorter than 32 characters')
    throw error
  }
  return process.env.JWT_SECRET
}
