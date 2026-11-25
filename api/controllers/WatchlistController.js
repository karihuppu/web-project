import * as Watchlist from "../models/Watchlist.js";

const fail = (res, status, message) =>
  res.status(status).json({ error: { message, status } }); // matches the format your frontend parses

const toId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
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

export async function addMovie(req, res, next) {
  try {
    const id = toId(req.params.id);
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