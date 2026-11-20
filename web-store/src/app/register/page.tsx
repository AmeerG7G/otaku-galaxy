import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/AuthForms';
import { readSession } from '@/lib/server-session';

export const metadata: Metadata = { title: 'طلب حساب', robots: { index: false } };

export default async function RegisterPage() {
  if (await readSession()) redirect('/account');
  return <RegisterForm />;
}
