import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/AuthForms';
import { listLoyaltyLevels } from '@/lib/catalog';

export const metadata: Metadata = { title: 'نسيت كلمة المرور', robots: { index: false } };

export default async function ForgotPasswordPage() {
  return <ForgotPasswordForm levels={await listLoyaltyLevels()} />;
}
