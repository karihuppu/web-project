import { useEffect, useState } from "react";
import { useAuth, loginPathFor } from "../auth/useAuth";
import {
  VISIBILITY_LABEL,
  fetchMyGroups,
  fetchShares,
  shareWatchlist,
  unshareWatchlist,
  fetchGroupWatchlists,
  fetchGroupWatchlist,
  copyGroupWatchlist,
} from "./groupApi";
import "../auth/watchlist.css";

const countLabel = (n) => (n === 1 ? "1 elokuva" : `${n} elokuvaa`);

function NavLink({ href, navigate, children, ...props }) {
  return (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

export function ShareListPanel({ watchlistId, navigate }) {
  const { logout } = useAuth();
  const [version, setVersion] = useState(0);
  const [data, setData] = useState({ key: null, groups: [], shares: [] });
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const key = `${watchlistId}:${version}`;

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMyGroups(), fetchShares(watchlistId)])
      .then(([groups, shares]) => !cancelled && setData({ key, groups, shares }))
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401) logout();
        else {
          setNotice({ kind: "error", text: err.message });
          setData({ key, groups: [], shares: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key, watchlistId, logout]);

  const run = async (action, text) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setSelected("");
      setNotice({ kind: "info", text });
      setVersion((v) => v + 1);
    } catch (err) {
      if (err.status === 401) logout();
      else setNotice({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (data.key !==key) {
    return (
      <section className="wl-share">
        <p className="message message--info" role="status">Ladataan jakoasetuksia…</p>
      </section>
    );
  }

  const { groups, shares } =data;
  const sharedIds = new Set(shares.map((s) => s.id));
  const available = groups.filter((g) => !sharedIds.has(g.id));
  const chosen = available.find((g) => String(g.id) === selected);

  return (
    <section className="wl-share" aria-labelledby="wl-share-title">
      <h2 id="wl-share-title">Jaa ryhmään</h2>
      <p className="wl-share__intro">
        Omat listasi ovat yksityisiä, kunnes jaat jonkin niistä ryhmään. Ryhmässä näkyy aina listan ajantasainen versio.
      </p>

      {notice && (
        <p
          className={`message message--${notice.kind === "error" ? "error" : "info"}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}

      {groups.length === 0 ? (
        <p className="group-empty">
          Et ole vielä missään ryhmässä.{" "}
          <NavLink href="/groups" navigate={navigate}>Etsi tai luo ryhmä</NavLink>, niin voit jakaa listan.
        </p>
      ) : (
        available.length > 0 && (
          <>
            <div className="wl-share__form">
              <label className="wl-sr" htmlFor="wl-share-group">Ryhmä</label>
              <select id="wl-share-group" value={selected} disabled={busy} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Valitse ryhmä…</option>
                {available.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({VISIBILITY_LABEL[g.visibility].toLowerCase()})
                  </option>
                ))}
              </select>
              <button
                className="button"
                type="button"
                disabled={!selected || busy}
                onClick={() => run(() => shareWatchlist(watchlistId, Number(selected)), "Lista jaettiin ryhmään.")}
              >
                {busy ? "Jaetaan…" : "Jaa lista"}
              </button>
            </div>
            {chosen?.visibility === "public" && (
              <p className="wl-share__warn" role="note">
                Tämä on julkinen ryhmä: lista näkyy kaikille, jotka voivat avata ryhmän sivun.
              </p>
            )}
          </>
        )
      )}

      {shares.length === 0 ? (
        <p className="group-empty">Listaa ei ole jaettu mihinkään ryhmään.</p>
      ) : (
        <ul className="wl-share__list">
          {shares.map((s) => (
            <li className="wl-share__item" key={s.id}>
              <span>
                <NavLink href={`/groups/${s.id}`} navigate={navigate}>{s.name}</NavLink>{" "}
                <span className="wl-share__meta">{VISIBILITY_LABEL[s.visibility]}</span>
              </span>
              <button
                className="button button--secondary"
                type="button"
                disabled={busy}
                aria-label={`Poista jako ryhmästä ${s.name}`}
                onClick={() => run(() => unshareWatchlist(watchlistId, s.id), "Jako poistettiin.")}
              >
                Poista jako
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


export function SharedLists({ groupId, navigate }) {
  const { user, logout } = useAuth();
  const [state, setState] = useState({ key: null, items: [], error: null });
  const key = `${groupId}:${user?.id ?? "guest"}`;

  useEffect(() => {
    let cancelled = false;
    fetchGroupWatchlists(groupId)
      .then((items) => !cancelled && setState({ key, items, error: null }))
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401) logout();
        else setState({ key, items: [], error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [key, groupId, logout]);

  const ready = state.key === key;

  return (
    <section aria-labelledby="shared-lists-title">
      <h2 id="shared-lists-title">Jaetut listat</h2>
      {!ready && <p className="message message--info" role="status">Ladataan listoja…</p>}
      {ready && state.error && <p className="message message--error" role="alert">{state.error}</p>}
      {ready && !state.error && state.items.length === 0 && (
        <p className="group-empty">Ryhmässä ei ole vielä jaettuja listoja.</p>
      )}
      {ready && state.items.length > 0 && (
        <ul className="group-list">
          {state.items.map((l) => (
            <li className="group-row" key={l.id}>
              <NavLink href={`/groups/${groupId}/watchlists/${l.id}`} navigate={navigate} className="group-row__name">
                {l.name}
              </NavLink>
              <span className="group-row__meta">
                {countLabel(l.movie_count)} · {l.owner.nickname}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


export function SharedListPage({ groupId, listId, navigate }) {
  const { user, loading: authLoading, logout } = useAuth();
  const [view, setView] = useState({ key: null, list: null, status: null, message: null });
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = authLoading ? null : `${groupId}:${listId}:${user?.id ?? "guest"}`;

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    fetchGroupWatchlist(groupId, listId)
      .then((list) => !cancelled && setView({ key, list, status: 200, message: null }))
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401) {
          logout();
          return;
        }
        setView({ key, list: null, status: err.status, message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [key, groupId, listId, logout]);

  const onCopy = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const copy = await copyGroupWatchlist(groupId, listId);
      navigate(`/watchlists/${copy.id}`);
    } catch (err) {
      if (err.status === 401) logout();
      else setNotice({ kind: "error", text: err.message });
      setBusy(false);
    }
  };

  const back = (
    <NavLink href={`/groups/${groupId}`} navigate={navigate} className="text-link wl-back">
      ← Takaisin ryhmään
    </NavLink>
  );

  if (!key || view.key !== key) {
    return (
      <section className="wl-page">
        {back}
        <p className="message message--info" role="status">Ladataan listaa…</p>
      </section>
    );
  }

  if (!view.list) {
    return (
      <section className="wl-page">
        {back}
        <p className="message message--error" role="alert">
          {view.status === 404 || view.status === 400
            ? "Listaa ei löytynyt. Se on voitu poistaa ryhmästä, tai ryhmä on yksityinen."
            : view.message}
        </p>
      </section>
    );
  }

  const { list } = view;
  const isOwner = user && list.owner?.id === user.id;

  return (
    <section className="wl-page">
      {back}
      <header className="wl-head">
        <p className="eyebrow">JAETTU LISTA</p>
        <h1>{list.name}</h1>
        <p className="wl-sub">
          {list.owner?.nickname} · {countLabel(list.movies.length)}
        </p>
      </header>

      {notice && <p className="message message--error" role="alert">{notice.text}</p>}

      <div className="wl-copy">
        {isOwner ? (
          <NavLink href={`/watchlists/${list.id}`} navigate={navigate} className="text-link">
            Tämä on sinun listasi – avaa se →
          </NavLink>
        ) : user ? (
          <button className="button" type="button" disabled={busy} onClick={onCopy}>
            {busy ? "Tallennetaan…" : "Tallenna omaksi listaksi"}
          </button>
        ) : (
          <p>
            <NavLink href={loginPathFor(`/groups/${groupId}/watchlists/${listId}`)} navigate={navigate}>
              Kirjaudu sisään
            </NavLink>
            , niin voit tallentaa listan omaksesi.
          </p>
        )}
      </div>

      {list.movies.length === 0 ? (
        <p className="wl-empty">Lista on tyhjä.</p>
      ) : (
        <ul className="wl-movies">
          {list.movies.map((m) => (
            <li className="wl-movie" key={m.id}>
              <NavLink href={`/movies/${m.id}`} navigate={navigate} className="wl-movie__link">
                <div className="wl-movie__poster">
                  {typeof m.poster_path === "string" && m.poster_path.startsWith("/") ? (
                    <img src={`https://image.tmdb.org/t/p/w342${m.poster_path}`} alt={`${m.title} – juliste`} loading="lazy" />
                  ) : (
                    <span>{m.title}</span>
                  )}
                </div>
                <span className="wl-movie__title">{m.title}</span>
                <span className="wl-movie__year">{m.release_date?.slice(0, 4) || ""}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}