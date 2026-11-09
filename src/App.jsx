import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const PAGE_SIZE = 12;
const api = axios.create({
  baseURL: import.meta.env.PROD
    ? ""
    : (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(
        /\/+$/,
        "",
      ),
  timeout: 15000,
});

function useApi(endpoint) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const requestKey = `${endpoint}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    api
      .get(endpoint, { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            key: requestKey,
            error: true,
            status: error.response?.status,
          });
      });
    return () => controller.abort();
  }, [endpoint, requestKey]);
  return {
    ...(result?.key === requestKey ? result : {}),
    loading: result?.key !== requestKey,
    retry: () => setAttempt((value) => value + 1),
  };
}

function useLocation() {
  const [location, setLocation] = useState(
    () => window.location.pathname + window.location.search,
  );
  useEffect(() => {
    const update = () =>
      setLocation(window.location.pathname + window.location.search);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const navigate = (href) => {
    if (href === window.location.pathname + window.location.search) return;
    window.history.pushState(null, "", href);
    setLocation(href);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  return [location, navigate];
}

function Link({ href, navigate, children, ...props }) {
  return (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

function Message({ children, retry, kind = "error" }) {
  return (
    <div
      className={`message message--${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <p>{children}</p>
      {retry && (
        <button className="button button--secondary" onClick={retry}>
          Yritä uudelleen
        </button>
      )}
    </div>
  );
}

function Poster({ movie, large = false }) {
  const [failedPath, setFailedPath] = useState(null);
  const path = movie.poster_path;
  const hasImage =
    typeof path === "string" && path.startsWith("/") && path !== failedPath;
  return (
    <div className={`poster${large ? " poster--large" : ""}`}>
      {hasImage ? (
        <img
          src={`https://image.tmdb.org/t/p/w500${path}`}
          alt={`${movie.title} – juliste`}
          loading={large ? "eager" : "lazy"}
          onError={() => setFailedPath(path)}
        />
      ) : (
        <div
          className="poster__placeholder"
          aria-label={`Elokuvan ${movie.title} julistetta ei ole saatavilla`}
        >
          <span className="poster__reel" aria-hidden="true">
            ◉
          </span>
          <span className="poster__title">{movie.title}</span>
          <span className="poster__caption">Juliste tulossa</span>
        </div>
      )}
    </div>
  );
}

const yearOf = (date) => date?.slice(0, 4) || "Vuosi ei tiedossa";
const ratingOf = (rating) =>
  rating == null ? "Ei TMDB-arviota" : `TMDB ${Number(rating).toFixed(1)} / 10`;
const dateOf = (date) =>
  date ? new Intl.DateTimeFormat("fi-FI").format(new Date(date)) : "";

function Filters({ params, genres, navigate }) {
  const [query, setQuery] = useState(params.get("q") || "");
  const update = (name, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("offset");
    navigate(next.size ? `/?${next}` : "/");
  };
  return (
    <div className="filters">
      <form
        className="search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          update("q", query.trim());
        }}
      >
        <label htmlFor="movie-search">Etsi elokuva</label>
        <div className="search__row">
          <input
            id="movie-search"
            type="search"
            placeholder="Elokuvan nimi…"
            maxLength={100}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="button" type="submit">
            Hae <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
      <div className="select-field">
        <label htmlFor="genre">Genre</label>
        <select
          id="genre"
          value={params.get("genre") || ""}
          onChange={(event) => update("genre", event.target.value)}
        >
          <option value="">Kaikki genret</option>
          {(genres.data || []).map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.name}
            </option>
          ))}
        </select>
      </div>
      <div className="select-field">
        <label htmlFor="sort">Järjestä</label>
        <select
          id="sort"
          value={params.get("sort") || "newest"}
          onChange={(event) => update("sort", event.target.value)}
        >
          <option value="newest">Uusimmat ensin</option>
          <option value="title">Nimen mukaan</option>
          <option value="rating">TMDB-arvion mukaan</option>
        </select>
      </div>
    </div>
  );
}

function Catalogue({ params, navigate }) {
  const genres = useApi("/api/genres");
  const rawOffset = Number(params.get("offset") || 0);
  const offset =
    Number.isSafeInteger(rawOffset) && rawOffset >= 0 && rawOffset <= 2147483647
      ? rawOffset
      : 0;
  const query = new URLSearchParams({
    limit: String(PAGE_SIZE + 1),
    offset: String(offset),
  });
  for (const key of ["q", "sort", "genre"])
    if (params.get(key)) query.set(key, params.get(key));
  const movies = useApi(`/api/movies?${query}`);
  const items = movies.data?.items || [];
  const page = (newOffset) => {
    const next = new URLSearchParams(params);
    if (newOffset > 0) next.set("offset", String(newOffset));
    else next.delete("offset");
    navigate(next.size ? `/?${next}` : "/");
  };
  const filtered = params.has("q") || params.has("genre");
  return (
    <>
      <section className="hero" aria-labelledby="catalogue-title">
        <p className="eyebrow">RYHMÄ 13 · ELOKUVAPALVELU</p>
        <h1 id="catalogue-title">
          Seuraava hyvä
          <br />
          <em>elokuvailta.</em>
        </h1>
        <p className="hero__intro">
          Löydä elokuvia, tutustu tarinoihin ja lue muiden katsojien
          arvosteluja.
        </p>
        <span className="hero__stamp" aria-hidden="true">
          ELÄVÄT
          <br />
          KUVAT
          <br />
          <span>✳</span>
        </span>
      </section>
      <section className="catalogue" aria-labelledby="results-title">
        <Filters
          key={params.toString()}
          params={params}
          genres={genres}
          navigate={navigate}
        />
        {genres.error && (
          <Message retry={genres.retry}>
            Genrejä ei voitu ladata. Voit silti hakea elokuvia nimellä.
          </Message>
        )}
        <div className="section-heading">
          <div>
            <p className="eyebrow">LÖYDÄ OMA SUOSIKKISI</p>
            <h2 id="results-title">
              {filtered ? "Hakutulokset" : "Elokuvavalikoima"}
            </h2>
          </div>
          {filtered && (
            <Link href="/" navigate={navigate} className="text-link">
              Tyhjennä suodattimet →
            </Link>
          )}
        </div>
        {params.get("q") && (
          <p className="result-query">
            Haku: <strong>“{params.get("q")}”</strong>
          </p>
        )}
        {movies.loading && <Message kind="info">Ladataan elokuvia…</Message>}
        {movies.error && (
          <Message retry={movies.retry}>
            {movies.status === 400
              ? "Hakuehdot eivät kelpaa. Tyhjennä suodattimet ja yritä uudelleen."
              : "Elokuvia ei voitu ladata. Yritä hetken kuluttua uudelleen."}
          </Message>
        )}
        {!movies.loading && !movies.error && items.length === 0 && (
          <Message kind="info">
            Elokuvia ei löytynyt. Kokeile toista nimeä tai tyhjennä suodattimet.
          </Message>
        )}
        {!movies.loading && !movies.error && (
          <div className="movie-grid">
            {items.slice(0, PAGE_SIZE).map((movie, index) => (
              <article className="movie-card" key={movie.id}>
                <Link
                  href={`/movies/${movie.id}`}
                  navigate={navigate}
                  className="movie-card__link"
                >
                  <div
                    className={`movie-card__art movie-card__art--${index % 4}`}
                  >
                    <Poster movie={movie} />
                    <span className="movie-card__open" aria-hidden="true">
                      →
                    </span>
                  </div>
                  <div className="movie-card__meta">
                    <span>{yearOf(movie.release_date)}</span>
                    <span>
                      {movie.runtime_minutes
                        ? `${movie.runtime_minutes} min`
                        : "—"}
                    </span>
                  </div>
                  <h3>{movie.title}</h3>
                  <p className="movie-card__genres">
                    {movie.genres.join(" · ") || "Genre ei tiedossa"}
                  </p>
                  <p className="movie-card__rating">
                    {ratingOf(movie.tmdb_vote_average)}
                  </p>
                </Link>
              </article>
            ))}
          </div>
        )}
        {!movies.loading &&
          !movies.error &&
          (offset > 0 || items.length > PAGE_SIZE) && (
            <nav className="pagination" aria-label="Tulossivut">
              <button
                className="button button--secondary"
                disabled={offset === 0}
                onClick={() => page(Math.max(0, offset - PAGE_SIZE))}
              >
                ← Edellinen
              </button>
              <span>Sivu {Math.floor(offset / PAGE_SIZE) + 1}</span>
              <button
                className="button button--secondary"
                disabled={items.length <= PAGE_SIZE}
                onClick={() => page(offset + PAGE_SIZE)}
              >
                Seuraava →
              </button>
            </nav>
          )}
      </section>
    </>
  );
}

function Reviews({ movieId }) {
  const [offset, setOffset] = useState(0);
  const reviews = useApi(
    `/api/movies/${movieId}/reviews?limit=${PAGE_SIZE + 1}&offset=${offset}`,
  );
  const items = reviews.data?.items || [];
  return (
    <section className="reviews" aria-labelledby="reviews-title">
      <div className="section-heading">
        <h2 id="reviews-title">Katsojien arvostelut</h2>
        <span className="scale-label">Asteikko 1–5</span>
      </div>
      {reviews.loading && <Message kind="info">Ladataan arvosteluja…</Message>}
      {reviews.error && (
        <Message retry={reviews.retry}>Arvosteluja ei voitu ladata.</Message>
      )}
      {!reviews.loading && !reviews.error && items.length === 0 && (
        <Message kind="info">
          Tällä elokuvalla ei ole vielä arvosteluja.
        </Message>
      )}
      {!reviews.loading && !reviews.error && (
        <div className="review-list">
          {items.slice(0, PAGE_SIZE).map((review) => (
            <article className="review" key={review.id}>
              <div className="review__header">
                <strong>
                  {review.author?.nickname || "Poistettu käyttäjä"}
                </strong>
                <span
                  className="review__stars"
                  aria-label={`${review.rating} tähteä viidestä`}
                >
                  {"★".repeat(review.rating)}
                  <span aria-hidden="true">
                    {"☆".repeat(5 - review.rating)}
                  </span>
                </span>
              </div>
              <time dateTime={review.created_at}>
                {dateOf(review.created_at)}
              </time>
              {review.comment ? (
                <p>{review.comment}</p>
              ) : (
                <p className="muted">Ei kommenttia.</p>
              )}
            </article>
          ))}
        </div>
      )}
      {!reviews.loading &&
        !reviews.error &&
        (offset > 0 || items.length > PAGE_SIZE) && (
          <nav className="pagination" aria-label="Arvostelusivut">
            <button
              className="button button--secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              ← Edelliset
            </button>
            <span>Sivu {Math.floor(offset / PAGE_SIZE) + 1}</span>
            <button
              className="button button--secondary"
              disabled={items.length <= PAGE_SIZE}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Seuraavat →
            </button>
          </nav>
        )}
    </section>
  );
}

function MoviePage({ movieId, navigate, backHref }) {
  const movie = useApi(`/api/movies/${movieId}`);
  return (
    <div className="movie-page">
      <Link href={backHref} navigate={navigate} className="text-link back-link">
        ← Takaisin elokuviin
      </Link>
      {movie.loading && <Message kind="info">Ladataan elokuvaa…</Message>}
      {movie.error && (
        <Message retry={movie.status !== 404 ? movie.retry : undefined}>
          {movie.status === 404 || movie.status === 400
            ? "Elokuvaa ei löytynyt."
            : "Elokuvaa ei voitu ladata. Yritä uudelleen."}
        </Message>
      )}
      {movie.data && (
        <>
          <section className="movie-detail" aria-labelledby="movie-title">
            <Poster key={movie.data.id} movie={movie.data} large />
            <div className="movie-detail__body">
              <p className="eyebrow">
                {yearOf(movie.data.release_date)}
                {movie.data.runtime_minutes
                  ? ` · ${movie.data.runtime_minutes} MIN`
                  : ""}
              </p>
              <h1 id="movie-title">{movie.data.title}</h1>
              {movie.data.original_title &&
                movie.data.original_title !== movie.data.title && (
                  <p className="original-title">{movie.data.original_title}</p>
                )}
              <div className="genre-tags">
                {movie.data.genres.map((genre) => (
                  <Link
                    href={`/?genre=${genre.id}`}
                    navigate={navigate}
                    key={genre.id}
                  >
                    {genre.name}
                  </Link>
                ))}
              </div>
              <p className="overview">
                {movie.data.overview ||
                  "Elokuvan kuvausta ei ole vielä saatavilla."}
              </p>
              <dl className="movie-facts">
                <div>
                  <dt>TMDB-arvio</dt>
                  <dd>
                    {movie.data.tmdb_vote_average == null
                      ? "Ei saatavilla"
                      : `${Number(movie.data.tmdb_vote_average).toFixed(1)} / 10`}
                  </dd>
                </div>
                <div>
                  <dt>Arvostelut sivustolla</dt>
                  <dd>{movie.data.review_count}</dd>
                </div>
              </dl>
              <a
                className="text-link"
                href={`https://www.themoviedb.org/movie/${movie.data.tmdb_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Katso TMDB:ssä →
              </a>
            </div>
          </section>
          <Reviews key={movieId} movieId={movieId} />
        </>
      )}
    </div>
  );
}

function App() {
  const [location, navigate] = useLocation();
  const [backHref, setBackHref] = useState("/");
  const url = new URL(location, window.location.origin);
  const movieRoute = /^\/movies\/(\d+)\/?$/.exec(url.pathname);
  const go = (href) => {
    if (url.pathname === "/") setBackHref(location);
    navigate(href);
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Siirry sisältöön
      </a>
      <header className="site-header">
        <div className="site-header__inner">
          <Link
            href="/"
            navigate={go}
            className="brand"
            aria-label="Elokuvailta – etusivu"
          >
            <span aria-hidden="true">✳</span> Elokuvailta
            <span className="brand__dot">.</span>
          </Link>
          <nav aria-label="Päävalikko">
            <Link href="/" navigate={go} className="header-link">
              Elokuvat →
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="container">
        {url.pathname === "/" ? (
          <Catalogue params={url.searchParams} navigate={go} />
        ) : movieRoute ? (
          <MoviePage
            movieId={movieRoute[1]}
            navigate={go}
            backHref={backHref}
          />
        ) : (
          <section className="not-found">
            <p className="eyebrow">404</p>
            <h1>Sivua ei löytynyt.</h1>
            <Link href="/" navigate={go} className="button">
              Takaisin elokuviin
            </Link>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <div className="container site-footer__inner">
          <span>Elokuvailta · Ryhmä 13</span>
          <span>Opintoprojekti · Esittelyversio</span>
        </div>
      </footer>
    </>
  );
}

export default App;
