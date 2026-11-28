import * as Watchlist from "../models/Watchlist.js";
import { parsePositiveInt } from "../middleware/validation.js";
import { getMovieDetails, toHttpError } from "../services/tmdbMovies.js";

const fail = (res, status, message) =>
  res.status(status).json({ error: { message, status } }); // matches the format your frontend parses

// Same rules as the rest of the API: digits only, 1..2147483647 (PostgreSQL INTEGER).
// A larger id used to reach the database and answer 500. JSON numbers in the body are accepted too.
const toId = (v) => {
  const value = typeof v === "number" && Number.isInteger(v) ? String(v) : v;
  try {
    return parsePositiveInt(value, "id");
  } catch {
    return null;
  }
};

export async function list(req, res, next) {
  try {
    res.json({ watchlists: await Watchlist.listByUser(req.userId) });
  } catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (name.length < 1 || name.length > 100) {
      return fail(res, 400, "Listan nimen pitää olla 1–100 merkkiä.");
    }
    const watchlist = await Watchlist.create(req.userId, name);
    res.status(201).json({ watchlist });
  } catch (e) {
    if (e.code === "23505") return fail(res, 409, "Sinulla on jo lista tällä nimellä.");
    next(e);
  }
}

export async function get(req, res, next) {
  try {
    const id = toId(req.params.id);
    if (!id) return fail(res, 400, "Virheellinen listan tunniste.");
    const watchlist = await Watchlist.findOwned(id, req.userId);
    if (!watchlist) return fail(res, 404, "Listaa ei löytynyt."); 
    res.json({ watchlist: { ...watchlist, movies: await Watchlist.moviesOf(id) } });
  } catch (e) { next(e); }
}

export async function remove(req, res, next) {
  try {
    const id = toId(req.params.id);
    if (!id) return fail(res, 400, "Virheellinen listan tunniste.");
    if (!(await Watchlist.remove(id, req.userId))) return fail(res, 404, "Listaa ei löytynyt.");
    res.status(204).end();
  } catch (e) { next(e); }
}

// Body { tmdb_id }: a movie found in TMDB search, also one that is not in our database yet.
// Order: owner check -> TMDB details (outside the transaction) -> transaction in the model.
async function addTmdbMovie(req, res, id) {
  const tmdbId = toId(req.body.tmdb_id);
  if (!id || !tmdbId) return fail(res, 400, "Virheellinen tunniste.");
  // Cheap check first: a foreign or missing list never causes a TMDB request.
  if (!(await Watchlist.findOwned(id, req.userId))) return fail(res, 404, "Listaa ei löytynyt.");

  let details = null;
  if (!(await Watchlist.localMovieId(tmdbId))) {
    try {
      details = await getMovieDetails(tmdbId);
    } catch (error) {
      throw toHttpError(error);
    }
  }
  let result = await Watchlist.addTmdbMovie(id, req.userId, tmdbId, details);
  if (result.status === "needs_details") {
    try {
      details = await getMovieDetails(tmdbId);
    } catch (error) {
      throw toHttpError(error);
    }
    result = await Watchlist.addTmdbMovie(id, req.userId, tmdbId, details);
  }
  if (result.status === "not_found") return fail(res, 404, "Listaa ei löytynyt.");
  if (result.status === "exists") {
    return res.status(409).json({
      error: { message: "Elokuva on jo tällä listalla.", status: 409 },
      movie_id: result.movieId,
    });
  }
  res.status(201).json({ item: result.item, movie_id: result.movieId, imported: result.created });
}

export async function addMovie(req, res, next) {
  try {
    const id = toId(req.params.id);
    const hasTmdb = req.body?.tmdb_id !== undefined;
    const hasLocal = req.body?.movie_id !== undefined;
    if (hasTmdb && hasLocal) return fail(res, 400, "Anna joko movie_id tai tmdb_id, ei molempia.");
    if (hasTmdb) return await addTmdbMovie(req, res, id);
    const movieId = toId(req.body?.movie_id);
    if (!id || !movieId) return fail(res, 400, "Virheellinen tunniste.");
    const row = await Watchlist.addMovie(id, req.userId, movieId);
    if (!row) return fail(res, 404, "Listaa ei löytynyt.");
    res.status(201).json({ item: row });
  } catch (e) {
    if (e.code === "23505") return fail(res, 409, "Elokuva on jo tällä listalla.");
    if (e.code === "23503") return fail(res, 404, "Elokuvaa ei löytynyt.");
    next(e);
  }
}

export async function removeMovie(req, res, next) {
  try {
    const id = toId(req.params.id);
    const movieId = toId(req.params.movieId);
    if (!id || !movieId) return fail(res, 400, "Virheellinen tunniste.");
    if (!(await Watchlist.removeMovie(id, req.userId, movieId))) {
      return fail(res, 404, "Elokuvaa ei löytynyt listalta.");
    }
    res.status(204).end();
  } catch (e) { next(e); }
}