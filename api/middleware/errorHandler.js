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
}

const errorHandler = (err, _req, res, _next) => {
  const pgError = PG_ERRORS[err.code]
  const status = pgError?.status ?? (Number.isInteger(err.status) ? err.status : 500)

  if (status >= 500) {
    // Details only to the server log, never to the client.
    console.error(err)
  }

  const error = {
    message: pgError?.message ?? (status >= 500 ? 'Internal server error' : err.message),
    status,
  }
  // Constraint name (e.g. users_email_lower_uq) lets the frontend show a precise message.
  if (pgError && err.constraint) {
    error.constraint = err.constraint
  }

  res.status(status).json({ error })
}

export default errorHandler
