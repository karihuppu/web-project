// PostgreSQL error codes that are caused by client input, mapped to HTTP responses.
// Other database errors are treated as internal errors (500).
const PG_ERRORS = {
  '23505': { status: 409, message: 'Resource already exists' },
  '23001': { status: 409, message: 'Resource is in use and cannot be deleted' },
  '23503': { status: 400, message: 'Referenced resource does not exist' },
  '23514': { status: 400, message: 'Invalid value' },
  '23502': { status: 400, message: 'Required value is missing' },
  '22001': { status: 400, message: 'Value is too long' },
  '22P02': { status: 400, message: 'Invalid input syntax' },
  // Concurrency: deadlock, serialization failure, lock timeout. Safe to retry.
  '40P01': { status: 503, message: 'Palvelu on hetkellisesti kiireinen. Yritä uudelleen.' },
  '40001': { status: 503, message: 'Palvelu on hetkellisesti kiireinen. Yritä uudelleen.' },
  '55P03': { status: 503, message: 'Palvelu on hetkellisesti kiireinen. Yritä uudelleen.' },
}

// Unique constraints that belong to a form field: the frontend shows the text next to that field.
const CONSTRAINT_FIELDS = {
  users_email_lower_uq: { email: 'Tällä sähköpostilla on jo tili.' },
  users_nickname_lower_uq: { nickname: 'Nimimerkki on jo käytössä.' },
}

// Unique constraints with a user-facing message of their own.
const CONSTRAINT_MESSAGES = {
  reviews_user_movie_uq: 'Olet jo arvioinut tämän elokuvan. Voit muokata arviotasi.',
}

const errorHandler = (err, _req, res, _next) => {
  const pgError = PG_ERRORS[err.code]
  const status = pgError?.status ?? (Number.isInteger(err.status) ? err.status : 500)

  if (status >= 500 && !err.expose) {
    // Details only to the server log, never to the client.
    console.error(err)
  }

  const error = {
    message:
      (pgError && CONSTRAINT_MESSAGES[err.constraint]) ??
      pgError?.message ??
      (status >= 500 && !err.expose ? 'Internal server error' : err.message),
    status,
  }
  // Constraint name (e.g. users_email_lower_uq) lets the frontend show a precise message.
  if (pgError && err.constraint) {
    error.constraint = err.constraint
  }
  // Field-level messages: { fields: { email: '…', password: '…' } }
  const fields = err.fields ?? (pgError ? CONSTRAINT_FIELDS[err.constraint] : undefined)
  if (fields) {
    error.fields = fields
  }

  res.status(status).json({ error })
}

export default errorHandler
