import axios from "axios";
import { authHeaders } from "../auth/useAuth";

// Calls for the signed-in user's own review. The backend decides the author from the token.
const http = axios.create({
  baseURL: import.meta.env.PROD
    ? ""
    : (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, ""),
  timeout: 15000,
});

export const COMMENT_MAX = 2000;
export const charCount = (text) => [...text].length; // same as PostgreSQL char_length

// Errors become { status, message, fields } with Finnish texts.
const toError = (error) => {
  if (!error.response) {
    return { status: 0, message: "Palvelimeen ei saatu yhteyttä. Tarkista verkkoyhteys.", fields: {} };
  }
  const { status, data } = error.response;
  const apiError = data?.error && typeof data.error === "object" ? data.error : {};
  const fields = apiError.fields && typeof apiError.fields === "object" ? apiError.fields : {};
  const message =
    status >= 500 ? "Palvelimella tapahtui virhe. Yritä hetken päästä uudelleen." : apiError.message || "Jokin meni pieleen.";
  return { status, message, fields };
};

const send = async (config) => {
  try {
    const { data } = await http.request({ ...config, headers: authHeaders() });
    return data;
  } catch (error) {
    throw toError(error);
  }
};

export const fetchOwnReview = (movieId) =>
  send({ method: "GET", url: `/api/movies/${movieId}/review` }).then((data) => data.review);

export const createOwnReview = (movieId, review) =>
  send({ method: "POST", url: `/api/movies/${movieId}/reviews`, data: review });

export const updateOwnReview = (movieId, review) =>
  send({ method: "PUT", url: `/api/movies/${movieId}/review`, data: review });

export const deleteOwnReview = (movieId) =>
  send({ method: "DELETE", url: `/api/movies/${movieId}/review` });

// Unsaved text survives an expired session (kept for this browser tab only).
const draftKey = (movieId) => `review-draft:${movieId}`;
export const saveDraft = (movieId, draft) => {
  try {
    sessionStorage.setItem(draftKey(movieId), JSON.stringify(draft));
  } catch {
    /* storage unavailable: nothing else to do */
  }
};
export const loadDraft = (movieId) => {
  try {
    return JSON.parse(sessionStorage.getItem(draftKey(movieId)) || "null");
  } catch {
    return null;
  }
};
export const clearDraft = (movieId) => {
  try {
    sessionStorage.removeItem(draftKey(movieId));
  } catch {
    /* ignore */
  }
};
