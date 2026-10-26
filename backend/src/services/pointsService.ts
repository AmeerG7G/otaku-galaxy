import { db } from '../database/pool.js';
import {
  GALAXY_LEVELS,
  placeOnLadder,
  type GalaxyLevel,
} from '../domain/galaxyPoints.js';
import { pointsRepo } from '../repositories/pointsRepo.js';
import { loyaltyRewardsService } from './loyaltyRewardsService.js';

/**
 * شكل المستوى كما يقرؤه التطبيق.
 *
 * يحمل صيغ الاسم الثلاث ولا يختار بينها: الاختيار يخصّ جنسَ من يقرأ، وهو
 * قرار عرضٍ يخصّ الواجهة. والمسار العام (`/catalog/loyalty-levels`) يُقرأ
 * قبل تسجيل الدخول أصلاً فلا صاحبَ له يُختار على أساسه.
 *
 * `key` هو المعرّف في كل منطق؛ الأسماء نصوص عرض لا غير.
 */
export interface LevelDto {
  key: string;
  number: number;
  requiredPoints: number;
  nameMale: string;
  nameFemale: string;
  nameNeutral: string;
  /** الاسم الكردي الواحد — يختاره التطبيق حين تكون واجهته كردية. */
  nameCkb: string;
  rewardKind: 'none' | 'discount' | 'gift';
  reward: string;
  /** وصف المزيّة بالكردية — نظير `reward`. */
  rewardCkb: string;
  percent?: number;
  capAmount?: number;
  giftAmount?: number;
}

function shapeLevel(level: GalaxyLevel): LevelDto {
  return {
    key: level.key,
    number: level.number,
    requiredPoints: level.requiredPoints,
    nameMale: level.nameMale,
    nameFemale: level.nameFemale,
    nameNeutral: level.nameNeutral,
    nameCkb: level.nameCkb,
    rewardKind: level.reward.kind,
    reward: level.rewardLabel,
    rewardCkb: level.rewardLabelCkb,
    ...(level.reward.kind === 'discount'
      ? { percent: level.reward.percent, capAmount: level.reward.capAmount }
      : {}),
    ...(level.reward.kind === 'gift' ? { giftAmount: level.reward.giftAmount } : {}),
  };
}

const LADDER = GALAXY_LEVELS.map(shapeLevel);

export const pointsService = {
  /**
   * كل ما تحتاجه شاشة نقاط المجرّة في نداء واحد: الرصيد، الحركات، السلّم،
   * موضع الزبون عليه، وحالة كل مزيّة.
   *
   * الموضع يُحسب هنا لا في التطبيق: نسختان من العتبات كانتا ستتباعدان.
   *
   * [NOTE] `earnRates` حُذف. كان يرسل قيم المنح القابلة للضبط لتشرحها الشاشة
   * بأرقامها الحقيقية — وهو الحلّ الصحيح لمشكلةٍ لم تعد قائمة. القواعد الآن
   * ثابتة، فشرحُها نصٌّ ثابت في التطبيق لا حمولةٌ تُرسل مع كل نداء.
   */
  async summary(userId: string) {
    const [balance, activity] = await Promise.all([
      pointsRepo.balance(db, userId),
      pointsRepo.listActivity(db, userId),
    ]);
    const placement = placeOnLadder(balance);
    const rewards = await loyaltyRewardsService.listForUser(userId, balance);

    return {
      balance,
      activity,
      levels: LADDER,
      level: shapeLevel(placement.current),
      nextLevel: placement.next ? shapeLevel(placement.next) : null,
      pointsToNextLevel: placement.pointsToNext,
      levelProgress: placement.progress,
      rewards,
    };
  },

  /** السلّم وحده — يقرأه التطبيق قبل تسجيل الدخول أيضاً. */
  levels() {
    return { items: LADDER };
  },

  async balance(userId: string) {
    return pointsRepo.balance(db, userId);
  },

  async activity(userId: string) {
    return pointsRepo.listActivity(db, userId);
  },
};
