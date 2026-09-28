import type pg from 'pg';
import type { CartAdjustment, CartSyncLine } from '../domain/cartSync.js';
import type { CartItemRow } from '../types/index.js';
import { kurdishOrNull } from '../utils/locale.js';

export interface CartLine {
  id: string;
  productId: string;
  /** اسم المنتج بالعربية — الحقل القديم، باقٍ بمعناه لعملاءٍ أقدم. */
  productName: string;
  /** الاسم باللغتين صراحةً (066) — التطبيق يختار بلغة واجهته، `null` = ناقص. */
  productNameAr: string;
  productNameCkb: string | null;
  productImage: string | null;
  optionValue: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  stock: number;
  /**
   * ترويج التوصيل على المنتج — تحتاجه السلة والدفع لعرض «خصم التوصيل»
   * قبل الطلب. القيمة معاينة فقط؛ الخادم يعيد حسابها عند الإنشاء.
   */
  hasDeliveryPromo: boolean;
  deliveryPromoAmount: number;
  createdAt: Date;
}

/** يضمن وجود عربة للمستخدم ويعيد معرّفها. */
async function ensureCart(db: pg.Pool | pg.PoolClient, userId: string): Promise<string> {
  await db.query('INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  const { rows } = await db.query<{ id: string }>('SELECT id FROM carts WHERE user_id = $1', [userId]);
  return rows[0]!.id;
}

/** كل أسطر العربة — المعطَّل منها أيضاً. للإرسال وحده (انظر `listItemsForCheckout`). */
const LINE_FROM = `
  SELECT ci.id, ci.product_id AS "productId", ci.option_value AS "optionValue",
         ci.quantity, ci.created_at AS "createdAt",
         p.name AS "productName", p.name_ckb AS "productNameCkb",
         p.stock, p.price AS "unitPrice",
         p.has_delivery_promo AS "hasDeliveryPromo",
         p.delivery_promo_amount AS "deliveryPromoAmount",
         (SELECT pi.url FROM product_images pi
          WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) AS "productImage"
  FROM cart_items ci
  JOIN products p ON p.id = ci.product_id
  WHERE ci.cart_id = $1`;

const LINE_SELECT = `${LINE_FROM} AND p.is_active = TRUE`;

function mapLine(row: Record<string, unknown>): CartLine {
  return {
    id: row.id as string,
    productId: row.productId as string,
    productName: row.productName as string,
    productNameAr: row.productName as string,
    productNameCkb: kurdishOrNull(row.productNameCkb as string | null),
    productImage: (row.productImage as string | null) ?? null,
    optionValue: (row.optionValue as string | null) ?? null,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
    lineTotal: Number(row.unitPrice) * Number(row.quantity),
    stock: Number(row.stock),
    hasDeliveryPromo: row.hasDeliveryPromo === true,
    deliveryPromoAmount: Number(row.deliveryPromoAmount ?? 0),
    createdAt: new Date(row.createdAt as string),
  };
}

export const cartRepo = {
  async listItems(db: pg.Pool | pg.PoolClient, userId: string): Promise<CartLine[]> {
    const cartId = await ensureCart(db, userId);
    const { rows } = await db.query<Record<string, unknown>>(`${LINE_SELECT}
      ORDER BY ci.created_at DESC`, [cartId]);
    return rows.map(mapLine);
  },

  /**
   * يقفل صفّ العربة داخل معاملة ثم يقرأ عناصرها — لإنشاء الطلب وحده.
   *
   * [CRITICAL] بلا هذا القفل كان إرسالان متزامنان (نقرتان سريعتان، أو إعادة
   * إرسال شبكية) يقرآن العربة نفسها معاً، ولا يفصل بينهما إلا قفل صفوف
   * المنتجات — فإن كفى المخزون خرج طلبان بالمبلغ نفسه. مقيسٌ قبل الإصلاح:
   * ثلاثة إرسالات متزامنة ⇒ ثلاثة طلبات. `FOR UPDATE` على صفّ `carts` يجعل
   * الثاني ينتظر الأول حتى يُفرغ العربة داخل معاملته، فيقرأ عربةً فارغة
   * ويُرفض بـ«العربة فارغة» كما لو أرسل متأخّراً.
   *
   * [CRITICAL] يقرأ الأسطر **كلها** — منتجاً عُطِّل أيضاً (CA-14). كان يقرأ
   * بمرشِّح `is_active` فيُسقط السطر المعطَّل من الطلب بصمت، ويمحوه تفريغُ
   * العربة، ويخرج طلبٌ غير الذي زُومن للزبون. الآن يصل السطر إلى فحص
   * `orderService.create` فيُرفض الإرسال بـ`409 PRODUCT_UNAVAILABLE`،
   * والمزامنة التالية تُزيله وتبلّغ الزبون.
   */
  async listItemsForCheckout(tx: pg.PoolClient, userId: string): Promise<CartLine[]> {
    const cartId = await ensureCart(tx, userId);
    await tx.query('SELECT id FROM carts WHERE id = $1 FOR UPDATE', [cartId]);
    const { rows } = await tx.query<Record<string, unknown>>(`${LINE_FROM}
      ORDER BY ci.created_at DESC`, [cartId]);
    return rows.map(mapLine);
  },

  /**
   * أسطر العربة كما تحتاجها المزامنة (`planCartSync`) — بعد قفل صفّ العربة.
   *
   * [CRITICAL] `FOR UPDATE` نفسه الذي يأخذه الإرسال: مزامنةٌ لا تتداخل مع
   * طلبٍ قيد الإنشاء (يقرأ الأسطر ثم يفرّغها)، ولا مع دمج كميةٍ (`upsertItem`
   * يأخذ `KEY SHARE`). الترتيب بالإضافة — الأقدم يحتفظ بقطعه أولاً.
   */
  async lockForSync(tx: pg.PoolClient, userId: string): Promise<CartSyncLine[]> {
    const cartId = await ensureCart(tx, userId);
    await tx.query('SELECT id FROM carts WHERE id = $1 FOR UPDATE', [cartId]);
    const { rows } = await tx.query<{
      id: string;
      product_id: string;
      name: string;
      name_ckb: string | null;
      option_value: string | null;
      quantity: number;
      stock: number;
      is_active: boolean;
    }>(
      `SELECT ci.id, ci.product_id, p.name, p.name_ckb, ci.option_value, ci.quantity,
              p.stock, p.is_active
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
        WHERE ci.cart_id = $1
        ORDER BY ci.created_at, ci.id`,
      [cartId],
    );
    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.name,
      productNameCkb: kurdishOrNull(row.name_ckb),
      optionValue: row.option_value,
      quantity: Number(row.quantity),
      stock: Number(row.stock),
      isActive: row.is_active,
    }));
  },

  /** يطبّق خطة المزامنة: صفرٌ يحذف السطر، وغيره يضبط الكمية. */
  async applySync(tx: pg.PoolClient, adjustments: readonly CartAdjustment[]): Promise<void> {
    const removed = adjustments.filter((a) => a.quantity === 0).map((a) => a.lineId);
    if (removed.length > 0) {
      await tx.query('DELETE FROM cart_items WHERE id = ANY($1::uuid[])', [removed]);
    }
    for (const adjustment of adjustments.filter((a) => a.quantity > 0)) {
      await tx.query('UPDATE cart_items SET quantity = $2 WHERE id = $1', [
        adjustment.lineId,
        adjustment.quantity,
      ]);
    }
  },

  /**
   * إضافة/دمج منتج في العربة؛ إن وُجد سطر مطابق تُدمج الكمية.
   *
   * [CRITICAL] القفل `KEY SHARE` على صفّ العربة **في الجملة نفسها**. السطر
   * الجديد يأخذه ضمناً (فحص المفتاح الأجنبي) فينتظر طلباً قيد الإنشاء يمسك
   * العربة `FOR UPDATE` (`listItemsForCheckout`)؛ أمّا الدمج في سطرٍ قائم
   * (`ON CONFLICT … DO UPDATE`) فلا يُدرج صفّاً ولا يفحص مفتاحاً، فكان يلتزم
   * فوراً ثم يمحوه تفريغ العربة: الزيادة لا في الطلب ولا في العربة، بردّ
   * ٢٠٠ (CA-6). بالقفل الصريح ينتظر الدمجُ كالسطر الجديد، ثم يقع على عربة
   * ما بعد الطلب — ترتيبٌ تسلسلي: الطلب ثم الإضافة.
   *
   * الإدراج **يقرأ** من `locked` عمداً: تعبير `WITH` غير المعدِّل لا يُنفَّذ
   * إن لم يُشر إليه، فالقفل بلا إشارة لا يُؤخذ أصلاً.
   */
  async upsertItem(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    input: { productId: string; optionValue: string | null; quantity: number },
  ): Promise<CartLine> {
    const cartId = await ensureCart(db, userId);
    const { rows } = await db.query(
      `WITH locked AS (SELECT id FROM carts WHERE id = $1 FOR KEY SHARE)
       INSERT INTO cart_items (cart_id, product_id, option_value, quantity)
       SELECT locked.id, $2::uuid, $3::text, $4::int FROM locked
       ON CONFLICT (cart_id, product_id, option_value)
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
       RETURNING *`,
      [cartId, input.productId, input.optionValue, input.quantity],
    );
    const row = rows[0]!;
    // إعادة جلب السطر الكامل.
    const { rows: lineRows } = await db.query<Record<string, unknown>>(
      `${LINE_SELECT} AND ci.id = $2
      ORDER BY ci.created_at DESC`,
      [cartId, row.id],
    );
    return mapLine(lineRows[0]!);
  },

  async findItem(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    itemId: string,
  ): Promise<CartLine | null> {
    const cartId = await ensureCart(db, userId);
    const { rows } = await db.query<Record<string, unknown>>(
      `${LINE_SELECT} AND ci.id = $2
      ORDER BY ci.created_at DESC`,
      [cartId, itemId],
    );
    return rows[0] ? mapLine(rows[0]) : null;
  },

  async updateQuantity(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    itemId: string,
    quantity: number,
  ): Promise<boolean> {
    const cartId = await ensureCart(db, userId);
    const result = await db.query(
      'UPDATE cart_items SET quantity = $3 WHERE id = $1 AND cart_id = $2',
      [itemId, cartId, quantity],
    );
    return (result.rowCount ?? 0) > 0;
  },

  async removeItem(db: pg.Pool | pg.PoolClient, userId: string, itemId: string): Promise<boolean> {
    const cartId = await ensureCart(db, userId);
    const result = await db.query('DELETE FROM cart_items WHERE id = $1 AND cart_id = $2', [itemId, cartId]);
    return (result.rowCount ?? 0) > 0;
  },

  async clear(db: pg.Pool | pg.PoolClient, userId: string): Promise<void> {
    const cartId = await ensureCart(db, userId);
    await db.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
  },
};