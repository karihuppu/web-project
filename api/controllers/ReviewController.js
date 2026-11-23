import { movieExists } from '../models/Movie.js'
import { findOwnReview, createReview, updateOwnReview, deleteOwnReview } from '../models/Review.js'
import { parsePositiveInt } from '../middleware/validation.js'
import { userExists } from '../models/User.js'

// The author is ALWAYS req.userId from the verified JWT (requireAuth).
// Fields such as user_id or author in the request body are ignored.

const COMMENT_MAX = 2000 // same limit as reviews_comment_chk

const httpError = (status, message, fields) =>
  Object.assign(new Error(message), { status, ...(fields ? { fields } : {}) })

const movieNotFound = () => httpError(404, 'Elokuvaa ei löytynyt.')
const noOwnReview = () => httpError(404, 'Et ole vielä arvioinut tätä elokuvaa.')
const signedOut = () => httpError(401, 'Kirjaudu sisään jatkaaksesi.')

// Nothing matched the user's own row. If the account was deleted meanwhile
// (after requireAuth), answer 401 instead of "no review".
const noOwnReviewOrSignedOut = async (userId) =>
  (await userExists(userId)) ? noOwnReview() : signedOut()

// rating: a JSON number 1-5 without decimals. Strings like "5" are rejected on purpose.
// comment: optional string; trimmed; empty -> null; longer than the limit -> error (never cut).
const parseReviewBody = (body) => {
  const { rating, comment } = body ?? {}
  const fields = {}

  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    fields.rating = 'Valitse arvosana 1–5 tähteä.'
  }

  let cleanComment = null
  if (comment !== undefined && comment !== null) {
    if (typeof comment !== 'string') {
      fields.comment = 'Kommentin pitää olla tekstiä.'
    } else {
      const trimmed = comment.trim()
      // Count characters like PostgreSQL char_length (code points, not UTF-16 units).
      if ([...trimmed].length > COMMENT_MAX) {
        fields.comment = `Kommentti saa olla enintään ${COMMENT_MAX} merkkiä.`
      }
      cleanComment = trimmed || null
    }
  }

  if (Object.keys(fields).length) throw httpError(400, 'Tarkista arvostelun tiedot.', fields)
  return { rating, comment: cleanComment }
}

// Validates :id and checks that the movie exists.
const requireMovie = async (req) => {
  const movieId = parsePositiveInt(req.params.id, 'id')
  if (!(await movieExists(movieId))) throw movieNotFound()
  return movieId
}

// The token can outlive the account: a deleted user cannot write reviews.
const translateWriteError = (error) => {
  if (error.code === '23503' && error.constraint === 'reviews_user_id_fkey') {
    return signedOut()
  }
  if (error.code === '23503' && error.constraint === 'reviews_movie_id_fkey') {
    return movieNotFound()
  }
  return error
}

// GET /api/movies/:id/review -> 200 { review } (review is null when there is none)
const getMyReview = async (req, res, next) => {
  try {
    const movieId = await requireMovie(req)
    res.status(200).json({ review: await findOwnReview(movieId, req.userId) })
  } catch (error) {
    next(error)
  }
}

// POST /api/movies/:id/reviews { rating, comment } -> 201 review; second time -> 409
const createMyReview = async (req, res, next) => {
  try {
    const movieId = await requireMovie(req)
    const { rating, comment } = parseReviewBody(req.body)
    const review = await createReview({ movieId, userId: req.userId, rating, comment })
    res.status(201).json(review)
  } catch (error) {
    next(translateWriteError(error))
  }
}

// PUT /api/movies/:id/review { rating, comment } -> 200 review; no own review -> 404
const updateMyReview = async (req, res, next) => {
  try {
    const movieId = await requireMovie(req)
    const { rating, comment } = parseReviewBody(req.body)
    const review = await updateOwnReview({ movieId, userId: req.userId, rating, comment })
    if (!review) throw await noOwnReviewOrSignedOut(req.userId)
    res.status(200).json(review)
  } catch (error) {
    next(translateWriteError(error))
  }
}

// DELETE /api/movies/:id/review -> 204; no own review -> 404
const deleteMyReview = async (req, res, next) => {
  try {
    const movieId = await requireMovie(req)
    if (!(await deleteOwnReview(movieId, req.userId))) throw await noOwnReviewOrSignedOut(req.userId)
    res.status(204).end()
  } catch (error) {
    next(error)
  }
}

export { getMyReview, createMyReview, updateMyReview, deleteMyReview }
