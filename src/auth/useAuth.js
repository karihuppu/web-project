import { createContext, useContext } from "react";

// Kept in its own file: React Fast Refresh (and the lint rule
// react-refresh/only-export-components) wants component files to export only components.
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
