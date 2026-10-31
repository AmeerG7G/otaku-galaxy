import type { Level, RewardState } from './types';

/**
 * Galaxy points on the website — display only. Balances, levels, thresholds
 * and what a claim reserves all come from the API (`GET /points`), the same
 * answer the app shows; nothing here computes or grants anything.
 */

/** A level key as the claim route takes it — the API's closed list decides which exist. */
export function isLevelKey(value: string): boolean {
  return /^[a-z][a-z0-9_]{0,31}$/.test(value);
}

/** The level's name as the app shows it for this customer: gendered when the gender is known. */
export function levelName(level: Level, gender: 'male' | 'female' | null | undefined): string {
  if (gender === 'male') return level.nameMale;
  if (gender === 'female') return level.nameFemale;
  return level.nameNeutral;
}

/**
 * The state line under a reward, in the app's words (`app_strings.dart`,
 * batch 8). Claiming reserves the reward for the next order (a discount) or
 * the admin's delivery (a gift); it never deducts points.
 */
export function rewardStateLabel(reward: RewardState): string | null {
  if (reward.consumed) return reward.kind === 'gift' ? 'سُلّمت الهدية' : 'طُبّق الخصم على طلبك';
  if (reward.claimed) return reward.kind === 'gift' ? 'تم تفعيل الهدية وستصل مع طلبك القادم' : 'جاهز — تم تفعيل الخصم وسيطبق على طلبك القادم';
  return null;
}

export function claimLabel(reward: RewardState): string {
  return reward.kind === 'gift' ? 'تفعيل الهدية' : 'تفعيل الخصم';
}

/** 0–100 for a progress bar, from the API's own fraction. */
export function progressPercent(levelProgress: number): number {
  if (!Number.isFinite(levelProgress)) return 0;
  return Math.round(Math.min(1, Math.max(0, levelProgress)) * 100);
}
