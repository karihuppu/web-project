import { createContext, useContext } from "react";

// Kept in its own file: React Fast Refresh (and the lint rule
// react-refresh/only-export-components) wants component files to export only components.
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Where the JWT is kept in the browser (shared by AuthContext and the review form).
export const TOKEN_KEY = "token";
export const authHeaders = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Unsaved review texts are kept per user: "review-draft:<userId>:<movieId>" in sessionStorage.
// A draft of one account is never shown to another account in the same browser.
export const DRAFT_PREFIX = "review-draft:";
export const clearDrafts = (userId) => {
  try {
    const prefix = `${DRAFT_PREFIX}${userId}:`;
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable: nothing to clear */
  }
};

// "?next=/movies/5" after login. Only internal paths of this site are accepted, so the
// parameter cannot send the user to another site (no open redirect).
const NOT_AFTER_LOGIN = ["/login", "/register"];
export const safeNextPath = (search) => {
  let next;
  try {
    next = new URLSearchParams(search).get("next");
  } catch {
    return "/";
  }
  if (
    typeof next !== "string" ||
    next.length > 200 ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    [...next].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    return "/";
  let url;
  try {
    url = new URL(next, window.location.origin);
  } catch {
    return "/";
  }
  if (url.origin !== window.location.origin || NOT_AFTER_LOGIN.includes(url.pathname)) return "/";
  return url.pathname + url.search;
};

export const loginPathFor = (path) => `/login?next=${encodeURIComponent(path)}`;
