import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { WhatsAppSignup } from '@/components/WhatsAppSignup';
import { readSession } from '@/lib/server-session';
import { whatsappSignupEnabled } from '@/lib/whatsapp-signup';

export const metadata: Metadata = { title: 'التحقق عبر واتساب', robots: { index: false } };

/** Only when the API runs `WHATSAPP_VERIFY_MODE=auto`; otherwise this page does not exist. */
export default async function WhatsAppSignupPage() {
  if (await readSession()) redirect('/account');
  if (!(await whatsappSignupEnabled())) notFound();
  return <WhatsAppSignup />;
}

