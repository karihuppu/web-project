import axios from "axios";
import { authHeaders } from "../auth/useAuth";

// Group API calls. The token (if any) decides who the user is; roles are decided by the backend.
const http = axios.create({
  baseURL: import.meta.env.PROD
    ? ""
    : (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, ""),
  timeout: 15000,
});

export const ROLE_LABEL = { admin: "Ylläpitäjä", member: "Jäsen" };
export const VISIBILITY_LABEL = { public: "Julkinen", private: "Yksityinen" };

// Errors become { status, message, fields } with Finnish texts.
const toError = (error) => {
  if (!error.response) {
    return { status: 0, message: "Palvelimeen ei saatu yhteyttä. Tarkista verkkoyhteys.", fields: {} };
  }
  const { status, data } = error.response;
  const apiError = data?.error && typeof data.error === "object" ? data.error : {};
  const fields = apiError.fields && typeof apiError.fields === "object" ? apiError.fields : {};
  const message =
    status >= 500 && status !== 503
      ? "Palvelimella tapahtui virhe. Yritä hetken päästä uudelleen."
      : apiError.message || "Jokin meni pieleen.";
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

export const fetchMyGroups = () => send({ method: "GET", url: "/api/groups/mine" }).then((d) => d.items);
export const fetchPublicGroups = (q) =>
  send({ method: "GET", url: "/api/groups", params: { limit: 50, ...(q ? { q } : {}) } }).then((d) => d.items);
export const fetchGroup = (id) => send({ method: "GET", url: `/api/groups/${id}` });
export const createGroup = (data) => send({ method: "POST", url: "/api/groups", data });
export const joinGroup = (id) => send({ method: "POST", url: `/api/groups/${id}/join` });
export const leaveGroup = (id) => send({ method: "DELETE", url: `/api/groups/${id}/membership` });
export const addMember = (id, nickname) =>
  send({ method: "POST", url: `/api/groups/${id}/members`, data: { nickname } });
export const removeMember = (id, userId) =>
  send({ method: "DELETE", url: `/api/groups/${id}/members/${userId}` });

// Private groups: exact-name search and join requests (issue #13).
export const searchPrivateGroup = (name) =>
  send({ method: "GET", url: "/api/groups/private", params: { name } }).then((d) => d.match);
export const requestToJoin = (id) => send({ method: "POST", url: `/api/groups/${id}/requests` });
export const fetchJoinRequests = (id) =>
  send({ method: "GET", url: `/api/groups/${id}/requests` }).then((d) => d.items);
export const approveJoinRequest = (id, requestId) =>
  send({ method: "POST", url: `/api/groups/${id}/requests/${requestId}/approve` });
export const rejectJoinRequest = (id, requestId) =>
  send({ method: "POST", url: `/api/groups/${id}/requests/${requestId}/reject` });

// Sharing own watchlists to groups (migration 005)
export const fetchShares = (listId) =>
  send({ method: "GET", url: `/api/watchlists/${listId}/shares` }).then((d) => d.shares);
export const shareWatchlist = (listId, groupId) =>
  send({ method: "POST", url: `/api/watchlists/${listId}/shares`, data: { group_id: groupId } });
export const unshareWatchlist = (listId, groupId) =>
  send({ method: "DELETE", url: `/api/watchlists/${listId}/shares/${groupId}` });
export const fetchGroupWatchlists = (groupId) =>
  send({ method: "GET", url: `/api/groups/${groupId}/watchlists` }).then((d) => d.watchlists);
export const fetchGroupWatchlist = (groupId, listId) =>
  send({ method: "GET", url: `/api/groups/${groupId}/watchlists/${listId}` }).then((d) => d.watchlist);
export const copyGroupWatchlist = (groupId, listId) =>
  send({ method: "POST", url: `/api/groups/${groupId}/watchlists/${listId}/copy` }).then((d) => d.watchlist);