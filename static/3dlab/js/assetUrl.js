export const ASSET_BASE =
  "https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/";

export function resolveAssetUrl(path) {
  if (!path) return "";

  const s = String(path);

  if (
    /^https?:\/\//i.test(s) ||
    s.startsWith("/") ||
    s.startsWith("data:")
  ) {
    return s;
  }

  return ASSET_BASE + s.replace(/^\/+/, "");
}

export function getAssetCacheKey(url) {
  try {
    const u = new URL(url);

    const oldPath = u.searchParams.get("path");
    if (oldPath) return oldPath;

    const base = new URL(ASSET_BASE);

    if (u.origin === base.origin && u.pathname.startsWith(base.pathname)) {
      return decodeURIComponent(u.pathname.slice(base.pathname.length));
    }

    return url;
  } catch {
    return String(url || "");
  }
}
