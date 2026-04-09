const browserHost =
  typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";

export const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || `http://${browserHost}:5000/api`;

export function apiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
