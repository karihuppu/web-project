import { useEffect, useState } from "react";
import { useAuth, loginPathFor } from "../auth/useAuth";
import {
  ROLE_LABEL,
  VISIBILITY_LABEL,
  fetchGroup,
  joinGroup,
  leaveGroup,
  addMember,
  removeMember,
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

function AddMemberForm({ groupId, onAdded, onUnauthorized }) {
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!nickname.trim()) {
      setError("Syötä käyttäjän nimimerkki.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { member } = await addMember(groupId, nickname.trim());
      setNickname("");
      onAdded(`${member.nickname} lisättiin ryhmään.`);
    } catch (err) {
      if (err.status === 401) onUnauthorized();
      else setError(err.fields.nickname || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="group-form group-add" onSubmit={submit} noValidate>
      <div className="group-field">
        <label htmlFor="add-member">Lisää jäsen nimimerkillä</label>
        <div className="group-search__row">
          <input id="add-member" value={nickname} disabled={busy} maxLength={20} autoComplete="off"
            aria-invalid={!!error} aria-describedby={error ? "add-member-msg" : "add-member-hint"}
            onChange={(e) => { setNickname(e.target.value); setError(null); }} />
          <button className="button" type="submit" disabled={busy}>{busy ? "Lisätään…" : "Lisää"}</button>
        </div>
        {error ? (
          <p id="add-member-msg" className="group-error" role="alert">{error}</p>
        ) : (
          <p id="add-member-hint" className="group-hint">Kirjoita nimimerkki täsmälleen (kirjainkoolla ei ole väliä).</p>
        )}
      </div>
    </form>
  );
}

// /groups/:id — group details, own role, join / leave, admin: add and remove members.
export default function GroupPage({ groupId, navigate }) {
  const { user, loading: authLoading, logout } = useAuth();
  const [version, setVersion] = useState(0);
  const [view, setView] = useState({ key: null, data: null, status: null, message: null });
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const userId = user?.id;
  const key = authLoading ? null : `${groupId}:${userId ?? "guest"}:${version}`;

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    fetchGroup(groupId)
      .then((data) => !cancelled && setView({ key, data, status: 200, message: null }))
      .catch((error) => {
        if (cancelled) return;
        if (error.status === 401) {
          logout(); // expired token: load again as a guest
          return;
        }
        setView({ key, data: null, status: error.status, message: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [key, groupId, logout]);

  const reload = (message) => {
    setNotice(message ? { kind: "info", text: message } : null);
    setConfirmLeave(false);
    setConfirmRemove(null);
    setVersion((v) => v + 1);
  };

  const run = async (action, successMessage) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      reload(successMessage);
    } catch (error) {
      if (error.status === 401) logout();
      else setNotice({ kind: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <NavLink href="/groups" navigate={navigate} className="text-link back-link">← Ryhmät</NavLink>
  );

  if (!key || view.key !== key) {
    return (
      <div className="group-page">
        {back}
        <p className="message message--info" role="status">Ladataan ryhmää…</p>
      </div>
    );
  }

  if (!view.data) {
    return (
      <div className="group-page">
        {back}
        {notice && <p className="message message--info" role="status">{notice.text}</p>}
        {!notice && (
          <p className="message message--error" role="alert">
            {view.status === 404 || view.status === 400
              ? "Ryhmää ei löytynyt. Se voi olla yksityinen tai poistettu."
              : view.message}
          </p>
        )}
      </div>
    );
  }

  const { group, my_role: myRole, members } = view.data;
  const isAdmin = myRole === "admin";
  const onlyMember = members.length === 1;
  const otherAdmins = members.some((m) => m.role === "admin" && m.id !== userId);

  return (
    <div className="group-page">
      {back}
      <section className="group-header" aria-labelledby="group-title">
        <p className="eyebrow">{VISIBILITY_LABEL[group.visibility]} ryhmä</p>
        <h1 id="group-title">{group.name}</h1>
        {group.description && <p className="group-description">{group.description}</p>}
        <p className="group-row__meta">
          {group.member_count} jäsen{group.member_count === 1 ? "" : "tä"}
          {myRole && (
            <>
              {" · Roolisi: "}
              <span className={`group-role group-role--${myRole}`}>{ROLE_LABEL[myRole]}</span>
            </>
          )}
        </p>
      </section>

      {notice && (
        <p className={`message message--${notice.kind === "error" ? "error" : "info"}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      )}

      <div className="group-actions">
        {!user && group.visibility === "public" && (
          <p>
            <NavLink href={loginPathFor(`/groups/${group.id}`)} navigate={navigate}>Kirjaudu sisään</NavLink>, niin voit liittyä ryhmään.
          </p>
        )}
        {user && !myRole && group.visibility === "public" && (
          <button className="button" type="button" disabled={busy}
            onClick={() => run(() => joinGroup(group.id), "Liityit ryhmään.")}>
            {busy ? "Liitytään…" : "Liity ryhmään"}
          </button>
        )}
        {myRole && !confirmLeave && (
          <button className="button button--secondary" type="button" disabled={busy} onClick={() => setConfirmLeave(true)}>
            Poistu ryhmästä
          </button>
        )}
        {myRole && confirmLeave && (
          <div className="group-confirm" role="group" aria-label="Ryhmästä poistumisen vahvistus">
            <p>
              Poistutaanko ryhmästä <strong>{group.name}</strong>?{" "}
              {onlyMember
                ? "Olet ryhmän ainoa jäsen, joten ryhmä poistetaan."
                : isAdmin && !otherAdmins
                  ? "Ylläpito siirtyy jäsenelle, joka on ollut ryhmässä pisimpään."
                  : ""}
            </p>
            <button className="button" type="button" disabled={busy} autoFocus
              onClick={() => run(() => leaveGroup(group.id), onlyMember
                ? "Poistuit ryhmästä. Ryhmä poistettiin, koska siihen ei jäänyt jäseniä."
                : "Poistuit ryhmästä.")}>
              {busy ? "Poistutaan…" : "Kyllä, poistu"}
            </button>
            <button className="button button--secondary" type="button" disabled={busy} onClick={() => setConfirmLeave(false)}>
              Peruuta
            </button>
          </div>
        )}
      </div>

      {isAdmin && (
        <section aria-labelledby="admin-title">
          <h2 id="admin-title">Ylläpito</h2>
          <AddMemberForm groupId={group.id} onAdded={reload} onUnauthorized={logout} />
        </section>
      )}

      <section aria-labelledby="members-title">
        <h2 id="members-title">Jäsenet</h2>
        <ul className="group-list">
          {members.map((m) => (
            <li className="group-row" key={m.id}>
              <span className="group-row__name">{m.nickname}{m.id === userId ? " (sinä)" : ""}</span>
              <span className={`group-role group-role--${m.role}`}>{ROLE_LABEL[m.role]}</span>
              {isAdmin && m.role === "member" && m.id !== userId && (
                confirmRemove === m.id ? (
                  <span className="group-row__confirm">
                    <button className="button" type="button" disabled={busy}
                      onClick={() => run(() => removeMember(group.id, m.id), `${m.nickname} poistettiin ryhmästä.`)}>
                      Vahvista poisto
                    </button>
                    <button className="button button--secondary" type="button" disabled={busy} onClick={() => setConfirmRemove(null)}>
                      Peruuta
                    </button>
                  </span>
                ) : (
                  <button className="button button--secondary group-row__remove" type="button" disabled={busy}
                    onClick={() => setConfirmRemove(m.id)} aria-label={`Poista ${m.nickname} ryhmästä`}>
                    Poista
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
