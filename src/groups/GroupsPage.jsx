import { useEffect, useState } from "react";
import { useAuth, loginPathFor } from "../auth/useAuth";
import {
  ROLE_LABEL,
  VISIBILITY_LABEL,
  fetchMyGroups,
  fetchPublicGroups,
  createGroup,
} from "./groupApi";
import "./groups.css";

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

function GroupRow({ group, navigate }) {
  return (
    <li className="group-row">
      <NavLink href={`/groups/${group.id}`} navigate={navigate} className="group-row__name">
        {group.name}
      </NavLink>
      <span className="group-row__meta">
        {VISIBILITY_LABEL[group.visibility]} · {group.member_count} jäsen{group.member_count === 1 ? "" : "tä"}
      </span>
      {group.my_role && <span className={`group-role group-role--${group.my_role}`}>{ROLE_LABEL[group.my_role]}</span>}
    </li>
  );
}

function CreateGroupForm({ navigate, onUnauthorized }) {
  const [values, setValues] = useState({ name: "", description: "", visibility: "private" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const change = (event) => {
    const { name, value } = event.target;
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    if (values.name.trim().length < 2) {
      setErrors({ name: "Nimessä pitää olla vähintään 2 merkkiä." });
      return;
    }
    setBusy(true);
    try {
      const view = await createGroup({
        name: values.name,
        description: values.description,
        visibility: values.visibility,
      });
      navigate(`/groups/${view.group.id}`);
    } catch (error) {
      if (error.status === 401) onUnauthorized();
      else if (Object.keys(error.fields).length) setErrors(error.fields);
      else setFormError(error.message);
      setBusy(false);
    }
  };

  return (
    <form className="group-form" onSubmit={submit} noValidate>
      <div className="group-field">
        <label htmlFor="group-name">Nimi</label>
        <input id="group-name" name="name" value={values.name} onChange={change} disabled={busy}
          maxLength={100} aria-invalid={!!errors.name} aria-describedby={errors.name ? "group-name-msg" : undefined} />
        {errors.name && <p id="group-name-msg" className="group-error" role="alert">{errors.name}</p>}
      </div>
      <div className="group-field">
        <label htmlFor="group-description">Kuvaus <span className="group-optional">(vapaaehtoinen)</span></label>
        <textarea id="group-description" name="description" rows={3} value={values.description}
          onChange={change} disabled={busy} aria-invalid={!!errors.description} />
        {errors.description && <p className="group-error" role="alert">{errors.description}</p>}
      </div>
      <fieldset className="group-visibility" disabled={busy}>
        <legend>Näkyvyys</legend>
        <label>
          <input type="radio" name="visibility" value="public" checked={values.visibility === "public"} onChange={change} />
          Julkinen – kuka tahansa voi nähdä ryhmän ja liittyä
        </label>
        <label>
          <input type="radio" name="visibility" value="private" checked={values.visibility === "private"} onChange={change} />
          Yksityinen – näkyy vain jäsenille, ylläpitäjä lisää jäsenet
        </label>
      </fieldset>
      {formError && <p className="message message--error" role="alert">{formError}</p>}
      <button className="button" type="submit" disabled={busy}>
        {busy ? "Luodaan…" : "Luo ryhmä"}
      </button>
    </form>
  );
}

// /groups: own groups with roles, creating a group, public groups.
export default function GroupsPage({ navigate }) {
  const { user, loading: authLoading, logout } = useAuth();
  const [mine, setMine] = useState({ key: null, items: [], error: null });
  const [publicGroups, setPublicGroups] = useState({ key: null, items: [], error: null });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  const userId = user?.id;
  const mineKey = userId ? `mine:${userId}` : null;
  const publicKey = `public:${search}:${userId ?? "guest"}`;

  useEffect(() => {
    if (!mineKey) return undefined;
    let cancelled = false;
    fetchMyGroups()
      .then((items) => !cancelled && setMine({ key: mineKey, items, error: null }))
      .catch((error) => {
        if (cancelled) return;
        if (error.status === 401) logout();
        else setMine({ key: mineKey, items: [], error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [mineKey, logout]);

  useEffect(() => {
    if (authLoading) return undefined;
    let cancelled = false;
    fetchPublicGroups(search)
      .then((items) => !cancelled && setPublicGroups({ key: publicKey, items, error: null }))
      .catch((error) => !cancelled && setPublicGroups({ key: publicKey, items: [], error: error.message }));
    return () => {
      cancelled = true;
    };
  }, [publicKey, search, authLoading]);

  if (authLoading) return <p className="message message--info" role="status">Ladataan…</p>;

  return (
    <div className="groups-page">
      <h1>Ryhmät</h1>

      {user ? (
        <>
          <section aria-labelledby="mine-title">
            <h2 id="mine-title">Omat ryhmät</h2>
            {mine.key !== mineKey && <p className="message message--info" role="status">Ladataan ryhmiäsi…</p>}
            {mine.key === mineKey && mine.error && <p className="message message--error" role="alert">{mine.error}</p>}
            {mine.key === mineKey && !mine.error && mine.items.length === 0 && (
              <p className="group-empty">Et ole vielä minkään ryhmän jäsen. Luo ryhmä tai liity julkiseen ryhmään.</p>
            )}
            {mine.key === mineKey && mine.items.length > 0 && (
              <ul className="group-list">
                {mine.items.map((g) => <GroupRow key={g.id} group={g} navigate={navigate} />)}
              </ul>
            )}
          </section>
          <section aria-labelledby="create-title">
            <h2 id="create-title">Luo ryhmä</h2>
            <p className="group-hint">Sinusta tulee ryhmän ylläpitäjä.</p>
            <CreateGroupForm navigate={navigate} onUnauthorized={logout} />
          </section>
        </>
      ) : (
        <p className="group-empty">
          <NavLink href={loginPathFor("/groups")} navigate={navigate}>Kirjaudu sisään</NavLink>, niin näet omat ryhmäsi ja voit luoda ryhmän.
        </p>
      )}

      <section aria-labelledby="public-title">
        <h2 id="public-title">Julkiset ryhmät</h2>
        <form className="group-search" role="search" onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()); }}>
          <label htmlFor="group-search">Hae ryhmää nimellä</label>
          <div className="group-search__row">
            <input id="group-search" type="search" value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} />
            <button className="button button--secondary" type="submit">Hae</button>
          </div>
        </form>
        {publicGroups.key !== publicKey && <p className="message message--info" role="status">Ladataan…</p>}
        {publicGroups.key === publicKey && publicGroups.error && (
          <p className="message message--error" role="alert">{publicGroups.error}</p>
        )}
        {publicGroups.key === publicKey && !publicGroups.error && publicGroups.items.length === 0 && (
          <p className="group-empty">Julkisia ryhmiä ei löytynyt.</p>
        )}
        {publicGroups.key === publicKey && publicGroups.items.length > 0 && (
          <ul className="group-list">
            {publicGroups.items.map((g) => <GroupRow key={g.id} group={g} navigate={navigate} />)}
          </ul>
        )}
      </section>
    </div>
  );
}
