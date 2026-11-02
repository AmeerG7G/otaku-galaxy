import type { Metadata } from 'next';
import Link from '@/components/Link';
import { ProfileForm } from '@/components/AccountForms';
import { mediaOrigin } from '@/lib/config';
import { requireSession, sessionRead } from '@/lib/page-session';
import type { PublicUser } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'تعديل الملف الشخصي', robots: { index: false } };

export default async function ProfilePage() {
  const returnTo = '/account/profile';
  const session = await requireSession(returnTo);
  const { user } = await sessionRead<{ user: PublicUser }>(session, '/auth/me', returnTo);
  return (
    <div className="narrow stack">
      <p>
        <Link href="/account">حسابي</Link>
      </p>
      <h1>تعديل الملف الشخصي</h1>
      <ProfileForm initial={{ username: user.username, gender: user.gender, avatarUrl: user.avatarUrl ?? null }} mediaOrigin={mediaOrigin()} />
    </div>
  );
}
