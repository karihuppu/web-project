import { useEffect, useState } from "react";
import { useAuth, loginPathFor } from "./useAuth";
import * as api from "./watchlists";
import "./watchlist.css";

function Link({ href, navigate, children, ...props }) {
  return (
    <a
      href={href}
      {...props}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

// Sends guests to login and comes back here afterwards.
function useRequireLogin(navigate, path) {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && !user) navigate(loginPathFor(path));
  }, [loading, user, navigate, path]);
  return { user, loading };
}

const countLabel = (n) => (n === 1 ? "1 elokuva" : `${n} elokuvaa`);

// /watchlists
export function WatchlistsPage({ navigate }) {
  const { user, loading } = useRequireLogin(navigate, "/watchlists");
  const [lists, setLists] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) api.getLists().then(setLists).catch((e) => { setError(e.message); setLists([]); });
  }, [user]);

  const onCreate = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const created = await api.createList(name.trim());
      setLists((l) => [{ ...created, movie_count: 0 }, ...(l || [])]);
      setName("");
    } catch (err) {
      setError(err.message);
    }
  };

  const onDelete = async (list) => {
    if (!window.confirm(`Poistetaanko lista "${list.name}"?`)) return;
    try {
      await api.deleteList(list.id);
      setLists((l) => l.filter((x) => x.id !== list.id));
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading || !user || lists === null) return <p className="auth-loading">Ladataan…</p>;

  return (
    <section className="wl-page">
      <header className="wl-head">
        <p className="eyebrow">OMAT LISTAT</p>
        <h1>Toivelistat</h1>
        <p className="wl-sub">Kokoa elokuvat, jotka haluat katsoa seuraavaksi.</p>
      </header>

      <form className="wl-create" onSubmit={onCreate}>
        <label className="wl-sr" htmlFor="wl-name">Listan nimi</label>
        <input
          id="wl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Esim. Viikonlopun leffat"
          maxLength={100}
        />
        <button className="button" type="submit" disabled={!name.trim()}>
          Luo lista
        </button>
      </form>

      {error && <p className="wl-error" role="alert">{error}</p>}

      {lists.length === 0 ? (
        <p className="wl-empty">Ei vielä listoja. Luo ensimmäinen yllä.</p>
      ) : (
        <ul className="wl-grid">
          {lists.map((l) => (
            <li className="wl-card" key={l.id}>
              <Link href={`/watchlists/${l.id}`} navigate={navigate} className="wl-card__main">
                <span className="wl-card__name">{l.name}</span>
                <span className="wl-card__count">{countLabel(l.movie_count)}</span>
              </Link>
              <button
                type="button"
                className="wl-card__delete"
                aria-label={`Poista lista ${l.name}`}
                onClick={() => onDelete(l)}
              >
                Poista
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// /watchlists/:id
export function WatchlistPage({ id, navigate }) {
  const { user, loading } = useRequireLogin(navigate, `/watchlists/${id}`);
  const [list, setList] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) api.getList(id).then(setList).catch((e) => setError(e.message));
  }, [user, id]);

  const onRemove = async (movieId) => {
    try {
      await api.removeMovie(id, movieId);
      setList((l) => ({ ...l, movies: l.movies.filter((m) => m.id !== movieId) }));
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading || !user) return <p className="auth-loading">Ladataan…</p>;

  const back = (
    <Link href="/watchlists" navigate={navigate} className="text-link wl-back">
      ← Kaikki listat
    </Link>
  );

  if (error && !list) {
    return (
      <section className="wl-page">
        {back}
        <p className="wl-error" role="alert">{error}</p>
      </section>
    );
  }
  if (!list) return <p className="auth-loading">Ladataan…</p>;

  return (
    <section className="wl-page">
      {back}
      <header className="wl-head">
        <p className="eyebrow">TOIVELISTA</p>
        <h1>{list.name}</h1>
        <p className="wl-sub">{countLabel(list.movies.length)}</p>
      </header>

      {error && <p className="wl-error" role="alert">{error}</p>}

      {list.movies.length === 0 ? (
        <p className="wl-empty">Lista on tyhjä. Lisää elokuvia elokuvan sivulta.</p>
      ) : (
        <ul className="wl-movies">
          {list.movies.map((m) => (
            <li className="wl-movie" key={m.id}>
              <Link href={`/movies/${m.id}`} navigate={navigate} className="wl-movie__link">
                <div className="wl-movie__poster">
                  {typeof m.poster_path === "string" && m.poster_path.startsWith("/") ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w342${m.poster_path}`}
                      alt={`${m.title} – juliste`}
                      loading="lazy"
                    />
                  ) : (
                    <span>{m.title}</span>
                  )}
                </div>
                <span className="wl-movie__title">{m.title}</span>
                <span className="wl-movie__year">{m.release_date?.slice(0, 4) || ""}</span>
              </Link>
              <button
                type="button"
                className="button button--secondary wl-movie__remove"
                onClick={() => onRemove(m.id)}
              >
                Poista listalta
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Used on the movie page: <AddToWatchlist movieId={movie.data.id} />
export function AddToWatchlist({ movieId }) {
  const { user } = useAuth();
  const [lists, setLists] = useState([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user) api.getLists().then(setLists).catch(() => {});
  }, [user]);

  if (!user || lists.length === 0) return null;

  const onAdd = async () => {
    try {
      await api.addMovie(selected, movieId);
      setMessage("Lisätty listalle!");
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <div className="wl-add">
      <label className="wl-sr" htmlFor="wl-select">Valitse lista</label>
      <select id="wl-select" value={selected} onChange={(e) => { setSelected(e.target.value); setMessage(""); }}>
        <option value="">Valitse lista…</option>
        {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <button type="button" className="button button--secondary" disabled={!selected} onClick={onAdd}>
        Lisää listalle
      </button>
      {message && <p className="wl-add__msg" role="status">{message}</p>}
    </div>
  );
}