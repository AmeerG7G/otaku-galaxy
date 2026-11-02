/**
 * The store's social links as the admin saved them (`store_settings.social_*`,
 * read through `/catalog/settings`), turned into links a shopper may open.
 * Anything that is not a safe destination becomes `null`, and the footer then
 * leaves that one button out.
 */

export interface SocialLinks {
  tiktok: string | null;
  instagram: string | null;
  whatsapp: string | null;
}

export const NO_SOCIAL_LINKS: SocialLinks = { tiktok: null, instagram: null, whatsapp: null };

/** `https://` only — never a script, a relative path or plain http. */
export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * International digits for `wa.me`: no `+`, `00`, spaces or dashes. A local
 * Iraqi mobile (07…, the store's only phone format) gains its 964 prefix; any
 * other number starting with 0 is not international and is refused.
 */
function internationalDigits(raw: string): string | null {
  const compact = raw.replace(/[\s\-().]/g, '').replace(/^(\+|00)/, '');
  if (!/^\d{8,15}$/.test(compact)) return null;
  if (/^07[5-9]\d{8}$/.test(compact)) return `964${compact.slice(1)}`;
  return compact.startsWith('0') ? null : compact;
}

/**
 * The admin may save WhatsApp as a number (`+9647701234567`, as the dashboard
 * suggests) or as a link. A number becomes `https://wa.me/<digits>`, the same
 * as the app's account screen does; a `wa.me/<number>` link is normalised the
 * same way; any other `https://` link (`wa.me/message/…`, `api.whatsapp.com`
 * or a group link) is kept.
 */
export function whatsappHref(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    const digits = internationalDigits(trimmed);
    return digits ? `https://wa.me/${digits}` : null;
  }
  const safe = safeHttpsUrl(trimmed);
  if (!safe) return null;
  const url = new URL(safe);
  if (url.hostname !== 'wa.me') return safe;
  const path = decodeURIComponent(url.pathname.slice(1));
  // `wa.me/message/…` (a business short link) is not a number: keep it.
  if (!/^[\d\s\-().+]*$/.test(path)) return safe;
  const digits = internationalDigits(path);
  return digits ? `https://wa.me/${digits}${url.search}` : null;
}

export function toSocialLinks(social: Record<string, unknown> | undefined): SocialLinks {
  return {
    tiktok: safeHttpsUrl(social?.tiktok),
    instagram: safeHttpsUrl(social?.instagram),
    whatsapp: whatsappHref(social?.whatsapp),
  };
}
