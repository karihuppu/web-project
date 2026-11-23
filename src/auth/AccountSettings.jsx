import { useRef, useState } from "react";
import { useAuth } from "./useAuth";
import "./account.css";

const NICK_MIN = 3;
const NICK_MAX = 20;

const nicknameError = (value) => {
  const nick = value.trim();
  if (nick.length < NICK_MIN) return "Nimimerkissä pitää olla vähintään 3 merkkiä.";
  if (nick.length > NICK_MAX) return "Nimimerkki saa olla enintään 20 merkkiä.";
  return null;
};

// Change the nickname. The header and the profile update from AuthContext right away.
export function NicknameForm() {
  const { user, updateNickname } = useAuth();
  const [value, setValue] = useState(user.nickname);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setSuccess(null);
    setFormError(null);
    const found = nicknameError(value);
    setError(found);
    if (found) return;
    setBusy(true);
    try {
      const saved = await updateNickname(value.trim());
      setValue(saved.nickname);
      setSuccess("Nimimerkki tallennettiin.");
    } catch (err) {
      if (err.fieldErrors?.nickname) setError(err.fieldErrors.nickname);
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="account-section" aria-labelledby="nickname-title">
      <h2 id="nickname-title">Muuta nimimerkkiä</h2>
      <form onSubmit={submit} noValidate>
        <div className="auth-field">
          <label htmlFor="account-nickname">Nimimerkki</label>
          <input
            id="account-nickname"
            name="nickname"
            autoComplete="nickname"
            value={value}
            disabled={busy}
            aria-invalid={!!error}
            aria-describedby="account-nickname-msg"
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
              setSuccess(null);
            }}
          />
          {error ? (
            <p id="account-nickname-msg" className="auth-error" role="alert">{error}</p>
          ) : (
            <p id="account-nickname-msg" className="auth-hint">3–20 merkkiä. Näkyy arvosteluissasi.</p>
          )}
        </div>
        {formError && <p className="auth-error auth-form-error" role="alert">{formError}</p>}
        {success && <p className="account-success" role="status">{success}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Tallennetaan…" : "Tallenna nimimerkki"}
        </button>
      </form>
    </section>
  );
}

// Delete the account after confirming with the current password.
export function DeleteAccount({ navigate }) {
  const { deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const openButton = useRef(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPassword("");
    setError(null);
    setFormError(null);
    // Return keyboard focus to the button that opened the confirmation.
    setTimeout(() => openButton.current?.focus(), 0);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    if (!password) {
      setError("Syötä nykyinen salasanasi.");
      return;
    }
    setBusy(true);
    try {
      await deleteAccount(password);
      navigate("/");
    } catch (err) {
      // 403 wrong password: the account and the session stay. 401: AuthContext already signed out.
      if (err.fieldErrors?.password) setError(err.fieldErrors.password);
      else setFormError(err.message);
      setPassword("");
      setBusy(false);
    }
  };

  return (
    <section className="account-section account-danger" aria-labelledby="delete-title">
      <h2 id="delete-title">Poista tili</h2>
      {!open ? (
        <>
          <p>Tilin poistoa ei voi perua.</p>
          <button
            ref={openButton}
            type="button"
            className="account-danger__open"
            aria-expanded="false"
            aria-controls="delete-account-form"
            onClick={() => setOpen(true)}
          >
            Poista tili…
          </button>
        </>
      ) : (
        <form
          id="delete-account-form"
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          noValidate
        >
          <p>Kun poistat tilisi:</p>
          <ul className="account-danger__list">
            <li>tilisi, nimimerkkisi ja omat toivelistasi poistetaan,</li>
            <li>jäsenyytesi ryhmissä päättyvät,</li>
            <li>antamasi tähtiarviot jäävät näkyviin nimettöminä ("Poistettu käyttäjä"),</li>
            <li>arvostelujesi kommentit poistetaan.</li>
          </ul>
          <div className="auth-field">
            <label htmlFor="delete-password">Vahvista nykyisellä salasanalla</label>
            <input
              id="delete-password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              disabled={busy}
              aria-invalid={!!error}
              aria-describedby={error ? "delete-password-msg" : undefined}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
            />
            {error && <p id="delete-password-msg" className="auth-error" role="alert">{error}</p>}
          </div>
          {formError && <p className="auth-error auth-form-error" role="alert">{formError}</p>}
          <div className="account-danger__actions">
            <button type="submit" className="account-danger__confirm" disabled={busy}>
              {busy ? "Poistetaan…" : "Poista tili pysyvästi"}
            </button>
            <button type="button" className="account-danger__cancel" disabled={busy} onClick={close}>
              Peruuta
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
