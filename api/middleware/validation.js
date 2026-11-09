const MAX_INT = 2147483647 // PostgreSQL INTEGER

const badRequest = (message) => {
  const error = new Error(message)
  error.status = 400
  return error
}

// Parses an optional positive integer (route or query parameter).
// Returns defaultValue when the value is missing, throws 400 when it is invalid.
const parsePositiveInt = (value, name, { defaultValue = null, max = MAX_INT, min = 1 } = {}) => {
  if (value === undefined || value === '') return defaultValue
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw badRequest(`${name} must be an integer`)
  }
  const number = Number(value)
  if (number < min || number > max) {
    throw badRequest(`${name} must be between ${min} and ${max}`)
  }
  return number
}

// limit/offset for list endpoints.
const parsePagination = (query, { defaultLimit = 20, maxLimit = 50 } = {}) => ({
  limit: parsePositiveInt(query.limit, 'limit', { defaultValue: defaultLimit, max: maxLimit }),
  offset: parsePositiveInt(query.offset, 'offset', { defaultValue: 0, min: 0 }),
})

export { badRequest, parsePositiveInt, parsePagination }
