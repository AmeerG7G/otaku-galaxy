import { apiFetch } from './api';

/**
 * Is WhatsApp sign-up switched on (API `WHATSAPP_VERIFY_MODE=auto`)? Any
 * failure — an older API without the route, a network error — reads as "off",
 * so the register page stays exactly as it was.
 */
export async function whatsappSignupEnabled(): Promise<boolean> {
  try {
    const { data } = await apiFetch<{ whatsapp?: { enabled?: boolean } }>('/auth/registration-options');
    return data?.whatsapp?.enabled === true;
  } catch {
    return false;
  }
}
