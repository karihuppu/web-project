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
