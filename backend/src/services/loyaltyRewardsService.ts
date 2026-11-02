import type pg from 'pg';
import { userRepo } from '../repositories/userRepo.js';
import { PARAM_TEMPLATES } from '../domain/notificationTemplates.js';
import { db, withTransaction } from '../database/pool.js';
import {
  CLAIMABLE_LEVELS,
  GALAXY_LEVELS,
  rewardLabelFor,
  discountRewardAmount,
  findLevel,
  type GalaxyLevel,
  type GalaxyLevelKey,
} from '../domain/galaxyPoints.js';
import { notificationRepo } from '../repositories/notificationsRepo.js';
import { pointsRepo } from '../repositories/pointsRepo.js';
import {
  rewardRedemptionRepo,
  type RedemptionDto,
} from '../repositories/rewardRedemptionRepo.js';
import { Errors } from '../utils/errors.js';
import { discountCeilingIqd } from '../domain/discountRounding.js';

/**
 * مزايا مستويات نقاط المجرّة: الأهلية، المطالبة، الاستهلاك، التسليم.
 *
 * المزيّة ليست عملة: بلوغ العتبة يفتحها، والمطالبة بها لا **تخصم** نقاطاً.
 * لذلك لا يهبط رصيد أحد بسبب مزيّة، ولا يمكن أن يصير الرصيد سالباً من هذا
 * المسار أصلاً — ما يُحفظ هو أن المزيّة استُهلكت، لا أن نقاطاً أُنفقت.
 *
 * ثلاث حالات يراها الزبون ويجب أن تبقى متمايزة:
 *   • مفتوحة (`unlocked`) — بلغ العتبة ولم يطالب بعد.
 *   • مطالَب بها (`claimed`) — محجوزة له: الخصم ينتظر طلبه القادم، والهدية
 *     تنتظر تسليم المسؤول.
 *   • في طلب (`inOrder`) — هديةٌ رُبطت بطلبٍ أُنشئ وتنتظر تسليمها معه.
 *   • مستهلَكة/مسلَّمة — انتهت.
 *
 * دورة الاستعمال (STEP 77): المطالبة تُتيحها؛ إنشاءُ الطلب يحجزها ويستهلكها
 * في معاملة واحدة تحت قفل صفّها، فسقوطُ الإنشاء لأي سبب يُحرّرها كما كانت؛
 * والطلب المُنشأ يُبقيها مستعمَلة ولو رُفض لاحقاً (CA-12، BR-32). لا دفع
 * إلكتروني في المتجر (الدفع عند الاستلام)، فلا حدث دفعٍ يُنتظر.
 */

export interface RewardView {
  levelKey: GalaxyLevelKey;
  requiredPoints: number;
  kind: 'discount' | 'gift';
  percent: number | null;
  capAmount: number | null;
  giftAmount: number | null;
  /** بلغ الرصيدُ العتبةَ. */
  unlocked: boolean;
  claimed: boolean;
  /** خصمٌ استُهلك في طلب، أو هدية سُلّمت. */
  consumed: boolean;
  /** استُعملت في طلبٍ أُنشئ — خصمٌ استُهلك فيه، أو هديةٌ رُبطت به. */
  inOrder: boolean;
  /**
   * الحالة في كلمة — مشتقّة مما سبق:
   * `locked` → `available` → `claimed` → `inOrder` (هدية) → `completed`.
   */
  status: 'locked' | 'available' | 'claimed' | 'inOrder' | 'completed';
  claimedAt: string | null;
  consumedAt: string | null;
  fulfilledAt: string | null;
  /** هل يظهر زرّ المطالبة الآن؟ */
  claimable: boolean;
}

function rewardFields(level: GalaxyLevel) {
  if (level.reward.kind === 'discount') {
    return {
      kind: 'discount' as const,
      percent: level.reward.percent,
      capAmount: level.reward.capAmount,
      giftAmount: null,
    };
  }
  if (level.reward.kind === 'gift') {
    return {
      kind: 'gift' as const,
      percent: null,
      capAmount: null,
      giftAmount: level.reward.giftAmount,
    };
  }
  return null;
}

function toView(
  level: GalaxyLevel,
  balance: number,
  redemption: RedemptionDto | undefined,
): RewardView {
  const fields = rewardFields(level)!;
  const unlocked = balance >= level.requiredPoints;
  const claimed = Boolean(redemption);
  const consumed = Boolean(redemption?.consumedAt ?? redemption?.fulfilledAt);
  const inOrder = Boolean(redemption?.orderId);
  const status: RewardView['status'] = consumed
    ? 'completed'
    : inOrder
      ? 'inOrder'
      : claimed
        ? 'claimed'
        : unlocked
          ? 'available'
          : 'locked';
  return {
    levelKey: level.key,
    requiredPoints: level.requiredPoints,
    ...fields,
    unlocked,
    claimed,
    consumed,
    inOrder,
    status,
    claimedAt: redemption?.claimedAt ?? null,
    consumedAt: redemption?.consumedAt ?? null,
    fulfilledAt: redemption?.fulfilledAt ?? null,
    claimable: unlocked && !claimed,
  };
}

/** خصم مزيّةٍ مفتوحة على طلبٍ بعينه — القيمة كما يحسبها الخادم وحده. */
export interface ReservedLoyaltyDiscount {
  redemptionId: string;
  levelKey: GalaxyLevelKey;
  percent: number;
  capAmount: number;
  amount: number;
}

/** هدية مستوى تُربط بطلبٍ يُنشأ الآن — لا مبلغ لها على الطلب. */
export interface ReservedLevelGift {
  redemptionId: string;
  levelKey: GalaxyLevelKey;
}

/** مزيّة المستوى الواحدة لطلب — خصمٌ أو هدية، أو لا شيء. */
export type LevelRewardForOrder =
  | ({ kind: 'discount' } & ReservedLoyaltyDiscount)
  | ({ kind: 'gift' } & ReservedLevelGift);

/**
 * اختيار مزيّة المستوى لطلب من المزايا المفتوحة — قاعدة واحدة للإنشاء والمعاينة.
 *
 * [CRITICAL] قرار STEP 77 (طلب المالك 2026-10-31):
 *   • مزيّة مستوى **واحدة** لكل طلب، هديةً كانت أو خصماً. فتحُ مزايا كثيرة
 *     لا يعني إنفاقها كلّها في طلب واحد؛ الباقية تبقى مفتوحة للطلبات التالية.
 *   • خصم المستوى لا يجتمع مع خصم الميلاد. الميلاد يتقدّم لأنه ينقضي بانقضاء
 *     يومه، والمزيّة لا تسقط (§40.9) — فتبقى مفتوحة ولا يُخسر استحقاقٌ.
 *     هدية المستوى ليست خصماً، فتجتمع مع خصم الميلاد.
 *
 * الترتيب ترتيبُ المطالبة (الأقدم أولاً). خصمٌ لا يُطبَّق على هذا الطلب (يوم
 * ميلاد، أو قيمةٌ صفرية) يُتخطّى إلى التالي ولا يُستهلك.
 */
function pickLevelReward(
  open: readonly RedemptionDto[],
  productsTotal: number,
  birthdayApplies: boolean,
): LevelRewardForOrder | null {
  for (const reward of open) {
    if (reward.kind === 'gift') {
      return { kind: 'gift', redemptionId: reward.id, levelKey: reward.levelKey };
    }
    if (birthdayApplies) continue;
    const discount = discountFromOpen(reward, productsTotal);
    // يتّسع في مجموع المنتجات كما سيُحفظ (`fitProductDiscounts`): سلّةٌ دون
    // أدنى خصمٍ مقرَّب لا تتّسع له، فيُتخطّى إلى التالي ولا يُستهلك.
    const fitted = discount ? Math.min(discount.amount, discountCeilingIqd(productsTotal)) : 0;
    if (discount && fitted > 0) return { kind: 'discount', ...discount, amount: fitted };
  }
  return null;
}

/**
 * قيمة الخصم من صفّ المزيّة المفتوحة ومجموع المنتجات — للحجز وللمعاينة معاً.
 *
 * لا يُقرأ أي مبلغ من العميل، ولا يتجاوز الخصم سقفه المالي مهما كبر الطلب.
 */
function discountFromOpen(
  open: RedemptionDto | null,
  productsTotal: number,
): ReservedLoyaltyDiscount | null {
  if (!open || open.percent === null || open.capAmount === null) return null;

  const amount = discountRewardAmount(
    { kind: 'discount', percent: open.percent, capAmount: open.capAmount },
    productsTotal,
  );
  // صفرٌ لا يأتي إلا من سلّةٍ بلا مجموع أو سقفٍ دون ٢٥٠ (أدنى خصمٍ مقرَّب).
  // لا تُحرق المزيّة على خصمٍ لا قيمة له — تبقى للطلب القادم.
  if (amount <= 0) return null;

  return {
    redemptionId: open.id,
    levelKey: open.levelKey,
    percent: open.percent,
    capAmount: open.capAmount,
    amount,
  };
}

export const loyaltyRewardsService = {
  /** حالة كل مزيّة لهذا الزبون — تُرسل مع ملخّص النقاط. */
  async listForUser(userId: string, balance?: number): Promise<RewardView[]> {
    const [currentBalance, redemptions] = await Promise.all([
      balance === undefined ? pointsRepo.balance(db, userId) : Promise.resolve(balance),
      rewardRedemptionRepo.listForUser(db, userId),
    ]);
    const byLevel = new Map(redemptions.map((r) => [r.levelKey, r]));
    return CLAIMABLE_LEVELS.map((level) =>
      toView(level, currentBalance, byLevel.get(level.key)),
    );
  },

  /**
   * المطالبة بمزيّة مستوى.
   *
   * [CRITICAL] الرصيد يُقرأ من الخادم عند كل مطالبة ولا يُقبل من العميل
   * إطلاقاً. طلبٌ يحمل «رصيدي ١٠٠٠» لا يمنح شيئاً — الدفتر وحده يقرّر.
   *
   * والمطالبة المكرّرة **ليست خطأً**: النتيجة نفس الصفّ الذي أُنشئ أول مرة.
   * الضغطة المزدوجة وإعادةُ الإرسال بعد انقطاع الشبكة حالتان طبيعيتان، ولا
   * ينبغي أن يرى الزبون فشلاً على شيءٍ تمّ.
   */
  async claim(userId: string, levelKey: string) {
    const level = findLevel(levelKey);
    if (!level || level.reward.kind === 'none') {
      throw Errors.notFound('لا توجد ميزة بهذا المستوى');
    }

    const balance = await pointsRepo.balance(db, userId);
    if (balance < level.requiredPoints) {
      throw Errors.conflict(
        `تحتاج ${level.requiredPoints} نقطة لفتح هذه الميزة`,
        'REWARD_LOCKED',
      );
    }

    const fields = rewardFields(level)!;
    // [CRITICAL] الصفّ والإشعار في معاملة واحدة. كانا كتابتين مستقلّتين:
    // سقوطُ الإشعار بعد إدراج الصفّ يترك مطالبةً بلا إشعار، وإعادةُ المحاولة
    // تجد الصفّ قائماً (`created = false`) فلا تُشعر أبداً — أثرٌ يضيع بلا
    // رجعة. الإدراج يبقى محروساً بالقيد الفريد؛ المعاملة تضمن «صفٌّ وإشعار
    // معاً أو لا شيء» فتصير إعادة المحاولة بعد أي فشلٍ آمنةً.
    const { redemption, created } = await withTransaction(async (tx) => {
      const result = await rewardRedemptionRepo.claim(tx, {
        userId,
        levelKey: level.key,
        kind: fields.kind,
        percent: fields.percent,
        capAmount: fields.capAmount,
        giftAmount: fields.giftAmount,
      });

      // الإشعار مربوط بالإنشاء الحقيقي لا بالطلب: بدون ذلك يتكرّر إشعار
      // «سُجّلت مطالبتك» مع كل ضغطة، وهي نفس العلّة التي عولجت في اعتماد
      // التقييمات (النقاط يحرسها فهرس فريد، والإشعار لا حارس له).
      if (result.created) {
        // القالب مترجَم بلغة صاحب الحساب، فلا يُحشر فيه وصفٌ عربيّ للمزيّة.
        const locale = await userRepo.localeOf(tx, userId);
        await notificationRepo.create(tx, {
          userId,
          type: 'rewardClaimed',
          ...PARAM_TEMPLATES[
              fields.kind === 'gift' ? 'rewardClaimedGift' : 'rewardClaimedDiscount'
            ][locale](rewardLabelFor(level, locale)),
        });
      }
      return result;
    });

    return {
      redemption,
      created,
      reward: toView(level, balance, redemption),
    };
  },

  /**
   * مزيّة المستوى لهذا الطلب ([pickLevelReward]) — `reserve` لإنشاء الطلب،
   * `preview` لمعاينة شاشة الدفع.
   *
   * [CRITICAL] `reserve` يُستدعى **داخل** معاملة إنشاء الطلب ويقرأ المزايا
   * المفتوحة بـ`FOR UPDATE`، فلا يختار طلبٌ متزامن من نفس الزبون المزيّة
   * نفسها، وسقوطُ الطلب لأي سبب لاحق يُحرّر القفل ويُرجعها كاملة. `preview`
   * يقرأ المرشّحات نفسها بلا قفل ولا استهلاك.
   *
   * لا يُقرأ أي مبلغ من العميل: قيمة الخصم من صفّ المزيّة ومجموع المنتجات.
   */
  async levelRewardForOrder(
    client: pg.Pool | pg.PoolClient,
    userId: string,
    productsTotal: number,
    options: { birthdayApplies: boolean; mode: 'reserve' | 'preview' },
  ): Promise<LevelRewardForOrder | null> {
    const open = await rewardRedemptionRepo.openRewards(client, userId, {
      lock: options.mode === 'reserve',
    });
    return pickLevelReward(open, productsTotal, options.birthdayApplies);
  },

  /**
   * ربط هدية المستوى المحجوزة بالطلب المُنشأ — داخل معاملة إنشائه.
   *
   * الصفّ مقفول منذ [levelRewardForOrder]. المؤشر الفريد الجزئي على
   * `orders.loyalty_gift_redemption_id` هو الحارس النهائي ضد أي سباق.
   * الهدية لا تُكتَب `consumed_at` — تلك دلالةٌ للخصومات وحدها (042).
   */
  async linkGiftToOrder(
    client: pg.PoolClient,
    redemptionId: string,
    orderId: string,
  ): Promise<void> {
    const linked = await rewardRedemptionRepo.linkGiftToOrder(client, orderId, redemptionId);
    if (!linked) {
      throw Errors.conflict('هدية المستوى مرتبطة بطلب آخر', 'REWARD_ALREADY_USED');
    }
  },

  /**
   * تثبيت الحجز على طلب — الخطوة الثانية.
   *
   * يستهلك **الصفّ المحجوز بعينه** لا «أول خصم مفتوح»: لو تغيّر المرشّح بين
   * الخطوتين لاستُهلكت مزيّةٌ غير التي حُسب على أساسها الخصم. الشرط
   * `consumed_at IS NULL` داخل التحديث يبقى الحارس الأخير.
   */
  async consumeReserved(
    client: pg.PoolClient,
    redemptionId: string,
    orderId: string,
  ): Promise<boolean> {
    return rewardRedemptionRepo.consume(client, redemptionId, orderId);
  },

  // ── الإدارة ──

  /** طابور الهدايا: من طالب، بأي مستوى، بأي قيمة، ومتى. */
  async listGiftClaims(options: { pending?: boolean; page: number; limit: number }) {
    const { items, total } = await rewardRedemptionRepo.listGiftClaims(db, options);
    return {
      items: items.map((item) => {
        const level = findLevel(item.levelKey);
        return {
          ...item,
          // اسم المستوى للعرض في اللوحة — الصيغة المذكّرة تكفي هنا: هذه شاشة
          // إدارة تصف المستوى لا تخاطب صاحبه.
          levelName: level?.nameMale ?? item.levelKey,
        };
      }),
      total,
      page: options.page,
      limit: options.limit,
      hasMore: options.page * options.limit < total,
    };
  },

  /**
   * تعليم هدية بأنها سُلّمت.
   *
   * التسليم فعلٌ صريح من المسؤول: `fulfilled_at` يبقى فارغاً حتى هذه اللحظة
   * مهما طال الوقت. لا انتهاء صلاحية تلقائي — مطالبةٌ لم تُسلَّم تبقى ديناً
   * على المتجر لا تسقط بالتقادم.
   */
  async fulfilGift(adminId: string, redemptionId: string) {
    return withTransaction(async (client) => {
      const row = await rewardRedemptionRepo.findById(client, redemptionId);
      if (!row) throw Errors.notFound('الميزة غير موجودة');
      if (row.kind !== 'gift') {
        throw Errors.badRequest('هذه الميزة خصم لا هدية', 'NOT_A_GIFT');
      }
      if (row.fulfilled_at) {
        throw Errors.conflict('سُلّمت هذه الهدية مسبقاً', 'ALREADY_FULFILLED');
      }

      const done = await rewardRedemptionRepo.fulfilGift(client, redemptionId, adminId);
      if (!done) {
        // خسر السباق مع مسؤول آخر ضغط في اللحظة نفسها.
        throw Errors.conflict('سُلّمت هذه الهدية مسبقاً', 'ALREADY_FULFILLED');
      }

      const level = findLevel(row.level_key);
      const locale = await userRepo.localeOf(client, row.user_id);
      await notificationRepo.create(client, {
        userId: row.user_id,
        type: 'rewardClaimed',
        ...PARAM_TEMPLATES.rewardDelivered[locale](
          level ? rewardLabelFor(level, locale) : '',
        ),
      });

      return rewardRedemptionRepo.findById(client, redemptionId);
    });
  },

  async countPendingGifts() {
    return rewardRedemptionRepo.countPendingGifts(db);
  },

  /** السلّم الثابت كما تعرضه اللوحة للقراءة فقط. */
  rulesForAdmin() {
    return GALAXY_LEVELS.map((level) => ({
      key: level.key,
      number: level.number,
      requiredPoints: level.requiredPoints,
      nameMale: level.nameMale,
      nameFemale: level.nameFemale,
      nameNeutral: level.nameNeutral,
      nameCkb: level.nameCkb,
      rewardKind: level.reward.kind,
      rewardLabel: level.rewardLabel,
      rewardLabelCkb: level.rewardLabelCkb,
      ...(level.reward.kind === 'discount'
        ? { percent: level.reward.percent, capAmount: level.reward.capAmount }
        : {}),
      ...(level.reward.kind === 'gift' ? { giftAmount: level.reward.giftAmount } : {}),
    }));
  },
};
