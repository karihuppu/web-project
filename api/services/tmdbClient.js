// Minimal server-side TMDB client (https://developer.themoviedb.org/reference/movie-details).
// Uses the API Read Access Token as a Bearer token. The token is never logged.

const DEFAULT_BASE_URL = 'https://api.themoviedb.org/3'

// The API Read Access Token is a JWT: letters, digits, '-', '_' and '.' only (starts with "eyJ").
const TOKEN_FORMAT = /^[A-Za-z0-9._-]+$/

export class TmdbError extends Error {
  constructor(kind, message) {
    super(message)
    // 'timeout' | 'network' | 'unauthorized' | 'not_found' | 'http' | 'invalid_response'
    this.kind = kind
  }
}

// Removes whitespace and line breaks that often come with copy-paste, then checks the format,
// so a broken token gives a clear error instead of "TMDB could not be reached".
export const normalizeToken = (token) => {
  const clean = typeof token === 'string' ? token.replace(/\s+/g, '') : ''
  if (!clean) {
    throw new Error('TMDB_READ_TOKEN must be set (API Read Access Token from TMDB account settings)')
  }
  if (!TOKEN_FORMAT.test(clean)) {
    throw new Error(
      'TMDB_READ_TOKEN contains characters that cannot be in a token. Copy the "API Read Access Token" ' +
      '(a long value starting with "eyJ") from https://www.themoviedb.org/settings/api and paste it again.',
    )
  }
  return clean
}

// baseUrl is a parameter only for tests (local mock server); the command uses the real API.
export const createTmdbClient = ({ token, baseUrl = DEFAULT_BASE_URL, timeoutMs = 10000 } = {}) => {
  const bearer = normalizeToken(token)

  // GET /movie/{movie_id}?language=fi-FI -> parsed JSON object
  const getMovie = async (tmdbId, language) => {
    const url = `${baseUrl}/movie/${encodeURIComponent(tmdbId)}?language=${encodeURIComponent(language)}`
    let response
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new TmdbError('timeout', `TMDB did not answer within ${timeoutMs} ms`)
      }
      // e.g. ENOTFOUND (DNS), ECONNREFUSED, certificate problems. Never includes the token.
      const code = error.cause?.code ?? error.cause?.name ?? error.name
      throw new TmdbError('network', `TMDB could not be reached (${code})`)
    }

    if (response.status === 401) {
      throw new TmdbError(
        'unauthorized',
        'TMDB rejected the token (HTTP 401). Check that TMDB_READ_TOKEN is the "API Read Access Token", not the short API Key.',
      )
    }
    if (response.status === 404) throw new TmdbError('not_found', 'TMDB has no movie with this id')
    if (!response.ok) throw new TmdbError('http', `TMDB answered HTTP ${response.status}`)

    let data
    try {
      data = await response.json()
    } catch {
      throw new TmdbError('invalid_response', 'TMDB returned an empty or invalid response')
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TmdbError('invalid_response', 'TMDB returned an empty or invalid response')
    }
    return data
  }

  return { getMovie }
}
