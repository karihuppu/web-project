import axios from "axios";
import { TOKEN_KEY } from "./useAuth";

const http = axios.create({
  baseURL: import.meta.env.PROD
    ? ""
    : (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, ""),
  timeout: 15000,
});

async function call(path, { method = "GET", body } = {}) {
  try {
    const { data } = await http.request({
      url: `/api/watchlists${path}`,
      method,
      data: body,
      headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
    });
    return data;
  } catch (error) {
    // status lets the pages sign out on 401 (expired token or deleted account).
    if (!error.response) throw Object.assign(new Error("Palvelimeen ei saatu yhteyttä."), { status: 0 });
    throw Object.assign(
      new Error(error.response.data?.error?.message || "Jokin meni pieleen."),
      { status: error.response.status },
    );
  }
}

export const getLists = () => call("").then((d) => d.watchlists);
export const createList = (name) => call("", { method: "POST", body: { name } }).then((d) => d.watchlist);
export const getList = (id) => call(`/${id}`).then((d) => d.watchlist);
export const deleteList = (id) => call(`/${id}`, { method: "DELETE" });
export const addMovie = (id, movieId) => call(`/${id}/movies`, { method: "POST", body: { movie_id: movieId } });
export const removeMovie = (id, movieId) => call(`/${id}/movies/${movieId}`, { method: "DELETE" });