/**
 * Source URLs are provider data, not trusted application routes. Only allow
 * ordinary web links into an href; schemes such as javascript: are rejected.
 */
export function externalHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
