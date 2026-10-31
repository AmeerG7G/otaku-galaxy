import { createHash } from 'node:crypto';
import type pg from 'pg';
import { userRepo } from '../repositories/userRepo.js';
import { renderNotification } from '../domain/notificationTemplates.js';
import {
  DEFAULT_LOCALE,
  isAppLocale,
  kurdishOrNull,
  pickLocalized,
  type AppLocale,
} from '../utils/locale.js';
import { config } from '../config/index.js';
import { sendRatingReminderNow } from '../jobs/ratingReminderJob.js';
import { db, withTransaction } from '../database/pool.js';
import { adminEvents } from './adminEvents.js';
import { birthdayDiscountAmount } from '../domain/birthday.js';
import {
  fitProductDiscounts,
  pairPricedLineTotals,
  priceOrder,
  quoteFingerprint,
  type PairPricedLine,
  type QuotedLine,
} from '../domain/orderPricing.js';
import {
  eligiblePurchaseValue,
  purchasePointsFor,
} from '../domain/galaxyPoints.js';
import { birthdayRepo } from '../repositories/birthdayRepo.js';
import { cartRepo } from '../repositories/cartRepo.js';
import { productRepo, type ProductVariant } from '../repositories/catalogRepo.js';
import { stockPoolKey } from '../domain/cartSync.js';
import { governorateRepo } from '../repositories/storefrontRepo.js';
import { notificationRepo } from '../repositories/notificationsRepo.js';
import { orderRepo, type OrderItemSnapshot, type OrderWithItems } from '../repositories/orderRepo.js';
import { pointsRepo } from '../repositories/pointsRepo.js';
import { productCostsRepo } from '../repositories/productCostsRepo.js';
import { zoneRepo } from '../repositories/zonesRepo.js';
import { ORDER_STATUSES as ALL_ORDER_STATUSES } from '../types/order-status.js';
import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from '../types/index.js';
import { AppError, Errors } from '../utils/errors.js';
import { loyaltyRewardsService } from './loyaltyRewardsService.js';
import { restockService } from './restockService.js';

/**
 * استهلاك مخزون طلبٍ لحظةَ **قبوله** — داخل معاملة القبول وبعد قفل صفّ الطلب.
 *
 * ═══ العقد (قرار عمل 2026-09-14) ═══
 *   إرسال الزبون      ← لا تنزيل ولا حجز.
 *   رفضُ طلبٍ منتظر   ← لا مساس بالمخزون (لا يوجد ما يُسترد).
 *   قبول الإدارة      ← هنا وحده: قفلٌ، قراءةُ المخزون **الحالي**، تنزيلٌ
 *                        كامل أو لا شيء.
 *   رفضٌ بعد القبول   ← يُرجع ما استُهلك (`releaseStockOnRejection`) —
 *                        القاعدة القائمة قبل نقل التنزيل، ولم تتغيّر.
 *
 * [CRITICAL] القفل بترتيبٍ ثابت (`ORDER BY id FOR UPDATE`) يمنع الجمود بين
 * قبولَين يحملان المنتجين نفسيهما بترتيبين متعاكسين، ويُسلسل القبولَين
 * المتنافسَين على المنتج نفسه: الثاني ينتظر التزام الأول ثم يقرأ المخزون
 * المحدَّث — فيفشل بـ`INSUFFICIENT_STOCK` بدل أن يبيع ما بيع. يصحّ ذلك عبر
 * عمليات خادم مستقلّة لأن الحارس في PostgreSQL لا في الذاكرة
 * (`scripts/oversell-multi-instance.ts`).
 *
 * [CRITICAL] الكمية تُجمع على **المنتج** لا على السطر: سطران بخيارين لمنتجٍ
 * مخزونه ٣ يُقاسان معاً. والتنزيل مشروط (`stock >= qty`) رغم القفل —
 * حارسٌ ثانٍ لا يكلّف شيئاً. أي رمي هنا يُسقط المعاملة كلها: لا تنزيل
 * جزئي، ولا يتحرّك الطلب من الانتظار.
 */
async function consumeStockOnApproval(tx: pg.PoolClient, order: OrderWithItems) {
  // مخزون كل بند (087): اللون لبندٍ بلون — كل لونٍ مخزونٌ مستقل — وإلا المنتج.
  const wantedProducts = new Map<string, { name: string; quantity: number }>();
  const wantedVariants = new Map<string, { name: string; quantity: number }>();
  for (const item of order.items) {
    if (item.variantId) {
      const current = wantedVariants.get(item.variantId);
      wantedVariants.set(item.variantId, {
        name: `${item.productName} — ${item.variantColorName}`,
        quantity: (current?.quantity ?? 0) + item.quantity,
      });
      continue;
    }
    const current = wantedProducts.get(item.productId);
    wantedProducts.set(item.productId, {
      name: item.productName,
      quantity: (current?.quantity ?? 0) + item.quantity,
    });
  }
  // [CRITICAL] ترتيب الأقفال واحد في كل مسار يكتب مخزوناً: صفوف المنتجات بترتيب
  // المعرّف — منتجات بنود الألوان أيضاً، لأن زناد 087 يكتب مخزون المنتج — ثم صفوف
  // الألوان بترتيب المعرّف. قبولان (أو قبولٌ وحفظُ المسؤول) لا يتقاطعان.
  const ids = [
    ...new Set(order.items.map((item) => item.productId).filter((id): id is string => Boolean(id))),
  ].sort();
  if (ids.length === 0 && wantedVariants.size === 0) return;

  const { rows } = await tx.query<{ id: string; name: string; stock: string; has_variants: boolean }>(
    `SELECT p.id, p.name, p.stock,
            EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id) AS has_variants
       FROM products p WHERE p.id = ANY($1::uuid[]) ORDER BY p.id FOR UPDATE OF p`,
    [ids],
  );
  const locked = new Map(rows.map((row) => [row.id, row]));
  const variantIds = [...wantedVariants.keys()].sort();
  const { rows: variantRows } = await tx.query<{ id: string; stock: string }>(
    'SELECT id, stock FROM product_variants WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [variantIds],
  );
  const lockedVariants = new Map(variantRows.map((row) => [row.id, row]));

  for (const [productId, line] of wantedProducts) {
    const product = locked.get(productId);
    if (!product) {
      throw Errors.conflict(`«${line.name}» لم يعد موجوداً في الكتالوج`, 'PRODUCT_UNAVAILABLE');
    }
    // بندٌ بلا لون لمنتجٍ صار بألوان: لا يُعرف من أي لونٍ يُنزَّل. تحويل منتجٍ
    // له طلبٌ مفتوح إلى الألوان ممنوعٌ أصلاً (`PRODUCT_HAS_OPEN_ORDERS`) — حارسٌ ثانٍ.
    if (product.has_variants) {
      throw Errors.conflict(
        `«${line.name}» صار بألوان بعد هذا الطلب — لا يُعرف لون البند`,
        'VARIANT_REQUIRED',
      );
    }
    const available = Number(product.stock);
    if (available < line.quantity) {
      throw Errors.conflict(
        `مخزون «${product.name}» غير كافٍ (المتاح: ${available})`,
        'INSUFFICIENT_STOCK',
      );
    }
  }
  for (const [variantId, line] of wantedVariants) {
    const variant = lockedVariants.get(variantId);
    if (!variant) {
      throw Errors.conflict(`«${line.name}» لم يعد موجوداً في الكتالوج`, 'PRODUCT_UNAVAILABLE');
    }
    const available = Number(variant.stock);
    if (available < line.quantity) {
      throw Errors.conflict(`مخزون «${line.name}» غير كافٍ (المتاح: ${available})`, 'INSUFFICIENT_STOCK');
    }
  }

  for (const [productId, line] of wantedProducts) {
    const { rowCount } = await tx.query(
      'UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2',
      [productId, line.quantity],
    );
    if ((rowCount ?? 0) === 0) {
      const available = Number(locked.get(productId)?.stock ?? 0);
      throw Errors.conflict(
        `مخزون «${line.name}» غير كافٍ (المتاح: ${available})`,
        'INSUFFICIENT_STOCK',
      );
    }
  }
  for (const variantId of variantIds) {
    const line = wantedVariants.get(variantId)!;
    const { rowCount } = await tx.query(
      'UPDATE product_variants SET stock = stock - $2 WHERE id = $1 AND stock >= $2',
      [variantId, line.quantity],
    );
    if ((rowCount ?? 0) === 0) {
      const available = Number(lockedVariants.get(variantId)?.stock ?? 0);
      throw Errors.conflict(`مخزون «${line.name}» غير كافٍ (المتاح: ${available})`, 'INSUFFICIENT_STOCK');
    }
  }

  // [D1] تكلفة الشراء تُلتقط هنا — لحظة خروج البضاعة من المخزون، تحت أقفال
  // المنتجات نفسها، ومرة واحدة لكل بند. بندٌ بلا تكلفة مسجّلة يبقى بلا لقطة
  // («الربح غير متاح»)، ولا تُكتب لاحقاً من تكلفةٍ حالية أبداً.
  await productCostsRepo.snapshotOrderItemCosts(tx, order.id);
}

/**
 * إرجاع مخزون طلبٍ **استُهلك** ثم رُفض — داخل معاملة الرفض وبعد قفل صفّ الطلب.
 *
 * يُستدعى فقط لطلبٍ غادر الانتظار (قُبل فنُزِّل مخزونه، أو طلبٍ موروث في
 * `CONFIRMED`/`PREPARING` نُزِّل عند إنشائه تحت النموذج القديم). رفضُ
 * المنتظر لا يمرّ من هنا: لم يُنزَّل شيء فلا شيء يُرجَع. وتكرار الرفض
 * «حالةٌ نفسها» فلا يُرجع ثانيةً — مرةً واحدة بالبناء.
 *
 * الإرجاع بترتيب المعرّفات نفسه الذي يقفل به القبول، فلا يتقاطع رفضٌ
 * وقبولٌ متزامنان على المنتجين نفسيهما بترتيبين متعاكسين. المنتج المحذوف
 * من القاعدة (`product_id` فارغ) لا شيء يُرجَع إليه.
 *
 * [CRITICAL] إرجاعٌ يُعيد منتجاً من صفر هو «عودة التوفر» بعينها: عقد
 * «أعلمني عند توفره» (§42.5) يسري هنا كما يسري على حفظ المسؤول
 * (`restockService.stockReturned`) — في المعاملة نفسها، ومرة واحدة لأن تكرار
 * الرفض «حالةٌ نفسها» لا يمرّ من هنا.
 */
async function releaseStockOnRejection(tx: pg.PoolClient, order: OrderWithItems) {
  const releasedProducts = new Map<string, number>();
  const releasedVariants = new Map<string, number>();
  for (const item of order.items) {
    if (!item.productId) continue;
    // بندٌ بلون (087) يعود إلى لونه وحده — لا إلى لونٍ آخر ولا إلى المنتج.
    if (item.variantId) {
      releasedVariants.set(item.variantId, (releasedVariants.get(item.variantId) ?? 0) + item.quantity);
    } else {
      releasedProducts.set(item.productId, (releasedProducts.get(item.productId) ?? 0) + item.quantity);
    }
  }
  const productIds = [
    ...new Set(order.items.map((item) => item.productId).filter((id): id is string => Boolean(id))),
  ].sort();
  if (productIds.length === 0) return;
  // ترتيب الأقفال نفسه الذي يقبل به القبول: المنتجات ثم الألوان، كلٌّ بالمعرّف.
  // مخزون المنتج قبل الإرجاع وبعده هو ما يقرّر «عاد للتوفر» — لمنتجٍ بألوان هو
  // مجموع ألوانه الفعّالة (زناد 087).
  const { rows: before } = await tx.query<{ id: string; stock: number; has_variants: boolean }>(
    `SELECT p.id, p.stock,
            EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id) AS has_variants
       FROM products p WHERE p.id = ANY($1::uuid[]) ORDER BY p.id FOR UPDATE OF p`,
    [productIds],
  );
  const previous = new Map(before.map((row) => [row.id, Number(row.stock)]));
  const hasVariants = new Map(before.map((row) => [row.id, row.has_variants]));

  for (const productId of [...releasedProducts.keys()].sort()) {
    // [CRITICAL] بندٌ بلا لون لمنتجٍ صار بألوان لا يُعرف لونه: لا يُكتب مخزون
    // المنتج (المشتقّ من ألوانه، والقاعدة ترفضه). التحويل إلى الألوان ممنوعٌ متى
    // وُجد طلبٌ مفتوح، فلا يقع هذا لطلبٍ يُرفض بعد القبول.
    if (hasVariants.get(productId)) continue;
    await tx.query('UPDATE products SET stock = stock + $2 WHERE id = $1', [
      productId,
      releasedProducts.get(productId),
    ]);
  }
  for (const variantId of [...releasedVariants.keys()].sort()) {
    // لونٌ حُذف لا يُرجَع إليه (لا يُحذف لونٌ له طلبات — يُوقف بدل ذلك).
    await tx.query('UPDATE product_variants SET stock = stock + $2 WHERE id = $1', [
      variantId,
      releasedVariants.get(variantId),
    ]);
  }

  // [CRITICAL] إرجاعٌ يُعيد منتجاً من صفر هو «عودة التوفر» بعينها (§42.5).
  const { rows: after } = await tx.query<{ id: string; stock: number; name: string; name_ckb: string | null }>(
    'SELECT id, stock, name, name_ckb FROM products WHERE id = ANY($1::uuid[]) ORDER BY id',
    [productIds],
  );
  for (const product of after) {
    if (previous.get(product.id) === 0 && Number(product.stock) > 0) {
      await restockService.stockReturned(tx, product.id, {
        ar: product.name,
        ckb: kurdishOrNull(product.name_ckb),
      });
    }
    // لونٌ عاد من صفر بهذا الإرجاع — مشتركو اللون نفسه (088)، ولو بقي المنتج متوفراً.
    if (hasVariants.get(product.id)) {
      await restockService.variantsReturned(tx, product.id, {
        ar: product.name,
        ckb: kurdishOrNull(product.name_ckb),
      });
    }
  }
}

/**
 * مهلة **تذكير** التقييم — لا مهلة فتحه.
 *
 * التقييم يُفتح بتأكيد الاستلام فوراً. هذه القيمة تجدول إشعار «شلونها
 * المنتجات؟» فقط، وهي ثابت تشغيلي في البيئة لا إعداد في لوحة التحكم.
 */
function reviewReminderDelayHours(): number {
  return config.orders.reviewReminderDelayHours;
}


/**
 * خصما الطلب على المنتجات كما يقرّرهما الخادم — مصدرٌ واحد للإنشاء والمعاينة.
 *
 * - **الميلاد**: نسبة ثابتة (`domain/birthday.ts`)، مرة واحدة سنوياً، بتقويم
 *   المتجر — التقويم نفسه الذي يرى به المسؤول «عيد اليوم».
 * - **مزيّة المستوى**: واحدة لكل طلب — أقدم مزيّة مطالَب بها، خصماً (من
 *   مجموع المنتجات الفعلي ومسقوفاً بسقفه) أو هدية؛ وخصم المستوى لا يجتمع
 *   مع خصم الميلاد (STEP 77).
 *
 * `reserve` (إنشاء الطلب) يقفل صفّ المزيّة ليستهلكه بعد إنشاء الطلب؛
 * `preview` (شاشة الدفع) يقرأ المرشّح نفسه بلا قفل ولا استهلاك. لا مبلغ
 * يُقرأ من العميل في الحالتين.
 *
 * كلا المبلغين مقرَّب بقاعدة الخصم الواحدة (`domain/discountRounding.ts`)
 * داخل دالته، ثم يتّسعان في مجموع المنتجات (`fitProductDiscounts`). ما يعود من
 * هنا هو ما يُحفظ ويُستهلك بعينه: مزيّةٌ لم يبقَ لها شيء تعود `null` فلا
 * تُستهلك، وخصم ميلادٍ صفريّ لا يُسجَّل.
 */
async function orderDiscounts(
  client: pg.Pool | pg.PoolClient,
  userId: string,
  productsTotal: number,
  mode: 'reserve' | 'preview',
) {
  const birthday = await birthdayRepo.status(client, userId, config.storeTimezone);
  const birthdayRaw = birthday.rewardAvailable ? birthdayDiscountAmount(productsTotal) : 0;
  // مزيّة مستوى واحدة، ولا خصمَ مستوى مع خصم الميلاد (STEP 77) — القاعدة
  // في `loyaltyRewardsService.levelRewardForOrder`.
  const levelReward = await loyaltyRewardsService.levelRewardForOrder(
    client,
    userId,
    productsTotal,
    { birthdayApplies: birthdayRaw > 0, mode },
  );
  const candidate = levelReward?.kind === 'discount' ? levelReward : null;
  const fitted = fitProductDiscounts(productsTotal, {
    birthday: birthdayRaw,
    loyalty: candidate?.amount ?? 0,
  });
  const loyaltyReward =
    candidate && fitted.loyalty > 0 ? { ...candidate, amount: fitted.loyalty } : null;
  return {
    birthdayDiscount: fitted.birthday,
    loyaltyReward,
    levelGift: levelReward?.kind === 'gift' ? levelReward : null,
    discount: fitted.birthday + fitted.loyalty,
  };
}

/**
 * بصمة إرسال الطلب — ما يميّز «المحاولة نفسها» عن طلبٍ مختلف بالمفتاح نفسه.
 *
 * تُحسب من المدخل **بعد** التحقق (العنوان مقصوص، الرقم مطبَّع) فلا تختلف
 * محاولتان متطابقتان بمسافة. العربة **ليست** فيها عمداً: المحاولة الأولى
 * تُفرغها، فإعادةٌ صادقة كانت ستختلف بصمتها دائماً.
 */
/** ما راجعه الزبون لكل منتج — فحصٌ لا مصدر (`validators/orders.ts`). */
interface ExpectedPrice {
  productId: string;
  unitPrice: number;
  /** 085؛ الغائب = لا فحص (تطبيقٌ أقدم). */
  pairPrice?: number | null;
}

function orderFingerprint(input: {
  governorateId: string;
  fullAddress: string;
  phone: string;
  zoneId?: string | null;
  expectedPrices?: ReadonlyArray<ExpectedPrice>;
  expectedQuote?: string;
}): string {
  // سعر القطعتين يدخل البصم حين يُرسَل وحده، فيبقى بصم العميل الأقدم كما كان حرفاً بحرف.
  const expectedPrices = [...(input.expectedPrices ?? [])]
    .map((entry) =>
      entry.pairPrice === undefined
        ? ([entry.productId, entry.unitPrice] as const)
        : ([entry.productId, entry.unitPrice, entry.pairPrice] as const),
    )
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] < b[0] ? -1 : 1));
  const canonical = JSON.stringify({
    v: 1,
    governorateId: input.governorateId,
    zoneId: input.zoneId ?? null,
    fullAddress: input.fullAddress,
    phone: input.phone,
    expectedPrices,
    // الملخّص الذي راجعه الزبون جزءٌ من الطلب: المفتاح نفسه مع ملخّصٍ آخر
    // طلبٌ آخر (422) لا إعادة. بلا ملخّص يبقى البصم كما كان حرفاً بحرف —
    // `JSON.stringify` يُسقط الحقل غير المعرَّف — فلا يتغيّر شيء للتطبيق.
    expectedQuote: input.expectedQuote,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** القيد الفريد على (الزبون، المفتاح) — هجرة 083. */
const IDEMPOTENCY_CONSTRAINT = 'uq_orders_user_idempotency_key';

/**
 * طلبٌ سابق لهذا الزبون بالمفتاح نفسه: يُعاد كما هو (بلا أي أثر جانبي)، أو
 * يُرفض المفتاح إن حمل طلباً مختلفاً. `null` = لا طلب بهذا المفتاح بعد.
 */
async function replayIfSubmitted(
  client: pg.Pool | pg.PoolClient,
  userId: string,
  idempotency: { key: string; fingerprint: string },
): Promise<{ order: OrderWithItems | null; replayed: true } | null> {
  const previous = await orderRepo.findByIdempotencyKey(client, userId, idempotency.key);
  if (!previous) return null;
  if (previous.fingerprint !== idempotency.fingerprint) {
    // 422 لا 409: التطبيق يقرأ 409 تعارضاً في العربة (مخزون/سعر) فيعيد مزامنتها.
    throw new AppError(
      422,
      'IDEMPOTENCY_KEY_REUSED',
      'مفتاح الطلب استُعمل لطلبٍ مختلف — أعد المحاولة من صفحة المراجعة',
    );
  }
  return { order: await orderRepo.findById(client, previous.id), replayed: true };
}

/**
 * لون سطر العربة على المنتج كما هو الآن (087):
 * - `null`: منتجٌ بلا ألوان وسطرٌ بلا لون — يُطلب كما كان.
 * - اللون: فعّالٌ ومن ألوان المنتج نفسه.
 * - `'unavailable'`: لونٌ أُوقف أو حُذف، أو سطرٌ بلا لون لمنتجٍ صار بألوان.
 */
function resolveLineVariant(
  product: { variants: readonly ProductVariant[] },
  line: { variantId: string | null },
): ProductVariant | null | 'unavailable' {
  if (line.variantId === null) return product.variants.length === 0 ? null : 'unavailable';
  const variant = product.variants.find((entry) => entry.id === line.variantId);
  return variant && variant.isActive ? variant : 'unavailable';
}

/** اسم السطر في رسائل الرفض بلغة الزبون: «المنتج — اللون» لسطرٍ بلون. */
function lineDisplayName(
  line: {
    productNameAr: string;
    productNameCkb: string | null;
    variantColorNameAr: string | null;
    variantColorNameCkb: string | null;
  },
  locale: AppLocale,
): string {
  const name = pickLocalized(line.productNameAr, line.productNameCkb, locale);
  return line.variantColorNameAr === null
    ? name
    : `${name} — ${pickLocalized(line.variantColorNameAr, line.variantColorNameCkb, locale)}`;
}

export const orderService = {
  /**
   * إنشاء طلب: معاملة واحدة — بوّابة الطلب، لقطات، إنشاء، تفريغ العربة.
   *
   * [CRITICAL] **لا تنزيل مخزون هنا.** الطلب يدخل الانتظار والمخزون كما
   * هو؛ الاستهلاك يقع عند قبول الإدارة (`consumeStockOnApproval`). ما يبقى
   * هنا «هل يجوز للزبون أن يطلب هذه الكمية الآن؟» — بوّابةُ طلبٍ لا حجزٌ:
   * طلبان منتظران قد يطلبان المخزون نفسه، ويحسم القبولُ بينهما.
   */
  async create(
    userId: string,
    input: {
      governorateId: string;
      fullAddress: string;
      phone: string;
      zoneId?: string | null;
      expectedPrices?: ReadonlyArray<ExpectedPrice>;
      /** بصمة المعاينة التي راجعها الزبون (`checkoutQuote().fingerprint`) — فحصٌ لا مصدر. */
      expectedQuote?: string;
    },
    /**
     * لغة الطلب — تسمّي المنتج في رسائل الرفض أدناه بلغة الزبون (066).
     * الإطار العربي تترجمه طبقة الأخطاء (`errorMessages.ts`)، والاسم داخله
     * يجب أن يكون بلغة الواجهة نفسها لا عربياً وسط جملة كردية.
     */
    locale: AppLocale = DEFAULT_LOCALE,
    /**
     * مفتاح عدم التكرار من ترويسة `Idempotency-Key` (اختياري — هجرة 083).
     *
     * [CRITICAL] غيابه = السلوك القائم حرفياً (العربة هي المفتاح الضمني،
     * وإعادة المحاولة بعد الالتزام تعود `EMPTY_CART`). حضوره يجعل إعادة
     * المحاولة نفسها تُعيد الطلب الملتزَم بدل خطأٍ ملتبس.
     */
    idempotencyKey: string | null = null,
  ): Promise<{ order: OrderWithItems | null; replayed: boolean }> {
    const idempotency = idempotencyKey
      ? { key: idempotencyKey, fingerprint: orderFingerprint(input) }
      : null;
    try {
      return await orderService.createInTransaction(userId, input, locale, idempotency);
    } catch (error) {
      // شبكة أمان: القيد الفريد يحسم سباقاً لم يمنعه قفل العربة (لا يقع اليوم
      // لأن القفل يُسلسل محاولات الزبون، لكنه يحرس أي إعادة ترتيبٍ مستقبلية).
      // يسبق ترجمة 23505 العامّة التي كانت ستردّ `409 DUPLICATE_VALUE`.
      const { code, constraint } = (error ?? {}) as { code?: string; constraint?: string };
      if (idempotency && code === '23505' && constraint === IDEMPOTENCY_CONSTRAINT) {
        const replay = await replayIfSubmitted(db, userId, idempotency);
        if (replay) return replay;
      }
      throw error;
    }
  },

  /** جسم الإنشاء داخل معاملته — انظر [create]. */
  async createInTransaction(
    userId: string,
    input: {
      governorateId: string;
      fullAddress: string;
      phone: string;
      zoneId?: string | null;
      expectedPrices?: ReadonlyArray<ExpectedPrice>;
      /** بصمة المعاينة التي راجعها الزبون (`checkoutQuote().fingerprint`) — فحصٌ لا مصدر. */
      expectedQuote?: string;
    },
    locale: AppLocale,
    idempotency: { key: string; fingerprint: string } | null,
  ): Promise<{ order: OrderWithItems | null; replayed: boolean }> {
    return withTransaction(async (tx) => {
      // [CRITICAL] العربة مقفولة لهذه المعاملة **أولاً**: إرسالٌ متزامن ينتظر ثم
      // يجد عربةً فارغة — لا طلبين من عربة واحدة (انظر `listItemsForCheckout`).
      // ويُسلسل القفلُ محاولات الزبون نفسه، فالبحث عن المفتاح بعده يرى محاولةً
      // أولى التزمت أثناء الانتظار. الإعادة تسبق كل فحص آخر: محاولةٌ التزمت
      // تُعاد كما هي ولو عُطِّلت محافظتها بعدها.
      const cartItems = await cartRepo.listItemsForCheckout(tx, userId);
      if (idempotency) {
        const replay = await replayIfSubmitted(tx, userId, idempotency);
        if (replay) return replay;
      }

      const governorate = await governorateRepo.listActive(tx);
      const selected = governorate.find((g) => g.id === input.governorateId);
      if (!selected) throw Errors.badRequest('المحافظة غير موجودة أو غير نشطة');

      // رسوم التوصيل: من المنطقة إن كانت المحافظة مقسّمة مناطق، وإلا من
      // المحافظة نفسها. المنطقة إلزامية متى وُجدت مناطق نشطة.
      const zones = await zoneRepo.listForGovernorate(tx, selected.id);
      let deliveryFee = selected.deliveryFee;
      let zoneId: string | null = null;
      let zoneName: string | null = null;

      if (zones.length > 0) {
        if (!input.zoneId) {
          throw Errors.badRequest('اختر منطقة التوصيل', 'ZONE_REQUIRED');
        }
        const zone = zones.find((entry) => entry.id === input.zoneId);
        if (!zone) throw Errors.badRequest('منطقة التوصيل غير صالحة', 'ZONE_INVALID');
        deliveryFee = zone.deliveryFee;
        zoneId = zone.id;
        zoneName = zone.name;
      } else if (input.zoneId) {
        throw Errors.badRequest('هذه المحافظة بلا مناطق توصيل', 'ZONE_NOT_SUPPORTED');
      }

      if (cartItems.length === 0) throw Errors.badRequest('العربة فارغة — أضف منتجات أولاً', 'EMPTY_CART');

      // الأسطر التي اجتازت كل فحص — تُسعَّر معاً بعد الحلقة لأن عرض القطعتين
      // (085) يعدّ قطع المنتج عبر أسطره، فمبلغ السطر لا يُعرف من السطر وحده.
      const accepted: Array<{
        item: (typeof cartItems)[number];
        product: NonNullable<ReturnType<typeof products.get>>;
        unitPrice: number;
        variant: ProductVariant | null;
      }> = [];
      // خصم التوصيل: مجموع مبالغ الترويج عن الكميات المطلوبة. يُحتسب على
      // الخادم من بيانات المنتج وقت الطلب — لا يُقرأ أي مبلغ من العميل.
      let deliveryPromoTotal = 0;
      // [CRITICAL] `FOR SHARE` على منتجات العربة (087): حفظ المسؤول يقفلها
      // `FOR UPDATE`، فلا يتداخل إنشاءٌ قرأ منتجاً بلا ألوان مع أول ألوانٍ تُضاف إليه
      // (فحص `PRODUCT_HAS_OPEN_ORDERS` يرى الطلب، أو يرى الطلبُ الألوان). أقفال
      // المشاركة لا تتعارض فيما بينها: طلباتٌ متزامنة للمنتج نفسه لا تنتظر بعضها.
      const productIds = [...new Set(cartItems.map((line) => line.productId))].sort();
      await tx.query('SELECT id FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR SHARE', [productIds]);
      // قراءةٌ واحدة لكل منتجات العربة لا قراءةٌ لكل سطر.
      const products = await productRepo.findByIds(tx, productIds);
      for (const item of cartItems) {
        const product = products.get(item.productId);
        // [CRITICAL] شبكة الأمان (CA-14): سطرٌ عُطِّل منتجه بعد آخر مزامنة يرفض
        // الإرسال كله. كان يُسقط من الطلب بصمت فيخرج طلبٌ غير الذي رآه الزبون.
        // الاسم في رسائل الرفض بلغة الزبون — سطر العربة يحمل اللغتين.
        const productName = pickLocalized(item.productNameAr, item.productNameCkb, locale);
        if (!product || !product.isActive) {
          throw Errors.conflict(
            `«${productName}» لم يعد متاحاً — أزله من العربة`,
            'PRODUCT_UNAVAILABLE',
          );
        }
        // [CRITICAL] اللون (087): السطر يُطلب بلونه وحده. لونٌ أُوقف أو حُذف بعد
        // الإضافة، أو سطرٌ بلا لون لمنتجٍ صار بألوان، يرفض الإرسال كله — لا لونٌ
        // بديل يُختار عن الزبون. الاسم في الرسائل «المنتج — اللون».
        const variant = resolveLineVariant(product, item);
        if (variant === 'unavailable') {
          throw Errors.conflict(
            `«${lineDisplayName(item, locale)}» لم يعد متاحاً — أزله من العربة`,
            'VARIANT_UNAVAILABLE',
          );
        }
        const shownName = lineDisplayName(item, locale);
        // [CRITICAL] «قريباً — السعر يُعلن لاحقاً» (084): سعرٌ أُزيل بعد الإضافة
        // إلى العربة. لا يُحسب صفراً ولا يُسقط السطر: الإرسال كله يُرفض قبل
        // حجز أي خصم أو كتابة، كما يُرفض المعطَّل.
        const unitPrice = product.price;
        if (unitPrice === null) {
          throw Errors.conflict(
            `سعر «${shownName}» لم يُعلن بعد — أزله من العربة`,
            'PRODUCT_NOT_PRICED',
          );
        }
        // [CRITICAL] اتّساق السعر (CA-14، الخيار أ): الزبون رأى في عربته المُزامَنة
        // سعراً غير الحالي ⇒ الإرسال كله يُرفض. المقارنة بالقراءة **نفسها** التي
        // تُبنى منها اللقطة أدناه وداخل هذه المعاملة بعد قفل العربة — لا قراءة
        // سابقة يمكن أن يسبقها تعديلٌ ملتزَم. يقع قبل حجز الخصمين وقبل إنشاء
        // الطلب، فالرفض لا يترك أثراً. السعر المتوقَّع فحصٌ لا مصدر.
        // وسعر القطعتين (085) متى أرسله العميل: تعديل العرض يغيّر ما يُدفع ولو
        // بقي سعر الوحدة كما هو.
        if (
          input.expectedPrices?.some(
            (expected) =>
              expected.productId === product.id &&
              (expected.unitPrice !== unitPrice ||
                (expected.pairPrice !== undefined && expected.pairPrice !== product.pairPrice)),
          )
        ) {
          throw Errors.conflict(
            `تغيّر سعر «${shownName}» — راجع سلتك قبل الإرسال`,
            'PRODUCT_PRICE_CHANGED',
          );
        }
        // [CRITICAL] المقارنة بمجموع الطلب من هذا المنتج لا بكمية السطر.
        // التحقق سطراً سطراً كان يمرّر عربةً فيها ثلاثة أسطر من منتجٍ
        // مخزونه ٣، كلٌّ منها قطعة، فيُباع أربعٌ أو خمس. القيد في القاعدة
        // (هجرة ٠٤٦) يمنع انقسام الأسطر، وهذا يحرس المجموع مهما انقسمت.
        //
        // بوّابةُ طلبٍ لا استهلاك: قراءةٌ بلا قفل تكفي لأن لا شيء يُكتب
        // في المنتج هنا. الحكم النهائي عند القبول بالرمز نفسه
        // (`INSUFFICIENT_STOCK`) بعد قفلٍ وقراءةٍ للمخزون الحالي.
        //
        // ولسطرٍ بلون (087) على **اللون**: مخزونه ومجموع أسطره وحدها.
        const maxQty = Number(variant ? variant.stock : product.stock);
        const orderedFromProduct = cartItems
          .filter((line) => stockPoolKey(line) === stockPoolKey(item))
          .reduce((sum, line) => sum + line.quantity, 0);
        if (maxQty < orderedFromProduct) {
          throw Errors.conflict(
            `مخزون «${shownName}» غير كافٍ (المتاح: ${maxQty})`,
            'INSUFFICIENT_STOCK',
          );
        }
        if (product.hasDeliveryPromo && product.deliveryPromoAmount > 0) {
          deliveryPromoTotal += product.deliveryPromoAmount * item.quantity;
        }
        accepted.push({ item, product, unitPrice, variant });
      }

      // [CRITICAL] «قطعتان بسعر» (085): مبلغ كل سطر من الدالة نفسها التي تعاين
      // بها العربة وشاشة الدفع، ومن قراءة المنتج **نفسها** داخل هذه المعاملة.
      // السعران يُجمَّدان في اللقطة، فتعديل العرض لاحقاً لا يمسّ هذا الطلب.
      const lineTotals = pairPricedLineTotals(
        accepted.map(({ item, product, unitPrice }) => ({
          id: item.id,
          productId: product.id,
          quantity: item.quantity,
          unitPrice,
          pairPrice: product.pairPrice,
          createdAt: item.createdAt,
        })),
      );
      const snapshots: OrderItemSnapshot[] = accepted.map(({ item, product, unitPrice, variant }) => ({
        productId: product.id,
        // اللقطة باللغتين تُجمَّد الآن (066): تعديل اسم المنتج لاحقاً لا يغيّر
        // طلباً قائماً، والزبون يرى طلبه بلغة واجهته.
        productName: product.nameAr,
        productNameAr: product.nameAr,
        productNameCkb: product.nameCkb,
        // صورة اللون ولقطته (087): ما اختاره الزبون يبقى في طلبه ولو عُدِّل اللون.
        imageUrl: variant?.imageUrl ?? product.images[0] ?? null,
        variantId: variant?.id ?? null,
        variantColorName: variant?.colorNameAr ?? null,
        variantColorNameCkb: variant?.colorNameCkb ?? null,
        variantColorHex: variant?.colorHex ?? null,
        variantKind: variant ? product.variantKind : null,
        optionValue: item.optionValue,
        price: unitPrice,
        pairPrice: product.pairPrice,
        quantity: item.quantity,
        lineTotal: lineTotals.get(item.id)!,
      }));

      // القسمة (سقفُ الزبون وفائضُ المتجر) تقع في `orderRepo.create` من
      // القيمة الخام وحدها، فلا موضعان يحسبانها وقد يتباعدان.

      // الخصمان (الميلاد ومزيّة المستوى) من المسار نفسه الذي تعاين به شاشة
      // الدفع (`checkoutQuote`) — هنا بحجز المزيّة تحت القفل. الاستهلاك داخل
      // هذه المعاملة، فسقوط الطلب لاحقاً يُرجع المزيّة. يسبق إنشاء الطلب لأن
      // `discount` جزءٌ من الصفّ المُنشأ؛ الربط بالطلب يقع بعد وجود معرّفه.
      const productsTotal = snapshots.reduce((sum, item) => sum + item.lineTotal, 0);
      const { birthdayDiscount, loyaltyReward, levelGift, discount } = await orderDiscounts(
        tx,
        userId,
        productsTotal,
        'reserve',
      );

      // [CRITICAL] ربط الإرسال بالمراجعة: البصمة من القيم التي ستُحفظ الآن بعينها
      // (الأسطر، الوجهة برسومها، الخصمان المحجوزان) بالدالة نفسها التي تعاين بها
      // شاشة الدفع. اختلافها ⇒ رفضٌ قبل أي كتابة — المزيّة المحجوزة يُرجعها
      // تراجع المعاملة. غيابها (التطبيق اليوم) = لا فحص، كما كان.
      if (input.expectedQuote !== undefined) {
        const reviewed = quoteFingerprint({
          lines: snapshots.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            optionValue: item.optionValue,
            quantity: item.quantity,
            unitPrice: item.price,
          })),
          governorateId: selected.id,
          zoneId,
          deliveryFee,
          levelGiftId: levelGift?.redemptionId ?? null,
          pricing: priceOrder({
            productsTotal,
            deliveryFee,
            deliveryPromoRaw: deliveryPromoTotal,
            discount,
            loyaltyDiscount: loyaltyReward?.amount ?? 0,
          }),
        });
        if (reviewed !== input.expectedQuote) {
          throw Errors.conflict('تغيّر ملخّص طلبك منذ راجعته', 'QUOTE_CHANGED');
        }
      }

      const order = await orderRepo.create(tx, {
        userId,
        governorateId: input.governorateId,
        province: selected.name,
        deliveryFee,
        fullAddress: input.fullAddress,
        phone: input.phone,
        items: snapshots,
        zoneId,
        zoneName,
        discount,
        deliveryPromoRaw: deliveryPromoTotal,
        loyaltyDiscount: loyaltyReward?.amount ?? 0,
        idempotency,
      });

      if (birthdayDiscount > 0) {
        // القيد الفريد هو الحارس الحقيقي: إن فشل الإدراج فالخصم مستهلك
        // بالفعل هذه السنة، فنتراجع عن الطلب كاملاً بدل منحه مرتين.
        const consumed = await birthdayRepo.consume(
          tx,
          userId,
          order.id,
          birthdayDiscount,
          config.storeTimezone,
        );
        if (!consumed) {
          throw Errors.conflict('خصم عيد الميلاد مستخدم هذه السنة', 'BIRTHDAY_DISCOUNT_USED');
        }
      }

      if (loyaltyReward) {
        // الصفّ مقفول منذ الحجز، فهذا التثبيت لا يخسر سباقاً في الحالة
        // العادية. الشرط يبقى: لو استُهلك رغم ذلك نُسقط الطلب كاملاً بدل
        // إنشائه بخصمٍ لم يُحجز فعلاً.
        const applied = await loyaltyRewardsService.consumeReserved(
          tx,
          loyaltyReward.redemptionId,
          order.id,
        );
        if (!applied) {
          throw Errors.conflict('ميزة الخصم استُهلكت في طلب آخر', 'REWARD_ALREADY_USED');
        }
      }

      // هدية المستوى المحجوزة (إن كانت هي مزيّة هذا الطلب) تُربط به.
      // [CRITICAL] الهدية لا تُكتَب consumed_at ولا تؤثر على المبالغ؛ الصفّ
      // مقفول منذ الحجز، والمؤشر الفريد على orders.loyalty_gift_redemption_id
      // هو الحارس النهائي ضد أي سباق لم يُكشف بالقفل.
      if (levelGift) {
        await loyaltyRewardsService.linkGiftToOrder(tx, levelGift.redemptionId, order.id);
      }

      await cartRepo.clear(tx, userId);
      const created = await orderRepo.findById(tx, order.id);
      // تنبيه هاتف المسؤول — في المعاملة نفسها: طلبٌ تراجع لا يرنّ هاتفاً.
      if (created) await adminEvents.newOrder(tx, created);
      return { order: created, replayed: false };
    });
  },

  /**
   * ملخّص الدفع قبل التأكيد — المبالغ التي سيحفظها [create] لو أُرسل الطلب الآن.
   *
   * [CRITICAL] العطل الذي يعالجه (2026-09-27): الزبون يطالب بمزيّة الخصم ثم
   * يملأ عربته ويصل إلى المراجعة فلا يجد الخصم — الشاشتان كانتا تعاينان خصم
   * الميلاد على العميل وحده، ولا تعرفان المزيّة أصلاً، بينما كان الإنشاء
   * يطبّقها. الآن تُعرض على الزبون أرقام الخادم نفسها:
   *   • العربة المحفوظة على الخادم (ما سيُنشأ منه الطلب) بأسعار المنتجات الحالية.
   *   • الخصمان من `orderDiscounts` بوضع `preview` — المرشّح نفسه بلا قفل،
   *     فالمعاينة لا تحجز المزيّة ولا تستهلكها أبداً.
   *   • المبالغ من `priceOrder` — الدالة نفسها التي يحفظ بها `orderRepo.create`.
   * رسوم التوصيل تُحسب متى عُرفت المحافظة (والمنطقة إن كانت مقسّمة)؛ قبل
   * ذلك تكون `null` ويبقى الإجمالي `null` — لا رقمَ نعرف أنه قد يتغيّر.
   *
   * المعاينة ليست وعداً: الإنشاء يعيد الحساب كله تحت الأقفال، وهو الحكم.
   */
  async checkoutQuote(
    userId: string,
    input: { governorateId?: string | null; zoneId?: string | null },
  ) {
    const lines = await cartRepo.listAllItems(db, userId);
    const products = await productRepo.findByIds(db, [...new Set(lines.map((l) => l.productId))]);

    let deliveryPromoRaw = 0;
    const pricedLines: Array<PairPricedLine & { optionValue: string | null; variantId: string | null }> = [];
    // ما سيرفض الإنشاءُ به الطلبَ كله — يُعرض قبل التأكيد لا بعده.
    const issues: Array<
      | { code: 'PRODUCT_UNAVAILABLE'; productId: string }
      | { code: 'PRODUCT_NOT_PRICED'; productId: string }
      | { code: 'INSUFFICIENT_STOCK'; productId: string; available: number; variantId?: string }
      | { code: 'VARIANT_UNAVAILABLE'; productId: string; variantId: string | null }
    > = [];
    // المجموع على مخزون السطر (087): اللون لسطرٍ بلون، وإلا المنتج.
    const orderedByPool = new Map<
      string,
      { productId: string; variantId: string | null; available: number; ordered: number }
    >();
    for (const line of lines) {
      const product = products.get(line.productId);
      // سطرٌ عُطِّل منتجه سيرفضه الإنشاء كله (`PRODUCT_UNAVAILABLE`)؛ لا يُحسب هنا.
      if (!product || !product.isActive) {
        issues.push({ code: 'PRODUCT_UNAVAILABLE', productId: line.productId });
        continue;
      }
      // سعرٌ لم يُعلن (084): الإنشاء يرفضه كله (`PRODUCT_NOT_PRICED`)، ولا يُحسب صفراً.
      const unitPrice = product.price;
      if (unitPrice === null) {
        issues.push({ code: 'PRODUCT_NOT_PRICED', productId: line.productId });
        continue;
      }
      const variant = resolveLineVariant(product, line);
      if (variant === 'unavailable') {
        issues.push({ code: 'VARIANT_UNAVAILABLE', productId: line.productId, variantId: line.variantId });
        continue;
      }
      if (product.hasDeliveryPromo && product.deliveryPromoAmount > 0) {
        deliveryPromoRaw += product.deliveryPromoAmount * line.quantity;
      }
      const pool = stockPoolKey(line);
      const counted = orderedByPool.get(pool);
      orderedByPool.set(pool, {
        productId: product.id,
        variantId: variant?.id ?? null,
        available: Number(variant ? variant.stock : product.stock),
        ordered: (counted?.ordered ?? 0) + line.quantity,
      });
      pricedLines.push({
        id: line.id,
        productId: product.id,
        variantId: line.variantId,
        optionValue: line.optionValue,
        quantity: line.quantity,
        unitPrice,
        pairPrice: product.pairPrice,
        createdAt: line.createdAt,
      });
    }
    // عرض القطعتين (085) بالدالة نفسها التي يحفظ بها الإنشاء.
    const lineTotals = pairPricedLineTotals(pricedLines);
    const quotedLines: Array<QuotedLine & { pairPrice: number | null; lineTotal: number }> =
      pricedLines.map((line) => ({
        productId: line.productId,
        // اللون (087) لسطرٍ بلون وحده — سطرٌ بلا لون بشكله القديم حرفاً بحرف.
        ...(line.variantId !== null ? { variantId: line.variantId } : {}),
        optionValue: line.optionValue,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        pairPrice: line.pairPrice,
        lineTotal: lineTotals.get(line.id)!,
      }));
    const productsTotal = quotedLines.reduce((sum, line) => sum + line.lineTotal, 0);
    // البوّابة نفسها التي يطبّقها الإنشاء: مجموع المنتج لا كمية السطر.
    for (const { productId, variantId, available, ordered } of orderedByPool.values()) {
      if (available < ordered) {
        issues.push({
          code: 'INSUFFICIENT_STOCK',
          productId,
          available,
          // `variantId` يُضاف لسطرٍ بلون وحده — شكل المشكلة القديم كما هو لغيره.
          ...(variantId !== null ? { variantId } : {}),
        });
      }
    }

    let deliveryFee: number | null = null;
    let governorateId: string | null = null;
    let zoneId: string | null = null;
    if (input.governorateId) {
      const governorates = await governorateRepo.listActive(db);
      const selected = governorates.find((g) => g.id === input.governorateId);
      if (!selected) throw Errors.badRequest('المحافظة غير موجودة أو غير نشطة');
      governorateId = selected.id;
      const zones = await zoneRepo.listForGovernorate(db, selected.id);
      if (zones.length === 0) {
        if (input.zoneId) {
          throw Errors.badRequest('هذه المحافظة بلا مناطق توصيل', 'ZONE_NOT_SUPPORTED');
        }
        deliveryFee = selected.deliveryFee;
      } else if (input.zoneId) {
        const zone = zones.find((entry) => entry.id === input.zoneId);
        if (!zone) throw Errors.badRequest('منطقة التوصيل غير صالحة', 'ZONE_INVALID');
        deliveryFee = zone.deliveryFee;
        zoneId = zone.id;
      }
    }

    const { birthdayDiscount, loyaltyReward, levelGift, discount } = await orderDiscounts(
      db,
      userId,
      productsTotal,
      'preview',
    );
    const loyaltyGiftActivated = levelGift !== null;
    const priced = priceOrder({
      productsTotal,
      deliveryFee: deliveryFee ?? 0,
      deliveryPromoRaw,
      discount,
      loyaltyDiscount: loyaltyReward?.amount ?? 0,
    });

    return {
      productsTotal: priced.productsTotal,
      birthdayDiscount: priced.discount - priced.loyaltyDiscount,
      loyaltyDiscount: priced.loyaltyDiscount,
      loyaltyReward: loyaltyReward
        ? {
            levelKey: loyaltyReward.levelKey,
            percent: loyaltyReward.percent,
            capAmount: loyaltyReward.capAmount,
          }
        : null,
      loyaltyGiftActivated,
      discount: priced.discount,
      deliveryFee,
      deliveryDiscount: deliveryFee === null ? 0 : priced.deliveryDiscount,
      total: deliveryFee === null ? null : priced.total,
      lines: quotedLines,
      issues,
      // يُرسل مع الطلب (`expectedQuote`) فيُرفض إن تغيّر شيءٌ مما رآه الزبون.
      // `null` = لا شيء قابلٌ للإرسال بعد: الرسوم مجهولة، أو العربة فارغة، أو
      // فيها ما سيرفضه الإنشاء.
      fingerprint:
        deliveryFee === null || governorateId === null || quotedLines.length === 0 || issues.length > 0
          ? null
          : quoteFingerprint({
              lines: quotedLines,
              governorateId,
              zoneId,
              deliveryFee,
              levelGiftId: levelGift?.redemptionId ?? null,
              pricing: priced,
            }),
    };
  },

  async listMyOrders(userId: string, page: number, limit: number, status?: OrderStatus) {
    const [orders, statusCounts] = await Promise.all([
      orderRepo.listByUser(db, userId, page, limit, status),
      orderRepo.statusCounts(db, userId),
    ]);
    return { ...orders, statusCounts };
  },

  /**
   * الطلب الذي ينتظر تأكيد استلام، إن وُجد.
   *
   * يقرؤه التطبيق عند كل فتح ليقرّر إظهار «هل استلمت طلبك؟». المرجع هو
   * حالة الطلب في القاعدة لا أي علامة محلية، فالإجابة تبقى صحيحة بعد
   * إعادة التثبيت أو الدخول من جهاز آخر، وتختفي فور تأكيد الاستلام.
   */
  async pendingConfirmation(userId: string) {
    return orderRepo.findAwaitingConfirmation(db, userId);
  },

  async getMyOrder(userId: string, orderId: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');
    if (order.customer?.id !== userId) throw Errors.forbidden();
    return order;
  },

  async adminList(page: number, limit: number, status?: OrderStatus) {
    const [orders, statusCounts] = await Promise.all([
      orderRepo.listAll(db, page, limit, status),
      orderRepo.statusCounts(db),
    ]);
    return { ...orders, statusCounts };
  },

  async adminGet(orderId: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');
    return order;
  },

  /**
   * تحديث حالة الطلب. إضافةً للتحقق من الانتقال واستهلاك المخزون عند القبول،
   * يتولّى هذا المسار الآثار الجانبية كلها داخل معاملة واحدة:
   * - إشعار العميل بكل انتقال يهمّه.
   * - منح نقاط المجرّة عند الاستلام (مرة واحدة لكل طلب).
   * سبب الرفض إلزامي — لا يُرفض طلب بلا سبب واضح للعميل.
   */
  async adminUpdateStatus(
    adminId: string,
    orderId: string,
    input: { status: OrderStatus; note?: string },
  ) {
    // القراءة تحت القفل داخل `applyStatusTransition` هي التي تحسم الوجود
    // والحالة معاً؛ قراءةٌ قبلها كانت تُنفَّذ ثم تُهمَل.
    return applyStatusTransition(orderId, input.status, input.note, adminId);
  },

  /**
   * إعادة جدولة تذكير الاستلام/التقييم (الإدارة).
   *
   * لا يُنشئ مؤقّتاً في الذاكرة: يُحرّك العمود في القاعدة فقط، والجدولة
   * الدورية تلتقط القيمة الجديدة في دورتها التالية. لذلك لا يمكن أن يبقى
   * تذكير قديم «معلّقاً» بموعده الأول بعد التعديل — لا يوجد مؤقّت قديم أصلاً.
   */
  async rescheduleReminder(
    orderId: string,
    input: { delayHours?: number; remindAt?: Date },
  ) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');
    if (!order.dispatchedAt) {
      throw Errors.conflict(
        'لا تذكير قبل خروج الطلب للتوصيل',
        'ORDER_NOT_DISPATCHED',
      );
    }
    if (order.ratingReminderSentAt) {
      throw Errors.conflict('أُرسل التذكير مسبقاً', 'REMINDER_ALREADY_SENT');
    }

    const remindAt =
      input.remindAt ??
      new Date(
        order.dispatchedAt.getTime() + (input.delayHours ?? 24) * 3_600_000,
      );

    const applied = await orderRepo.rescheduleReminder(db, orderId, remindAt);
    if (!applied) {
      throw Errors.conflict('تعذّرت إعادة الجدولة', 'RESCHEDULE_FAILED');
    }
    return orderRepo.findById(db, orderId);
  },

  /** إرسال التذكير فوراً (الإدارة). مُحصَّن ضد التكرار في القاعدة. */
  async sendReminderNow(orderId: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');
    if (!order.deliveredAt) {
      throw Errors.conflict(
        'لا تذكير قبل تأكيد استلام الطلب',
        'ORDER_NOT_DELIVERED',
      );
    }

    // الحارس كله في الجملة الواحدة؛ الرفض يُقرأ بعدها لتسمية سببه. طلبٌ مستلَم
    // لم يُرسَل تذكيره ورفضته الجملة لم يبقَ فيه ما يُقيَّم (CA-16) — تذكيرٌ
    // «اكسب نقاط المجرّة» عنه وعدٌ لا يتحقق.
    const sent = await sendRatingReminderNow(orderId);
    if (!sent) {
      const current = await orderRepo.findById(db, orderId);
      if (current && !current.ratingReminderSentAt && current.reviewableProductCount === 0) {
        throw Errors.conflict('قيّم العميل كل منتجات الطلب — لا تذكير يُرسل', 'NOTHING_TO_REVIEW');
      }
      throw Errors.conflict('أُرسل التذكير مسبقاً', 'REMINDER_ALREADY_SENT');
    }
    return orderRepo.findById(db, orderId);
  },

  /**
   * تأكيد العميل استلام طلبه: OUT_FOR_DELIVERY → COMPLETED.
   *
   * لا يكرّر منطق الإكمال — يمرّ بنفس مسار [applyStatusTransition] الذي
   * تستخدمه الإدارة، فالنقاط والإشعار وسجل الحالة تبقى في مكان واحد ولا
   * تنطلق مرتين. الحماية هنا هي الملكية والحالة المبدئية فقط.
   */
  async confirmReceipt(userId: string, orderId: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');

    // الملكية: لا يؤكّد أحد استلام طلب غيره — نُعيد 404 لا 403 حتى لا
    // نكشف وجود طلبات الآخرين.
    if (order.customer?.id !== userId) {
      throw Errors.notFound('الطلب غير موجود');
    }

    if (order.status === 'COMPLETED') {
      throw Errors.conflict('تم تأكيد استلام هذا الطلب مسبقاً', 'ALREADY_CONFIRMED');
    }

    if (order.status !== 'OUT_FOR_DELIVERY') {
      throw Errors.conflict(
        'لا يمكن تأكيد الاستلام قبل خروج الطلب للتوصيل',
        'NOT_OUT_FOR_DELIVERY',
      );
    }

    return applyStatusTransition(order.id, 'COMPLETED', undefined, userId);
  },
};

/**
 * المسار الموحّد لأي انتقال حالة — تستخدمه الإدارة وتأكيد العميل معاً.
 *
 * كل الآثار الجانبية داخل معاملة واحدة: استهلاك المخزون عند القبول وإرجاعه
 * عند رفض ما قُبل، منح نقاط الاستلام مرة واحدة (يحرسها فهرس فريد)، وإشعار
 * العميل. الاحتفاظ
 * بها هنا يمنع ازدواج المنطق بين مدخلَي الإدارة والعميل.
 *
 * [CRITICAL] القرار كله **داخل** المعاملة وبعد قفل صفّ الطلب: الحالة تُقرأ
 * من جديد تحت القفل لا من نسخةٍ قرأها المستدعي قبل لحظة. بلا ذلك يجتاز
 * قبولان متزامنان للطلب نفسه فحصَ الانتقال معاً فيُستهلك المخزون مرتين؛
 * ومع القفل يرى الثاني الحالة الجديدة فيصير «الحالة نفسها» بلا أثر.
 */
async function applyStatusTransition(
  orderId: string,
  status: OrderStatus,
  rawNote: string | undefined,
  changedBy: string,
) {
  const note = rawNote?.trim() || null;
  const isRejection = status === 'REJECTED';
  if (isRejection && !note) {
    throw Errors.badRequest('سبب الرفض مطلوب', 'REJECTION_REASON_REQUIRED');
  }

  await withTransaction(async (tx) => {
    await orderRepo.lockForUpdate(tx, orderId);
    const order = await orderRepo.findById(tx, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');

    const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(status) && order.status !== status) {
      throw Errors.conflict(`غير مسموح بالانتقال من ${order.status} إلى ${status}`);
    }

    const customerId = order.customer?.id ?? null;

    // القبول = أول خروجٍ من الانتظار إلى غير الرفض. هنا وحده يُستهلك
    // المخزون؛ رفضُ المنتظر لا يمسّه (لم يُحجز شيء)، وإعادة القبول «حالةٌ
    // نفسها» فلا تمرّ من هنا — التنزيل مرة واحدة بالبناء لا بالعدّ.
    const isApproval =
      order.status === 'PENDING_ADMIN_CONFIRMATION' && !isRejection && status !== order.status;
    if (isApproval) {
      await consumeStockOnApproval(tx, order);
    }
    // رفضُ طلبٍ استُهلك مخزونه (غادر الانتظار ولم يُرفض بعد) يُرجعه. الحالة
    // تُقرأ تحت القفل، فرفضان متزامنان يمرّ أحدهما والآخر يرى `REJECTED`.
    const isReleasingRejection =
      isRejection && order.status !== 'PENDING_ADMIN_CONFIRMATION' && order.status !== 'REJECTED';
    if (isReleasingRejection) {
      await releaseStockOnRejection(tx, order);
    }

    await orderRepo.updateStatus(tx, order.id, status, note, changedBy);

    // موعد **تذكير** التقييم يُثبَّت ساعةَ يخرج الطلب للتوصيل — وهو فعل
    // الإدارة. لا علاقة له بفتح التقييم: ذاك يقع بتأكيد الاستلام.
    if (status === 'OUT_FOR_DELIVERY') {
      await orderRepo.markDispatched(tx, order.id, reviewReminderDelayHours());
    }

    if (!customerId) return;

    // منح نقاط الاستلام مرة واحدة — الفهرس الفريد يمنع التكرار.
    if (status === 'COMPLETED' && order.status !== 'COMPLETED') {
      // تثبيت لحظة الاستلام — وهي وحدها ما يفتح التقييم. داخل المعاملة
      // نفسها مع منح النقاط: إمّا أن يُسجَّل الاستلام كاملاً أو لا شيء.
      await orderRepo.markDelivered(tx, order.id, reviewReminderDelayHours());
      // نقاط الشراء: خمس نقاط عن كل ١٠٬٠٠٠ دينار من قيمة الشراء المؤهَّلة
      // (مجموع المنتجات ناقص خصوماتها — بلا رسوم التوصيل). كانت القيمة
      // مبلغاً ثابتاً يضبطه المسؤول، فطلبٌ بعشرة آلاف وطلبٌ بمليون كانا
      // يمنحان الشيء نفسه.
      //
      // الحساب على الخادم من صفّ الطلب المحفوظ، لا من أي رقم يرسله العميل.
      const purchasePoints = purchasePointsFor(
        eligiblePurchaseValue({
          productsTotal: order.productsTotal,
          discount: order.discount,
        }),
      );
      // طلبٌ صغير قد يستحق صفراً؛ الدفتر يرفض الصفر (`amount <> 0`) ولا معنى
      // لسطر «+٠» في سجلّ الزبون أصلاً.
      if (purchasePoints > 0) {
        await pointsRepo.award(tx, {
          userId: customerId,
          label: 'نقاط شراء',
          amount: purchasePoints,
          reason: 'order_received',
          orderId: order.id,
        });
      }
    }

    // لغة **المستلِم** لا لغة المسؤول الذي غيّر الحالة.
    const recipientLocale = await userRepo.localeOf(tx, customerId);
    const notification = buildStatusNotification(order.status, status, note, recipientLocale);
    if (notification && status !== order.status) {
      await notificationRepo.create(tx, {
        userId: customerId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        orderId: order.id,
      });
    }
  });

  return orderRepo.findById(db, orderId);
}

/**
 * نص الإشعار لكل انتقال حالة.
 *
 * الحالة السابقة جزء من القرار لا زينة: في المسار الجديد يقفز القبول من
 * الانتظار إلى التوصيل في انتقال واحد، فيجب أن يحمل الإشعارُ القبولَ نفسه
 * (لا يُشعَر العميل «خرج للتوصيل» فقط بلا أن يعرف أن طلبه قُبل). الطلبات
 * الموروثة الواقفة في `CONFIRMED` أو`PREPARING` كانت قد استلمت إشعار القبول
 * أصلاً، فلا يُشعَر القادمُ منها قبولاً ثانياً — يحصل على إشعار التوصيل فقط.
 */
function buildStatusNotification(
  from: OrderStatus,
  status: OrderStatus,
  note: string | null,
  locale: AppLocale,
):
  | {
      type: 'orderAccepted' | 'orderRejected' | 'deliveryUpdate' | 'receiptReminder';
      title: string;
      body: string;
    }
  | null {
  switch (status) {
    // المسار الموروث: طلبات توقّفت عند «تم تأكيده» قبل الدمج الأول.
    case 'CONFIRMED':
      return { type: 'orderAccepted', ...renderNotification('orderAccepted', locale, note) };
    // المسار الموروث: طلبات توقّفت عند «قيد التجهيز» قبل الدمج الثاني.
    case 'PREPARING':
      if (from !== 'PENDING_ADMIN_CONFIRMATION') return null;
      return { type: 'orderAccepted', ...renderNotification('orderAccepted', locale, note) };
    case 'OUT_FOR_DELIVERY':
      // القبول الجديد: الانتظار → التوصيل في خطوة واحدة — إشعار القبول.
      if (from === 'PENDING_ADMIN_CONFIRMATION') {
        return {
          type: 'orderAccepted',
          ...renderNotification('orderAcceptedDispatched', locale, note),
        };
      }
      return { type: 'deliveryUpdate', ...renderNotification('deliveryUpdate', locale, note) };
    case 'COMPLETED':
      return { type: 'receiptReminder', ...renderNotification('orderCompleted', locale, note) };
    case 'REJECTED':
      return { type: 'orderRejected', ...renderNotification('orderRejected', locale, note) };
    default:
      return null;
  }
}
