import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";
import { AuthNav, LoginPage, RegisterPage, AccountPage } from "./auth/AuthPages";
import MyReview from "./reviews/MyReview";
import { WatchlistsPage, WatchlistPage, AddToWatchlist } from "./auth/WatchlistPages";
import GroupsPage from "./groups/GroupsPage";
import GroupPage from "./groups/GroupPage";
import { SharedListPage } from "./groups/ListSharing";

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
  // replace: true is used for redirects, so "Back" does not return to the redirecting page.
  const navigate = (href, { replace = false } = {}) => {
    if (href === window.location.pathname + window.location.search) return;
    if (replace) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
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
            {params.get("q")
              ? "Valikoimastamme ei löytynyt elokuvia tällä haulla. Katso tulokset TMDB:stä alempaa."
              : "Elokuvia ei löytynyt. Kokeile toista nimeä tai tyhjennä suodattimet."}
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
        {params.get("q") && (
          <TmdbResults
            key={params.get("q")}
            query={params.get("q")}
            genreSelected={params.has("genre")}
            shownIds={
              movies.loading || movies.error
                ? []
                : items.slice(0, PAGE_SIZE).map((movie) => movie.id)
            }
            navigate={navigate}
          />
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
  // After the user's own review changes: shift the count and reload the public list
  // (a new key remounts <Reviews>, which also returns it to the first page).
  const [reviewChanges, setReviewChanges] = useState({ movieId, delta: 0, version: 0 });
  const changes =
    reviewChanges.movieId === movieId ? reviewChanges : { movieId, delta: 0, version: 0 };
  const onReviewChanged = (delta) =>
    setReviewChanges({
      movieId,
      delta: changes.delta + delta,
      version: changes.version + 1,
    });
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
                  <dd>{Math.max(0, movie.data.review_count + changes.delta)}</dd>
                </div>
              </dl>
              <AddToWatchlist movieId={movie.data.id} />
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
          <MyReview key={movieId} movieId={movieId} navigate={navigate} onChanged={onReviewChanged} />
          <Reviews key={`${movieId}:${changes.version}`} movieId={movieId} />
        </>
      )}
    </div>
  );
}

// TMDB errors from our API: 503 = TMDB unavailable (the server sends a Finnish message).
const tmdbErrorText = (status) =>
  status === 503
    ? "Elokuvahaku TMDB:stä ei ole juuri nyt käytettävissä. Oman valikoimamme elokuvat toimivat normaalisti. Yritä hetken päästä uudelleen."
    : status === 400
      ? "Hakusana ei kelpaa. Kokeile lyhyempää hakusanaa."
      : "TMDB-hakua ei voitu tehdä. Yritä hetken kuluttua uudelleen.";

// Search results from TMDB under our own catalogue results (only when there is a search word).
// Movies that are already ours open /movies/:id (reviews); others open /tmdb/:tmdbId.
function TmdbResults({ query, genreSelected, shownIds, navigate }) {
  const [page, setPage] = useState(1);
  const search = useApi(
    `/api/tmdb/search?${new URLSearchParams({ q: query, page: String(page) })}`,
  );
  const shown = new Set(shownIds);
  const items = (search.data?.items || []).filter(
    (movie) => !(movie.local_id && shown.has(movie.local_id)),
  );
  const totalPages = search.data?.total_pages || 1;
  return (
    <section className="tmdb-results" aria-labelledby="tmdb-results-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LISÄÄ ELOKUVIA</p>
          <h2 id="tmdb-results-title">Tulokset TMDB:stä</h2>
        </div>
      </div>
      <p className="result-query">
        Haku koko TMDB-tietokannasta nimellä tai sen osalla.
        {genreSelected && " Genre- ja järjestysvalinta koskevat vain omaa valikoimaamme."}
      </p>
      {search.loading && <Message kind="info">Haetaan TMDB:stä…</Message>}
      {search.error && (
        <Message retry={search.status === 400 ? undefined : search.retry}>
          {tmdbErrorText(search.status)}
        </Message>
      )}
      {!search.loading && !search.error && items.length === 0 && (
        <Message kind="info">TMDB:stä ei löytynyt muita elokuvia tällä haulla.</Message>
      )}
      {!search.loading && !search.error && items.length > 0 && (
        <div className="movie-grid">
          {items.map((movie, index) => (
            <article className="movie-card" key={movie.tmdb_id}>
              <Link
                href={movie.local_id ? `/movies/${movie.local_id}` : `/tmdb/${movie.tmdb_id}`}
                navigate={navigate}
                className="movie-card__link"
              >
                <div className={`movie-card__art movie-card__art--${index % 4}`}>
                  <Poster movie={movie} />
                  <span className="movie-card__open" aria-hidden="true">→</span>
                </div>
                <div className="movie-card__meta">
                  <span>{yearOf(movie.release_date)}</span>
                  <span>{movie.local_id ? "Valikoimassa" : "TMDB"}</span>
                </div>
                <h3>{movie.title}</h3>
                {movie.original_title && movie.original_title !== movie.title && (
                  <p className="movie-card__genres">{movie.original_title}</p>
                )}
                <p className="movie-card__rating">{ratingOf(movie.tmdb_vote_average)}</p>
              </Link>
            </article>
          ))}
        </div>
      )}
      {!search.loading && !search.error && totalPages > 1 && (
        <nav className="pagination" aria-label="TMDB-tulossivut">
          <button
            className="button button--secondary"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            ← Edellinen
          </button>
          <span>
            Sivu {page} / {totalPages}
          </span>
          <button
            className="button button--secondary"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Seuraava →
          </button>
        </nav>
      )}
    </section>
  );
}

// /tmdb/:tmdbId — a movie that is not in our database yet. When it is (local_id), the page
// redirects to /movies/:id, where the reviews are.
function TmdbMoviePage({ tmdbId, navigate, backHref }) {
  const movie = useApi(`/api/tmdb/movies/${tmdbId}`);
  const localId = movie.data?.local_id;
  useEffect(() => {
    if (localId) navigate(`/movies/${localId}`, { replace: true });
  }, [localId, navigate]);
  const data = movie.data && !localId ? movie.data : null;
  return (
    <div className="movie-page">
      <Link href={backHref} navigate={navigate} className="text-link back-link">
        ← Takaisin elokuviin
      </Link>
      {(movie.loading || localId) && <Message kind="info">Ladataan elokuvaa…</Message>}
      {movie.error && (
        <Message retry={movie.status === 503 ? movie.retry : undefined}>
          {movie.status === 404 || movie.status === 400
            ? "Elokuvaa ei löytynyt."
            : movie.status === 503
              ? "Elokuvan tietoja ei saatu TMDB:stä juuri nyt. Oman valikoimamme elokuvat toimivat normaalisti. Yritä hetken päästä uudelleen."
              : "Elokuvaa ei voitu ladata. Yritä uudelleen."}
        </Message>
      )}
      {data && (
        <section className="movie-detail" aria-labelledby="movie-title">
          <Poster movie={data} large />
          <div className="movie-detail__body">
            <p className="eyebrow">
              {yearOf(data.release_date)}
              {data.runtime_minutes ? ` · ${data.runtime_minutes} MIN` : ""}
            </p>
            <h1 id="movie-title">{data.title}</h1>
            {data.original_title && data.original_title !== data.title && (
              <p className="original-title">{data.original_title}</p>
            )}
            {data.genres.length > 0 && (
              <div className="genre-tags">
                {data.genres.map((genre) => (
                  <span key={genre.tmdb_id}>{genre.name}</span>
                ))}
              </div>
            )}
            <p className="overview" lang={data.overview_language === "en" ? "en" : undefined}>
              {data.overview || "Elokuvan kuvausta ei ole saatavilla."}
            </p>
            {data.overview_language === "en" && (
              <p className="muted">Suomenkielistä kuvausta ei ole, joten kuvaus on englanniksi.</p>
            )}
            <dl className="movie-facts">
              <div>
                <dt>TMDB-arvio</dt>
                <dd>
                  {data.tmdb_vote_average == null
                    ? "Ei saatavilla"
                    : `${Number(data.tmdb_vote_average).toFixed(1)} / 10`}
                </dd>
              </div>
              <div>
                <dt>Arvostelut sivustolla</dt>
                <dd>Ei vielä</dd>
              </div>
            </dl>
            <p className="muted">
              Elokuva ei ole vielä valikoimassamme. Kun lisäät sen listallesi, sille avautuu oma
              sivu, jolla sitä voi arvostella.
            </p>
            <AddToWatchlist
              tmdbId={data.tmdb_id}
              navigate={navigate}
              backPath={`/tmdb/${data.tmdb_id}`}
            />
            <a
              className="text-link"
              href={`https://www.themoviedb.org/movie/${data.tmdb_id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Katso TMDB:ssä →
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

function App() {
  const [location, navigate] = useLocation();
  const [backHref, setBackHref] = useState("/");
  const url = new URL(location, window.location.origin);
  const movieRoute = /^\/movies\/(\d+)\/?$/.exec(url.pathname);
  const watchlistRoute = /^\/watchlists\/(\d+)\/?$/.exec(url.pathname);
  const groupRoute = /^\/groups\/(\d+)\/?$/.exec(url.pathname);
  const sharedListRoute = /^\/groups\/(\d+)\/watchlists\/(\d+)\/?$/.exec(url.pathname);
  const tmdbRoute = /^\/tmdb\/(\d+)\/?$/.exec(url.pathname);
  const go = (href, options) => {
    if (url.pathname === "/") setBackHref(location);
    navigate(href, options);
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
            <Link href="/watchlists" navigate={go} className="header-link">
              Listat
            </Link>


            <Link href="/groups" navigate={go} className="header-link">
              Ryhmät
            </Link>
            <AuthNav navigate={go} />
          </nav>
        </div>
      </header>
      <main id="main" className="container">
        {url.pathname === "/" ? (
          <Catalogue params={url.searchParams} navigate={go} />
        ) : url.pathname === "/login" ? (
          <LoginPage navigate={go} />
        ) : url.pathname === "/register" ? (
          <RegisterPage navigate={go} />
        ) : url.pathname === "/account" ? (
          <AccountPage navigate={go} />
        ) : url.pathname === "/watchlists" ? (
          <WatchlistsPage navigate={go} />
        ) : watchlistRoute ? (
          <WatchlistPage key={watchlistRoute[1]} id={watchlistRoute[1]} navigate={go} />
        ) : url.pathname === "/groups" || url.pathname === "/groups/" ? (
          <GroupsPage navigate={go} />
        ) : sharedListRoute ? (
          <SharedListPage
            key={`${sharedListRoute[1]}:${sharedListRoute[2]}`}
            groupId={sharedListRoute[1]}
            listId={sharedListRoute[2]}
            navigate={go}
          />
        ) : groupRoute ? (
          <GroupPage key={groupRoute[1]} groupId={groupRoute[1]} navigate={go} />
        ) : tmdbRoute ? (
          <TmdbMoviePage
            key={tmdbRoute[1]}
            tmdbId={tmdbRoute[1]}
            navigate={go}
            backHref={backHref}
          />
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
        {/* Credits: TMDB attribution (https://developer.themoviedb.org/docs/faq).
            The logo is an approved TMDB logo, smaller than our own brand. */}
        <section className="container site-footer__credits" aria-label="Lähteet">
          <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="tmdb-credit__logo">
            <img src="/tmdb-logo.svg" alt="The Movie Database (TMDB)" width="91" height="12" />
          </a>
          <p lang="en">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
          <p>Elokuvien julisteet ja osa kuvauksista: The Movie Database (TMDB).</p>
        </section>
      </footer>
    </>
  );
}

export default App;
