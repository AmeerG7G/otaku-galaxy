/**
 * The Google Play link shown on the site, taken from the admin's existing
 * app-update setting (`app_update_url`, served as `androidStoreUrl` by
 * `/catalog/app-version`). Only a Play Store listing is accepted: the setting is
 * free text an admin types, and the site must not link anywhere else under a
 * "Google Play" label. Anything else, or no value yet, hides the link.
 */
export function playStoreUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'play.google.com' || url.username || url.password || url.port) {
    return null;
  }
  if (url.pathname !== '/store/apps/details') return null;
  const id = url.searchParams.get('id');
  if (!id || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(id)) return null;
  return `https://play.google.com/store/apps/details?id=${id}`;
}
