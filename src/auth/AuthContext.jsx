import { useEffect, useState } from "react";
import axios from "axios";
import { AuthContext, TOKEN_KEY } from "./useAuth";


const http = axios.create({
  baseURL: import.meta.env.PROD
    ? ""
    : (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, ""),
  timeout: 15000,
});

const MESSAGES = {
  400: "Tarkista syöttämäsi tiedot.",
  401: "Väärä sähköposti tai salasana.",
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

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    getMe()
      .then(setUser)
      .catch((err) => {
        if (err.status === 401) localStorage.removeItem(TOKEN_KEY); 
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { token, user } = await request("/login", { method: "POST", body: { email, password } });
    localStorage.setItem(TOKEN_KEY, token);
    setUser(user ?? (await getMe()));
  };

  const register = async (email, nickname, password) => {
    // Backend returns { token, user } right away, so no second request is needed.
    const data = await request("/register", { method: "POST", body: { email, nickname, password } });
    if (data?.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user ?? (await getMe()));
    } else {
      await login(email, password);
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}