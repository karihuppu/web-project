import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { AuthContext, TOKEN_KEY, clearDrafts } from "./useAuth";


const http = axios.create({
  baseURL: import.meta.env.PROD
    ? ""
    : (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, ""),
  timeout: 15000,
});

const MESSAGES = {
  400: "Tarkista syöttämäsi tiedot.",
  401: "Väärä sähköposti tai salasana.",
  403: "Salasana on väärä.",
  404: "Palvelua ei löytynyt. Yritä hetken päästä uudelleen.",
  409: "Sähköposti tai nimimerkki on jo käytössä.",
  500: "Palvelimella tapahtui virhe. Yritä hetken päästä uudelleen.",
  503: "Kirjautuminen ei ole juuri nyt käytettävissä.",
};

const makeError = (message, status, fieldErrors = {}) =>
  Object.assign(new Error(message), { status, fieldErrors });

async function request(path, { method = "GET", body, auth = false } = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  try {
    const { data } = await http.request({
      url: `/api/auth${path}`,
      method,
      data: body,
      headers: auth && token ? { Authorization: `Bearer ${token}` } : {},
    });
    return data;
  } catch (error) {
    if (!error.response) throw makeError("Palvelimeen ei saatu yhteyttä. Tarkista verkkoyhteys.", 0);
    const { status, data } = error.response;
    // Backend format: { error: { message, status, fields? } }
    const apiError = data?.error && typeof data.error === "object" ? data.error : null;
    const text =
      status >= 500 && status !== 503
        ? null
        : [apiError?.message, data?.message, data?.error].find((v) => typeof v === "string");
    const rawFields = apiError?.fields ?? data?.errors;
    const fields =
      rawFields && typeof rawFields === "object" && !Array.isArray(rawFields) ? rawFields : {};
    throw makeError(text || MESSAGES[status] || "Jokin meni pieleen. Yritä uudelleen.", status, fields);
  }
}

async function getMe() {
  const data = await request("/me", { auth: true });
  return data.user ?? data;
}


export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY));
  // Set when the profile could not be loaded for a reason other than an invalid token
  // (network or server error): the token is kept and the page can offer a retry.
  const [sessionError, setSessionError] = useState(null);

  const loadUser = useCallback(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setSessionError(null);
    getMe()
      .then(setUser)
      .catch((err) => {
        if (err.status === 401) localStorage.removeItem(TOKEN_KEY);
        else setSessionError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (email, password) => {
    const { token, user } = await request("/login", { method: "POST", body: { email, password } });
    localStorage.setItem(TOKEN_KEY, token);
    setSessionError(null);
    setUser(user ?? (await getMe()));
  };

  const register = async (email, nickname, password) => {
    // Backend returns { token, user } right away, so no second request is needed.
    const data = await request("/register", { method: "POST", body: { email, nickname, password } });
    if (data?.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      setSessionError(null);
      setUser(data.user ?? (await getMe()));
    } else {
      await login(email, password);
    }
  };

  // keepDrafts: used when the token expired while writing, so the text can be saved after
  // logging in again. A normal logout removes this user's unsaved review drafts.
  const logout = ({ keepDrafts = false } = {}) => {
    if (user && !keepDrafts) clearDrafts(user.id);
    localStorage.removeItem(TOKEN_KEY);
    setSessionError(null);
    setUser(null);
  };

  // A 401 from the account routes means the token is no longer valid.
  const signOutOn401 = (err) => {
    if (err.status === 401) logout();
    throw err;
  };

  const updateNickname = async (nickname) => {
    const data = await request("/me", { method: "PATCH", body: { nickname }, auth: true }).catch(signOutOn401);
    setUser(data.user);
    return data.user;
  };

  // Wrong password -> 403, the user stays signed in. Success -> everything of this account is
  // removed from the browser (token, user, review drafts).
  const deleteAccount = async (password) => {
    await request("/me", { method: "DELETE", body: { password }, auth: true }).catch(signOutOn401);
    logout();
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, sessionError, reloadUser: loadUser, login, register, logout, updateNickname, deleteAccount }}
    >
      {children}
    </AuthContext.Provider>
  );
}
