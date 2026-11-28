// TMDB search and movie details for the web application (search, external movie page, import).
//
//   * TMDB_READ_TOKEN is read on the server only; without it every call fails with kind 'not_configured'
//     and the rest of the API (catalogue from PostgreSQL, lists, reviews) keeps working.
//   * Texts are asked in Finnish (fi-FI). When TMDB has no Finnish overview, the English (en-US)
//     overview is used. TMDB gives the original title when there is no translated title.
//   * Answers are cached in memory for a short time, so typing the same query again or opening the
//     same movie does not call TMDB every time.
import process from 'node:process'
import { createTmdbClient, TmdbError } from './tmdbClient.js'
import { VALID_POSTER_PATH } from './movieDetailsSync.js'

const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 500
const MAX_SMALLINT = 32767

let client = null
let clientToken = null
let testClient = null

// Tests replace the client with one that talks to a local mock server (null = back to normal).
export const setTmdbClient = (value) => {
  testClient = value
  cache.clear()
}

const getClient = () => {
  if (testClient) return testClient
  const token = process.env.TMDB_READ_TOKEN
  if (!token || !token.trim()) throw new TmdbError('not_configured', 'TMDB_READ_TOKEN is not set')
  if (token !== clientToken) {
    try {
      client = createTmdbClient({ token, timeoutMs: 8000 })
    } catch (error) {
      throw new TmdbError('not_configured', error.message)
    }
    clientToken = token
  }
  return client
}

// --- small in-memory cache (per App Service instance) ---
const cache = new Map()
const cached = async (key, load) => {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value
  const value = await load()
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS })
  return value
}
export const clearTmdbCache = () => cache.clear()

// --- normalising TMDB values to the formats of our movies table ---
const text = (value) => (typeof value === 'string' ? value.trim() : '')
const imagePath = (value) => (VALID_POSTER_PATH.test(text(value)) ? text(value) : null)
const date = (value) => {
  const v = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  return Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? null : v
}
const voteAverage = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10 ? Math.round(value * 10) / 10 : null
const voteCount = (value) => (Number.isInteger(value) && value >= 0 && value <= 2147483647 ? value : null)
const runtime = (value) => (Number.isInteger(value) && value > 0 && value <= MAX_SMALLINT ? value : null)
const validId = (value) => Number.isInteger(value) && value > 0 && value <= 2147483647

const baseFields = (raw) => {
  const title = text(raw.title) || text(raw.original_title)
  return {
    tmdb_id: raw.id,
    title,
    original_title: text(raw.original_title) || null,
    overview: text(raw.overview) || null,
    release_date: date(raw.release_date),
    poster_path: imagePath(raw.poster_path),
    tmdb_vote_average: voteAverage(raw.vote_average),
    tmdb_vote_count: voteCount(raw.vote_count),
  }
}

// GET /search/movie in Finnish. Results without a Finnish overview get the English one from the
// same search in en-US (one extra request, only when needed).
export const searchMovies = (query, page) =>
  cached(`search:${page}:${query.toLowerCase()}`, async () => {
    const tmdb = getClient()
    const fi = await tmdb.searchMovies(query, { language: 'fi-FI', page })
    const results = Array.isArray(fi.results) ? fi.results : []
    const items = results
      .filter((raw) => raw && typeof raw === 'object' && validId(raw.id) && raw.adult !== true)
      .map(baseFields)
      .filter((movie) => movie.title)

    if (items.some((movie) => !movie.overview)) {
      try {
        const en = await tmdb.searchMovies(query, { language: 'en-US', page })
        const english = new Map((Array.isArray(en.results) ? en.results : []).map((raw) => [raw?.id, text(raw?.overview)]))
        for (const movie of items) {
          if (!movie.overview && english.get(movie.tmdb_id)) {
            movie.overview = english.get(movie.tmdb_id)
            movie.overview_language = 'en'
          }
        }
      } catch {
        // The Finnish results are still useful without English overviews.
      }
    }

    const totalPages = Number.isInteger(fi.total_pages) ? Math.min(fi.total_pages, 500) : 1
    return {
      page,
      total_pages: totalPages,
      total_results: Number.isInteger(fi.total_results) ? fi.total_results : items.length,
      items,
    }
  })

// GET /movie/{id} in Finnish, overview from en-US when there is no Finnish one.
// Adult titles are treated as not found (they are excluded from search too).
export const getMovieDetails = (tmdbId) =>
  cached(`movie:${tmdbId}`, async () => {
    const tmdb = getClient()
    const raw = await tmdb.getMovie(tmdbId, 'fi-FI')
    if (raw.adult === true || raw.id !== tmdbId) throw new TmdbError('not_found', 'TMDB has no movie with this id')
    const movie = {
      ...baseFields(raw),
      runtime_minutes: runtime(raw.runtime),
      backdrop_path: imagePath(raw.backdrop_path),
      genres: (Array.isArray(raw.genres) ? raw.genres : [])
        .filter((g) => g && validId(g.id) && text(g.name))
        .map((g) => ({ tmdb_id: g.id, name: text(g.name) })),
    }
    if (!movie.title) throw new TmdbError('invalid_response', 'TMDB movie has no title')
    if (!movie.overview) {
      try {
        const en = await tmdb.getMovie(tmdbId, 'en-US')
        if (text(en.overview)) {
          movie.overview = text(en.overview)
          movie.overview_language = 'en'
        }
      } catch {
        // Keep the movie without an overview.
      }
    }
    return movie
  })

// TMDB failures as HTTP errors with Finnish messages. expose = the message may be shown to the user.
export const toHttpError = (error) => {
  if (!(error instanceof TmdbError)) return error
  const http = new Error(
    error.kind === 'not_found'
      ? 'Elokuvaa ei löytynyt TMDB:stä.'
      : 'Elokuvahaku TMDB:stä ei ole juuri nyt käytettävissä. Oman valikoimamme elokuvat toimivat normaalisti. Yritä hetken päästä uudelleen.',
  )
  http.status = error.kind === 'not_found' ? 404 : 503
  http.expose = true
  if (http.status === 503) {
    // Only the kind and the technical message go to the server log, never the token.
    console.error(`TMDB request failed: ${error.kind}: ${error.message}`)
  }
  return http
}
