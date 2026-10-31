import type { Metadata } from 'next';
import { ClaimRewardButton } from '@/components/AccountForms';
import { formatDateTime } from '@/lib/format';
import { requireSession, sessionRead } from '@/lib/page-session';
import { claimLabel, levelName, progressPercent, rewardStateLabel } from '@/lib/points';
import type { PointsSummary, PublicUser } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'نقاط المجرّة', robots: { index: false } };

/**
 * Galaxy points — everything from one `GET /points` (the app's own screen
 * data) plus `/auth/me` for the gendered level names. Levels are thresholds:
 * a reward unlocks when the balance reaches it, and claiming it reserves it
 * without spending points.
 */
export default async function PointsPage() {
  const returnTo = '/points';
  const session = await requireSession(returnTo);
  const [points, { user }] = await Promise.all([
    sessionRead<PointsSummary>(session, '/points', returnTo),
    sessionRead<{ user: PublicUser }>(session, '/auth/me', returnTo),
  ]);
  const rewards = new Map(points.rewards.map((reward) => [reward.levelKey, reward]));

  return (
    <div className="stack">
      <h1>🌌 نقاط المجرّة</h1>
      <section className="card stack points-head" aria-label="رصيدك">
        <p className="points-balance">
          <strong>{points.balance.toLocaleString('ar-IQ')}</strong> نقطة
        </p>
        <p>
          مستوى {points.level.number.toLocaleString('ar-IQ')} — {levelName(points.level, user.gender)}
        </p>
        {points.nextLevel ? (
          <>
            <div
              className="progress"
              role="progressbar"
              aria-label="التقدّم إلى المستوى التالي"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent(points.levelProgress)}
            >
              <span style={{ width: `${progressPercent(points.levelProgress)}%` }} />
            </div>
            <p className="hint">
              {points.pointsToNextLevel.toLocaleString('ar-IQ')} نقطة إلى مستوى {points.nextLevel.number.toLocaleString('ar-IQ')} —{' '}
              {levelName(points.nextLevel, user.gender)}
            </p>
          </>
        ) : null}
        <p className="hint">كل نقطة تقربك لمستوى أعلى. تفعيل ميزة المستوى لا يُنقص رصيد نقاطك.</p>
      </section>

      <section className="stack" aria-labelledby="levels-title">
        <h2 id="levels-title">مستوياتك في المجرّة</h2>
        <ol className="level-list">
          {points.levels.map((level) => {
            const reward = rewards.get(level.key);
            const state = reward ? rewardStateLabel(reward) : null;
            const reached = points.balance >= level.requiredPoints;
            return (
              <li key={level.key} className={`card level${reached ? ' level--reached' : ''}`}>
                <div className="summary-row">
                  <strong>
                    مستوى {level.number.toLocaleString('ar-IQ')} — {levelName(level, user.gender)}
                  </strong>
                  <span className="hint">{level.requiredPoints.toLocaleString('ar-IQ')} نقطة</span>
                </div>
                {level.rewardKind !== 'none' ? <p>{level.reward}</p> : null}
                {state ? <p className="pill pill-promo">{state}</p> : null}
                {reward?.claimable ? <ClaimRewardButton levelKey={reward.levelKey} label={claimLabel(reward)} /> : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card stack" aria-labelledby="how-title">
        <h2 id="how-title">كيف تعمل النقاط؟</h2>
        <p>تجمع النقاط من مشترياتك ومن تقييماتك، وكلما زادت ارتفع مستواك.</p>
        <ul className="rules">
          <li>
            <strong>٥</strong> عن كل ١٠٬٠٠٠ دينار من مشترياتك
          </li>
          <li>
            <strong>١</strong> عند نشر تقييم مكتوب لمنتج
          </li>
          <li>
            <strong>٥</strong> عند إرفاق صور بالتقييم (من صورة إلى خمس)
          </li>
        </ul>
        <p className="hint">لكل منتج تقييم واحد، ويُنشر بعد مراجعته. وللتقييمات في الطلب الواحد حدٌّ أعلى من النقاط.</p>
        <p className="hint">تُحتسب النقاط على قيمة المنتجات بعد الخصم — أجور التوصيل لا تُحتسب.</p>
      </section>

      <section className="stack" aria-labelledby="log-title">
        <h2 id="log-title">سجل النقاط</h2>
        {points.activity.length === 0 ? (
          <div className="card">
            <p>
              <strong>لا توجد حركات بعد</strong>
            </p>
            <p className="hint">ستظهر هنا نقاطك فور استلام أول طلب أو نشر أول تقييم.</p>
          </div>
        ) : (
          <ul className="activity-list card">
            {points.activity.map((entry) => (
              <li key={entry.id} className="summary-row">
                <span>
                  {entry.label}
                  <span className="hint"> · {formatDateTime(entry.occurredAt)}</span>
                </span>
                <strong className={entry.amount < 0 ? 'amount-negative' : 'amount-positive'}>
                  <bdi>
                    {entry.amount > 0 ? '+' : ''}
                    {entry.amount.toLocaleString('ar-IQ')}
                  </bdi>
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
