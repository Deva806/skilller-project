import { api, formatApiError } from "./api";

export async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post("/upload", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data; // { url, path, ... }
}

export function fileSrc(url) {
  if (!url) return url;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  const base = import.meta.env.VITE_API_URL || window.location.origin;
  return `${base}${url}`;
}

export { formatApiError };
