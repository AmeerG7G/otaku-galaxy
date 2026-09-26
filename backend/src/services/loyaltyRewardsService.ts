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
 *   • مستهلَكة/مسلَّمة — انتهت.
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
  return {
    levelKey: level.key,
    requiredPoints: level.requiredPoints,
    ...fields,
    unlocked,
    claimed,
    consumed,
    claimedAt: redemption?.claimedAt ?? null,
    consumedAt: redemption?.consumedAt ?? null,
    fulfilledAt: redemption?.fulfilledAt ?? null,
    claimable: unlocked && !claimed,
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
      throw Errors.notFound('لا توجد مزيّة بهذا المستوى');
    }

    const balance = await pointsRepo.balance(db, userId);
    if (balance < level.requiredPoints) {
      throw Errors.conflict(
        `تحتاج ${level.requiredPoints} نقطة لفتح هذه المزيّة`,
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
   * حجز خصم المزيّة لطلبٍ يُنشأ الآن — الخطوة الأولى من خطوتين.
   *
   * [CRITICAL] يُستدعى **داخل** معاملة إنشاء الطلب. الصفّ يُقرأ بـ`FOR UPDATE`
   * فيُقفل حتى نهاية المعاملة، فلا يستطيع طلبٌ متزامن من نفس الزبون أن يختار
   * المزيّة نفسها. وسقوطُ الطلب لأي سبب لاحق (مخزون نفد، خصم ميلاد مستهلك)
   * يُحرّر القفل ويُرجع المزيّة كاملةً — لا خصم يُحرق على طلب لم يُنشأ.
   *
   * الخطوتان منفصلتان لأن الربط يحتاج معرّف الطلب، والطلب يحتاج قيمة الخصم:
   * نحجز أولاً (فنعرف القيمة)، ثم نُنشئ الطلب، ثم نُثبّت الربط بـ[consumeReserved].
   *
   * القيمة تُحسب على الخادم من مجموع المنتجات الفعلي — لا يُقرأ أي مبلغ من
   * العميل — ولا تتجاوز سقفها المالي مهما كبر الطلب.
   *
   * الهدايا لا تمرّ من هنا إطلاقاً: التزامٌ يسلّمه المسؤول، لا خصمٌ على الطلب.
   */
  async reserveDiscountForOrder(
    client: pg.PoolClient,
    userId: string,
    productsTotal: number,
  ): Promise<{ redemptionId: string; levelKey: GalaxyLevelKey; amount: number } | null> {
    const open = await rewardRedemptionRepo.findOpenDiscount(client, userId);
    if (!open || open.percent === null || open.capAmount === null) return null;

    const amount = discountRewardAmount(
      { kind: 'discount', percent: open.percent, capAmount: open.capAmount },
      productsTotal,
    );
    // سلّةٌ رخيصة قد تُنتج صفراً بعد التقريب النازل. لا تُحرق المزيّة على
    // خصمٍ لا قيمة له — تبقى للطلب القادم.
    if (amount <= 0) return null;

    return { redemptionId: open.id, levelKey: open.levelKey, amount };
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
      if (!row) throw Errors.notFound('المزيّة غير موجودة');
      if (row.kind !== 'gift') {
        throw Errors.badRequest('هذه المزيّة خصم لا هدية', 'NOT_A_GIFT');
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
