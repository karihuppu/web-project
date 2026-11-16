import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import {
  COMMENT_MAX,
  charCount,
  fetchOwnReview,
  createOwnReview,
  updateOwnReview,
  deleteOwnReview,
  saveDraft,
  loadDraft,
  clearDraft,
} from "./reviewApi";
import "./myReview.css";

const EMPTY = { rating: 0, comment: "" };
const toForm = (review) =>
  review ? { rating: review.rating, comment: review.comment ?? "" } : EMPTY;

const validate = ({ rating, comment }) => {
  const errors = {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    errors.rating = "Valitse arvosana 1–5 tähteä.";
  if (charCount(comment.trim()) > COMMENT_MAX)
    errors.comment = `Kommentti saa olla enintään ${COMMENT_MAX} merkkiä.`;
  return errors;
};

function NavLink({ href, navigate, children }) {
  return (
    <a
      href={href}
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

// The signed-in user's own review of one movie: create, edit and delete.
// Only a convenience for the user: the backend checks the author from the token.
export default function MyReview({ movieId, navigate, onChanged }) {
  const { user, loading: authLoading, logout } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [own, setOwn] = useState({ key: null, status: "loading", review: null });
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadKey = user ? `${movieId}:${user.id}:${attempt}` : null;

  // Own review comes from GET /api/movies/:id/review, not from the paged public list.
  useEffect(() => {
    if (!loadKey) return undefined;
    let cancelled = false;
    fetchOwnReview(movieId)
      .then((review) => {
        if (cancelled) return;
        const draft = loadDraft(movieId);
        setOwn({ key: loadKey, status: "ready", review });
        setForm(draft ?? toForm(review));
        setErrors({});
        setConfirmDelete(false);
        setNotice(
          draft
            ? { kind: "info", text: "Tallentamaton arviosi palautettiin. Tallenna se, kun olet valmis." }
            : null,
        );
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.status === 401) {
          logout(); // token expired or account removed
          return;
        }
        setOwn({ key: loadKey, status: "error", review: null, message: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [loadKey, movieId, logout]);

  if (authLoading) return null;

  if (!user) {
    const draft = loadDraft(movieId);
    return (
      <section className="my-review my-review--guest" aria-labelledby="my-review-title">
        <h2 id="my-review-title">Arvioi elokuva</h2>
        <p>
          {draft
            ? "Istuntosi vanheni. Kirjoittamasi arvio on tallessa tässä välilehdessä: kirjaudu sisään ja palaa tähän elokuvaan, niin voit tallentaa sen."
            : "Kirjaudu sisään, niin voit antaa elokuvalle tähdet ja kirjoittaa kommentin."}
        </p>
        <p className="my-review__links">
          <NavLink href="/login" navigate={navigate}>Kirjaudu sisään</NavLink>
          <NavLink href="/register" navigate={navigate}>Luo tili</NavLink>
        </p>
      </section>
    );
  }

  const loading = own.key !== loadKey;
  const existing = own.review;

  const handleWriteError = async (error) => {
    if (error.status === 401) {
      saveDraft(movieId, form); // keep the text, then ask the user to log in again
      logout();
      return;
    }
    if (error.status === 400) {
      setErrors(error.fields);
      setNotice({ kind: "error", text: error.message });
      return;
    }
    if (error.status === 409) {
      // Written meanwhile, e.g. in another tab: switch to editing and keep the typed text.
      try {
        const review = await fetchOwnReview(movieId);
        setOwn((current) => ({ ...current, review }));
      } catch {
        /* the message below is enough */
      }
      setNotice({
        kind: "info",
        text: "Olet jo arvioinut tämän elokuvan. Tallenna uudelleen, niin arviosi päivitetään.",
      });
      onChanged(0);
      return;
    }
    if (error.status === 404 && existing) {
      // Deleted meanwhile: the next save creates it again.
      setOwn((current) => ({ ...current, review: null }));
      setNotice({ kind: "info", text: "Arviotasi ei enää löytynyt. Tallenna uudelleen, niin se luodaan uutena." });
      onChanged(0);
      return;
    }
    setNotice({ kind: "error", text: error.message });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) {
      setNotice(null);
      return;
    }
    setBusy(true);
    setNotice(null);
    const payload = { rating: form.rating, comment: form.comment };
    try {
      const saved = existing
        ? await updateOwnReview(movieId, payload)
        : await createOwnReview(movieId, payload);
      clearDraft(movieId);
      setOwn((current) => ({ ...current, review: saved }));
      setForm(toForm(saved));
      setNotice({ kind: "success", text: existing ? "Muutokset tallennettiin." : "Arviosi tallennettiin." });
      onChanged(existing ? 0 : 1);
    } catch (error) {
      await handleWriteError(error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await deleteOwnReview(movieId);
      clearDraft(movieId);
      setOwn((current) => ({ ...current, review: null }));
      setForm(EMPTY);
      setErrors({});
      setNotice({ kind: "success", text: "Arviosi poistettiin. Voit halutessasi kirjoittaa uuden." });
      onChanged(-1);
    } catch (error) {
      if (error.status === 401) {
        logout();
      } else if (error.status === 404) {
        setOwn((current) => ({ ...current, review: null }));
        setForm(EMPTY);
        setNotice({ kind: "info", text: "Arvio oli jo poistettu." });
        onChanged(0);
      } else {
        setNotice({ kind: "error", text: error.message });
      }
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const setRating = (rating) => {
    setForm((current) => ({ ...current, rating }));
    setErrors((current) => ({ ...current, rating: undefined }));
  };

  const length = charCount(form.comment.trim());

  return (
    <section className="my-review" aria-labelledby="my-review-title" aria-busy={busy || loading}>
      <h2 id="my-review-title">{existing ? "Oma arviosi" : "Arvioi elokuva"}</h2>
      <p className="my-review__as">Kirjoitat nimimerkillä <strong>{user.nickname}</strong>.</p>

      {loading && <p className="message message--info" role="status">Ladataan arviotasi…</p>}

      {!loading && own.status === "error" && (
        <div className="message message--error" role="alert">
          <p>{own.message || "Arviotasi ei voitu ladata."}</p>
          <button className="button button--secondary" onClick={() => setAttempt((a) => a + 1)}>
            Yritä uudelleen
          </button>
        </div>
      )}

      {!loading && own.status === "ready" && (
        <form onSubmit={submit} noValidate>
          <fieldset className="my-review__stars" disabled={busy} aria-describedby={errors.rating ? "rating-error" : undefined}>
            <legend>Arvosana</legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={n <= form.rating ? "is-on" : undefined}>
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={form.rating === n}
                  onChange={() => setRating(n)}
                />
                <span aria-hidden="true">★</span>
                <span className="my-review__sr">{n} / 5</span>
              </label>
            ))}
          </fieldset>
          {errors.rating && <p id="rating-error" className="my-review__error" role="alert">{errors.rating}</p>}

          <label className="my-review__label" htmlFor="review-comment">
            Kommentti <span className="my-review__optional">(vapaaehtoinen)</span>
          </label>
          <textarea
            id="review-comment"
            rows={4}
            value={form.comment}
            disabled={busy}
            aria-invalid={!!errors.comment}
            aria-describedby="review-comment-count"
            onChange={(event) => {
              setForm((current) => ({ ...current, comment: event.target.value }));
              setErrors((current) => ({ ...current, comment: undefined }));
            }}
          />
          <p
            id="review-comment-count"
            className={`my-review__count${length > COMMENT_MAX ? " is-over" : ""}`}
          >
            {length} / {COMMENT_MAX}
          </p>
          {errors.comment && <p className="my-review__error" role="alert">{errors.comment}</p>}

          {notice && (
            <p
              className={`message message--${notice.kind === "error" ? "error" : "info"} my-review__notice`}
              role={notice.kind === "error" ? "alert" : "status"}
            >
              {notice.text}
            </p>
          )}

          <div className="my-review__actions">
            <button className="button" type="submit" disabled={busy}>
              {busy ? "Tallennetaan…" : existing ? "Tallenna muutokset" : "Tallenna arvio"}
            </button>
            {existing && !confirmDelete && (
              <button
                className="button button--secondary"
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                Poista arvio
              </button>
            )}
          </div>

          {existing && confirmDelete && (
            <div className="my-review__confirm" role="group" aria-label="Arvion poiston vahvistus">
              <p>Poistetaanko arviosi pysyvästi?</p>
              <button className="button" type="button" disabled={busy} onClick={remove}>
                {busy ? "Poistetaan…" : "Kyllä, poista"}
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
              >
                Peruuta
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}
