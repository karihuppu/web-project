import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import "./auth.css";


function AuthLink({ href, navigate, children, ...props }) {
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

function Field({ id, label, error, hint, ...input }) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-msg` : undefined} {...input} />
      {error ? (
        <p id={`${id}-msg`} className="auth-error" role="alert">{error}</p>
      ) : (
        hint && <p id={`${id}-msg`} className="auth-hint">{hint}</p>
      )}
    </div>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateLogin({ email, password }) {
  const e = {};
  if (!email.trim()) e.email = "Syötä sähköpostiosoite.";
  else if (!EMAIL.test(email.trim())) e.email = "Sähköpostiosoite ei ole kelvollinen.";
  if (!password) e.password = "Syötä salasana.";
  return e;
}

function validateRegister({ email, nickname, password, confirm }) {
  const e = validateLogin({ email, password: "x" });
  const nick = nickname.trim();
  if (nick.length < 3) e.nickname = "Nimimerkissä pitää olla vähintään 3 merkkiä.";
  else if (nick.length > 20) e.nickname = "Nimimerkki saa olla enintään 20 merkkiä.";
  if (password.length < 8) e.password = "Salasanassa pitää olla vähintään 8 merkkiä.";
  if (confirm !== password) e.confirm = "Salasanat eivät täsmää.";
  return e;
}


function useForm(initial, validate, submit) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onChange = (e) => {
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));
    setErrors((er) => ({ ...er, [e.target.name]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      await submit(values);
    } catch (err) {
      if (Object.keys(err.fieldErrors || {}).length) setErrors(err.fieldErrors);
      else setFormError(err.message);
      setSubmitting(false);
    }
  };

  return { values, errors, formError, submitting, onChange, onSubmit };
}


function useRedirectWhenLoggedIn(navigate) {
  const { user } = useAuth();
  useEffect(() => {
    if (user) navigate("/");
  }, [user]); 
}



export function LoginPage({ navigate }) {
  const { login } = useAuth();
  useRedirectWhenLoggedIn(navigate);
  const f = useForm({ email: "", password: "" }, validateLogin, (v) => login(v.email.trim(), v.password));

  return (
    <div className="auth-card">
      <h1>Kirjaudu sisään</h1>
      <form onSubmit={f.onSubmit} noValidate>
        <Field id="email" label="Sähköposti" type="email" autoComplete="email"
          value={f.values.email} onChange={f.onChange} error={f.errors.email} />
        <Field id="password" label="Salasana" type="password" autoComplete="current-password"
          value={f.values.password} onChange={f.onChange} error={f.errors.password} />
        {f.formError && <p className="auth-error auth-form-error" role="alert">{f.formError}</p>}
        <button type="submit" disabled={f.submitting}>
          {f.submitting ? "Kirjaudutaan…" : "Kirjaudu sisään"}
        </button>
      </form>
      <p className="auth-switch">
        Ei vielä tiliä? <AuthLink href="/register" navigate={navigate}>Luo tili</AuthLink>
      </p>
    </div>
  );
}

export function RegisterPage({ navigate }) {
  const { register } = useAuth();
  useRedirectWhenLoggedIn(navigate);
  const f = useForm(
    { email: "", nickname: "", password: "", confirm: "" },
    validateRegister,
    (v) => register(v.email.trim(), v.nickname.trim(), v.password)
  );

  return (
    <div className="auth-card">
      <h1>Luo tili</h1>
      <form onSubmit={f.onSubmit} noValidate>
        <Field id="email" label="Sähköposti" type="email" autoComplete="email"
          value={f.values.email} onChange={f.onChange} error={f.errors.email} />
        <Field id="nickname" label="Nimimerkki" autoComplete="nickname"
          value={f.values.nickname} onChange={f.onChange} error={f.errors.nickname}
          hint="3–20 merkkiä. Näkyy muille käyttäjille." />
        <Field id="password" label="Salasana" type="password" autoComplete="new-password"
          value={f.values.password} onChange={f.onChange} error={f.errors.password}
          hint="Vähintään 8 merkkiä." />
        <Field id="confirm" label="Salasana uudelleen" type="password" autoComplete="new-password"
          value={f.values.confirm} onChange={f.onChange} error={f.errors.confirm} />
        {f.formError && <p className="auth-error auth-form-error" role="alert">{f.formError}</p>}
        <button type="submit" disabled={f.submitting}>
          {f.submitting ? "Luodaan tiliä…" : "Luo tili"}
        </button>
      </form>
      <p className="auth-switch">
        Onko sinulla jo tili? <AuthLink href="/login" navigate={navigate}>Kirjaudu sisään</AuthLink>
      </p>
    </div>
  );
}

export function AccountPage({ navigate }) {
  const { user, loading, logout } = useAuth();


  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user]); 

  if (loading) return <p className="auth-loading">Ladataan…</p>;
  if (!user) return null;

  return (
    <div className="auth-card">
      <h1>Hei, {user.nickname}</h1>
      <dl className="auth-details">
        <dt>Nimimerkki</dt><dd>{user.nickname}</dd>
        <dt>Sähköposti</dt><dd>{user.email}</dd>
      </dl>
      <button type="button" onClick={() => { logout(); navigate("/"); }}>
        Kirjaudu ulos
      </button>
    </div>
  );
}

export function AuthNav({ navigate }) {
  const { user, loading, logout } = useAuth();
  if (loading) return null;

  return user ? (
    <span className="auth-nav">
      <AuthLink href="/account" navigate={navigate} className="header-link">{user.nickname}</AuthLink>
      <button type="button" className="header-link auth-logout" onClick={() => { logout(); navigate("/"); }}>
        Kirjaudu ulos
      </button>
    </span>
  ) : (
    <span className="auth-nav">
      <AuthLink href="/login" navigate={navigate} className="header-link">Kirjaudu</AuthLink>
      <AuthLink href="/register" navigate={navigate} className="header-link">Luo tili</AuthLink>
    </span>
  );
}