import type pg from 'pg';
import type { OrderRow, OrderStatus, Paginated } from '../types/index.js';

export interface OrderItemSnapshot {
  productId: string;
  productName: string;
  imageUrl: string | null;
  optionValue: string | null;
  price: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderWithItems {
  id: string;
  number: string;
  status: OrderStatus;
  province: string;
  deliveryFee: number;
  fullAddress: string;
  phone: string;
  productsTotal: number;
  discount: number;
  /** ما جاء من مزيّة مستوى ضمن `discount` — للعرض والتدقيق. */
  loyaltyDiscount: number;
  /** خصم التوصيل المطبَّق وقت الطلب (لقطة تاريخية). */
  deliveryDiscount: number;
  total: number;
  customer: { id: string; name: string; phone: string } | null;
  createdAt: Date;
  items: OrderItemSnapshot[];
  /** منطقة التوصيل داخل المحافظة وقت الطلب (النجف حالياً)؛ null لغيرها. */
  zoneName: string | null;
  /** آخر ملاحظة إدارية غير مرتبطة بالرفض (وقت الوصول المتوقع مثلاً). */
  deliveryNote: string | null;
  /** ملاحظة الإدارة عند الرفض — تُعرض للعميل كسبب الرفض؛ null غير ذلك. */
  rejectionReason: string | null;
  /** لحظة خروج الطلب للتوصيل — مرجع نافذة التقييم. */
  dispatchedAt: Date | null;
  /** لحظة تأكيد الاستلام؛ null قبل الاستلام. */
  deliveredAt: Date | null;
  /** لحظة فتح التقييم (الاستلام + المهلة)؛ null قبل الاستلام. */
  /**
   * موعد إرسال تذكير التقييم — **ليس** موعد فتح التقييم.
   *
   * التقييم يُفتح بالاستلام (انظر [canReview]). هذا الحقل يخصّ إشعار
   * «شلونها المنتجات؟» وحده.
   */
  ratingReminderAt: Date | null;
  /**
   * هل يستطيع صاحب الطلب تقييم منتجاته الآن؟
   * لا في التطبيق — الواجهة تعرض القرار ولا تتخذه.
   */
  canReview: boolean;
  /** لحظة إرسال تذكير التقييم؛ null إن لم يُرسل بعد. */
  ratingReminderSentAt: Date | null;
  /** سجل انتقالات الحالة بأوقاتها (بلا هوية من غيّرها — لا تُكشف للعميل). */
  statusHistory: OrderStatusEvent[];
}

/** حدث واحد في مسار الطلب. */
export interface OrderStatusEvent {
  status: OrderStatus;
  note: string | null;
  createdAt: Date;
}

const ORDER_WITH_CUSTOMER = `
  SELECT o.*,
         COALESCE(
           (SELECT json_agg(json_build_object(
              'productId', oi.product_id,
              'productName', oi.product_name,
              'imageUrl', oi.image_url,
              'optionValue', oi.option_value,
              'price', oi.price,
              'quantity', oi.quantity,
              'lineTotal', oi.line_total
            ) ORDER BY oi.id)
            FROM order_items oi
            WHERE oi.order_id = o.id),
           '[]'::json
         ) AS items,
         json_build_object('id', u.id, 'name', u.username, 'phone', u.phone) AS customer,
         COALESCE(
           (SELECT json_agg(json_build_object(
              'status', h.status,
              'note', h.note,
              'createdAt', h.created_at
            ) ORDER BY h.created_at)
            FROM order_status_history h
            WHERE h.order_id = o.id),
           '[]'::json
         ) AS status_history,
         -- [CRITICAL] الأهلية من الاستلام لا من مؤقّت. كان الشرط يقارن
         -- rating_available_at بالساعة، أي مهلةً يضبطها المسؤول تفصل بين
         -- ضغطة «استلمت طلبي» وفتح التقييم. صارت: استُلم الطلب ⇒ يُقيَّم.
         (o.delivered_at IS NOT NULL) AS can_review,
         (SELECT h.note FROM order_status_history h
          WHERE h.order_id = o.id AND h.status = 'REJECTED'
          ORDER BY h.created_at DESC LIMIT 1) AS rejection_reason,
         (SELECT h.note FROM order_status_history h
          WHERE h.order_id = o.id AND h.status = 'OUT_FOR_DELIVERY'
            AND h.note IS NOT NULL AND btrim(h.note) <> ''
          ORDER BY h.created_at DESC LIMIT 1) AS delivery_note
  FROM orders o
  LEFT JOIN users u ON u.id = o.user_id`;

/**
 * الطلب كما تراه الإدارة — يضيف المحاسبة الداخلية إلى ما يراه العميل.
 *
 * [CRITICAL] نوعٌ منفصل لا حقلٌ اختياري على `OrderWithItems`: `mapOrder`
 * قائمةُ سماحٍ صريحة يقرأها مسارُ العميل ومسارُ الإدارة معاً، وإضافة الفائض
 * إليها كانت تكشف رقماً محاسبياً داخلياً لكل زبون يفتح طلبه.
 */
export interface AdminOrderWithItems extends OrderWithItems {
  /**
   * ما تجاوز رسوم التوصيل من ترويج المنتجات — محتفَظ به للمتجر.
   *
   * ليس خصماً للزبون ولا يدخل `total`. يُقرأ من مسارات `/admin` وحدها.
   */
  deliveryDiscountExcess: number;
}

function mapOrder(row: Record<string, unknown>): OrderWithItems {
  return {
    id: row.id as string,
    number: row.number as string,
    status: row.status as OrderStatus,
    province: row.province as string,
    deliveryFee: Number(row.delivery_fee),
    fullAddress: row.full_address as string,
    phone: row.phone as string,
    productsTotal: Number(row.products_total),
    discount: Number(row.discount),
    deliveryDiscount: Number(row.delivery_discount ?? 0),
    loyaltyDiscount: Number(row.loyalty_discount ?? 0),
    total: Number(row.total),
    customer: (row.customer as OrderWithItems['customer']) ?? null,
    createdAt: new Date(row.created_at as string),
    items: (row.items as OrderItemSnapshot[]) ?? [],
    zoneName: (row.zone_name as string | null) ?? null,
    deliveryNote: (row.delivery_note as string | null) ?? null,
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    dispatchedAt: row.dispatched_at ? new Date(row.dispatched_at as string) : null,
    deliveredAt: row.delivered_at ? new Date(row.delivered_at as string) : null,
    ratingReminderAt: row.rating_reminder_at
      ? new Date(row.rating_reminder_at as string)
      : null,
    canReview: row.can_review === true,
    ratingReminderSentAt: row.rating_reminder_sent_at
      ? new Date(row.rating_reminder_sent_at as string)
      : null,
    statusHistory: ((row.status_history as unknown[]) ?? []).map((entry) => {
      const event = entry as { status: OrderStatus; note: string | null; createdAt: string };
      return {
        status: event.status,
        note: event.note ?? null,
        createdAt: new Date(event.createdAt),
      };
    }),
  };
}

/** يضيف الفائض المحاسبي إلى الشكل الذي يراه العميل — لمسارات الإدارة وحدها. */
function mapAdminOrder(row: Record<string, unknown>): AdminOrderWithItems {
  return {
    ...mapOrder(row),
    deliveryDiscountExcess: Number(row.delivery_discount_excess ?? 0),
  };
}

export const orderRepo = {
  /**
   * قفل صفّ الطلب داخل معاملة.
   *
   * [CRITICAL] هذا ما يجعل سقفَ نقاط التقييم لكل طلب صحيحاً تحت التزامن.
   * اعتمادُ تقييمين من الطلب نفسه في اللحظة ذاتها يقرأ كلٌّ منهما «المُنح
   * حتى الآن» قبل أن يكتب الآخر، فيمنحان معاً أكثر من السقف. القفل يُسلسل
   * الاعتمادَين: الثاني ينتظر ثم يقرأ ما كتبه الأول فعلاً.
   *
   * القفل على `orders` لا على `points_ledger` عمداً: السقف تعريفُه «لكل
   * طلب»، والصفّ الذي يمثّل الطلب هو نقطة التسلسل الطبيعية الموجودة أصلاً.
   */
  async lockForUpdate(client: pg.PoolClient, orderId: string) {
    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM orders WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    return rows[0]?.id ?? null;
  },

  /** إنشاء الطلب داخل المعاملة: لقطات + تنزيل المخزون + سجل الحالة. */
  async create(
    db: pg.PoolClient,
    input: {
      userId: string;
      governorateId: string;
      province: string;
      deliveryFee: number;
      fullAddress: string;
      phone: string;
      items: OrderItemSnapshot[];
      /** منطقة التوصيل داخل المحافظة (النجف حالياً) — تحدّد الرسوم فعلياً. */
      zoneId?: string | null;
      zoneName?: string | null;
      /** خصم مطبَّق عند الإنشاء (خصم عيد الميلاد حالياً). */
      discount?: number;
      /** الجزء الآتي من مزيّة مستوى — تفصيلٌ للتدقيق داخل `discount`. */
      loyaltyDiscount?: number;
      /**
       * مجموع ترويج التوصيل **قبل السقف**: Σ(الكمية × مبلغ المنتج).
       *
       * [CRITICAL] يُمرَّر الخام لا المسقوف، والقسمة تقع هنا وحدها:
       * `min` للزبون و`max(0, الخام − الرسوم)` للمتجر. تمرير القيمتين
       * محسوبتين من الخدمة كان يعني موضعين قد يتباعدان، فيُقيَّد للمتجر
       * فائضٌ لا يقابله خصمٌ بلغ الرسوم — وهو بالضبط ما يمنعه قيد القاعدة.
       */
      deliveryPromoRaw?: number;
    },
  ): Promise<OrderWithItems> {
    const { rows: numRows } = await db.query<{ number: string }>(
      "SELECT nextval('order_number_seq')::text AS number",
    );
    const orderNumber = numRows[0]!.number;

    const productsTotal = input.items.reduce((sum, item) => sum + item.lineTotal, 0);
    const discount = Math.min(input.discount ?? 0, productsTotal);
    // الجزء لا يتجاوز الكل: لو قُصّ الخصم الكلي عند مجموع المنتجات وجب أن
    // يُقصّ معه تفصيلُه، وإلا رفض القيدُ `loyalty_discount <= discount` الصفَّ.
    const loyaltyDiscount = Math.min(Math.max(input.loyaltyDiscount ?? 0, 0), discount);
    // ═══ قسمة ترويج التوصيل ═══
    //
    // الخام يُقسم قسمين لا ثالث لهما، ومجموعهما يساوي الخام دائماً:
    //   • ما يناله الزبون  = min(الخام، الرسوم)      → `delivery_discount`
    //   • ما يُقيَّد للمتجر = max(0, الخام − الرسوم) → `delivery_discount_excess`
    //
    // [CRITICAL] الفائض لا يمسّ `productsTotal` ولا `discount` ولا `total`.
    // نقلُه إلى أيٍّ منها يحوّل مبلغاً محتفَظاً به للمتجر إلى خصمٍ إضافي
    // للزبون — وهو عكس المطلوب تماماً.
    const deliveryPromoRaw = Math.max(input.deliveryPromoRaw ?? 0, 0);
    const deliveryDiscount = Math.min(deliveryPromoRaw, input.deliveryFee);
    const deliveryDiscountExcess = Math.max(
      0,
      deliveryPromoRaw - input.deliveryFee,
    );
    const payableDelivery = input.deliveryFee - deliveryDiscount;
    // لا يُسمح بإجمالي سالب مهما بلغ الخصم.
    const total = Math.max(0, productsTotal + payableDelivery - discount);

    const { rows } = await db.query<Record<string, unknown>>(
      `INSERT INTO orders (
         number, user_id, governorate_id, province, delivery_fee, full_address,
         phone, products_total, discount, total, status, zone_id, zone_name,
         delivery_discount, loyalty_discount, delivery_discount_excess
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING_ADMIN_CONFIRMATION', $11, $12, $13, $14, $15)
       RETURNING id, number, status, province, delivery_fee, full_address,
                 phone, products_total, discount, total, created_at, zone_name,
                 delivery_discount, loyalty_discount, delivery_discount_excess`,
      [
        orderNumber,
        input.userId,
        input.governorateId,
        input.province,
        input.deliveryFee,
        input.fullAddress,
        input.phone,
        productsTotal,
        discount,
        total,
        input.zoneId ?? null,
        input.zoneName ?? null,
        deliveryDiscount,
        loyaltyDiscount,
        deliveryDiscountExcess,
      ],
    );
    const order = rows[0]!;

    for (const item of input.items) {
      await db.query(
        `INSERT INTO order_items (
           order_id, product_id, product_name, image_url, option_value, price, quantity, line_total
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [order.id, item.productId, item.productName, item.imageUrl, item.optionValue, item.price, item.quantity, item.lineTotal],
      );
      await db.query(
        'UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2',
        [item.productId, item.quantity],
      );
    }

    await db.query(
      `INSERT INTO order_status_history (order_id, status, changed_by)
       VALUES ($1, 'PENDING_ADMIN_CONFIRMATION', $2)`,
      [order.id, input.userId],
    );

    // الطلب الجديد لم يُستلم بعد: لا نافذة تقييم ولا سجل محمَّل هنا.
    return mapOrder({
      ...order,
      items: [],
      customer: null,
      status_history: [],
      rating_available: false,
    });
  },

  /**
   * الطلب لمسار الإدارة — مثل [findById] مع الفائض المحاسبي.
   *
   * دالةٌ مستقلة عمداً: `findById` يخدم العميل أيضاً، وتوسيعُه كان يسرّب
   * الرقم من حيث لا يقصد أحد.
   */
  async findByIdForAdmin(
    db: pg.Pool | pg.PoolClient,
    id: string,
  ): Promise<AdminOrderWithItems | null> {
    const { rows } = await db.query<Record<string, unknown>>(
      `${ORDER_WITH_CUSTOMER} WHERE o.id = $1`,
      [id],
    );
    return rows[0] ? mapAdminOrder(rows[0]) : null;
  },

  async findById(db: pg.Pool | pg.PoolClient, id: string): Promise<OrderWithItems | null> {
    const { rows } = await db.query<Record<string, unknown>>(
      `${ORDER_WITH_CUSTOMER} WHERE o.id = $1`,
      [id],
    );
    return rows[0] ? mapOrder(rows[0]) : null;
  },

  /**
   * أقدم طلب ينتظر تأكيد استلام من هذا العميل (`OUT_FOR_DELIVERY`).
   *
   * «الأقدم» لأن العميل قد يكون له أكثر من طلب في الطريق: نسأله عن واحد في
   * كل مرة بالترتيب، فلا تتراكم نوافذ فوق بعضها.
   */
  async findAwaitingConfirmation(
    db: pg.Pool | pg.PoolClient,
    userId: string,
  ): Promise<OrderWithItems | null> {
    const { rows } = await db.query<Record<string, unknown>>(
      `${ORDER_WITH_CUSTOMER}
        WHERE o.user_id = $1 AND o.status = 'OUT_FOR_DELIVERY'
        ORDER BY o.created_at
        LIMIT 1`,
      [userId],
    );
    return rows[0] ? mapOrder(rows[0]) : null;
  },

  async findByNumber(db: pg.Pool | pg.PoolClient, number: string): Promise<OrderWithItems | null> {
    const { rows } = await db.query<Record<string, unknown>>(
      `${ORDER_WITH_CUSTOMER} WHERE o.number = $1`,
      [number],
    );
    return rows[0] ? mapOrder(rows[0]) : null;
  },

  async listByUser(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    page: number,
    limit: number,
    status?: OrderStatus,
  ): Promise<Paginated<OrderWithItems>> {
    const where = ['o.user_id = $1'];
    const values: unknown[] = [userId];
    if (status) {
      values.push(status);
      where.push(`o.status = $${values.length}`);
    }
    values.push(limit, (page - 1) * limit);
    const condition = where.join(' AND ');
    const [{ rows }, countRows] = await Promise.all([
      db.query<Record<string, unknown>>(
        `${ORDER_WITH_CUSTOMER} WHERE ${condition} ORDER BY o.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM orders o WHERE ${condition}`,
        values.slice(0, values.length - 2),
      ),
    ]);
    const total = Number(countRows.rows[0]?.total ?? 0);
    return { items: rows.map(mapOrder), page, limit, total, hasMore: page * limit < total };
  },

  async listAll(
    db: pg.Pool | pg.PoolClient,
    page: number,
    limit: number,
    status?: OrderStatus,
  ): Promise<Paginated<OrderWithItems>> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (status) {
      values.push(status);
      where.push(`o.status = $${values.length}`);
    }
    values.push(limit, (page - 1) * limit);
    const condition = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const [{ rows }, countRows] = await Promise.all([
      db.query<Record<string, unknown>>(
        `${ORDER_WITH_CUSTOMER} ${condition} ORDER BY o.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM orders o ${condition}`,
        values.slice(0, values.length - 2),
      ),
    ]);
    const total = Number(countRows.rows[0]?.total ?? 0);
    return { items: rows.map(mapOrder), page, limit, total, hasMore: page * limit < total };
  },

  /** عدّادات الحالات لكل طلب لأهداف العرض والإحصاء. */
  async statusCounts(db: pg.Pool | pg.PoolClient, userId?: string) {
    const values: unknown[] = [];
    const where = userId ? 'WHERE o.user_id = $1' : '';
    if (userId) values.push(userId);
    const { rows } = await db.query<{ status: OrderStatus; total: string }>(
      `SELECT o.status, COUNT(*)::text AS total
       FROM orders o ${where}
       GROUP BY o.status`,
      values,
    );
    const counts: Record<OrderStatus, number> = {
      PENDING_ADMIN_CONFIRMATION: 0,
      CONFIRMED: 0,
      PREPARING: 0,
      OUT_FOR_DELIVERY: 0,
      COMPLETED: 0,
      REJECTED: 0,
    };
    for (const row of rows) counts[row.status] = Number(row.total);
    return counts;
  },

  /**
   * تثبيت لحظة الإرسال للتوصيل، وجدولة تذكير التقييم منها.
   *
   * [NOTE] هذه المهلة لم تعد تفتح التقييم ولا تؤخّره — التقييم يُفتح
   * بالاستلام. ما تجدوله هنا هو **إشعار** «شلونها المنتجات؟» لمن استلم ولم
   * يقيّم. مرجعه فعل الإدارة (الخروج للتوصيل) لا ضغطة العميل، فلا يؤجّله
   * تأخّرُ العميل في التأكيد.
   *
   * `dispatched_at IS NULL` يجعلها تُنفَّذ مرة واحدة: إعادة تطبيق
   * OUT_FOR_DELIVERY لا تُزحزح الموعد. الوقت يُحسب في القاعدة (`now()`).
   */
  async markDispatched(
    db: pg.Pool | pg.PoolClient,
    id: string,
    reminderDelayHours: number,
  ): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE orders
          SET dispatched_at = now(),
              rating_reminder_at = now() + make_interval(hours => $2)
        WHERE id = $1 AND dispatched_at IS NULL`,
      [id, Math.max(0, Math.trunc(reminderDelayHours))],
    );
    return (rowCount ?? 0) > 0;
  },

  /**
   * تثبيت لحظة تأكيد الاستلام — وهي وحدها ما يفتح التقييم.
   *
   * [CRITICAL] لا مهلة بعدها. الكتابة في `delivered_at` تجعل `can_review`
   * صحيحاً في نفس اللحظة، فضغطة «استلمت طلبي» تفتح التقييم فوراً.
   *
   * `reminderDelayHours` يخصّ الإشعار فقط، ويُستعمل احتياطاً لطلبٍ بلا
   * `dispatched_at` (بيانات قديمة) حتى لا يبقى بلا موعد تذكير أصلاً.
   *
   * `delivered_at IS NULL` يجعلها مرة واحدة: إعادة تطبيق COMPLETED لا
   * تُزحزح لحظة الاستلام.
   */
  async markDelivered(
    db: pg.Pool | pg.PoolClient,
    id: string,
    reminderDelayHours: number,
  ): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE orders
          SET delivered_at = now(),
              rating_reminder_at = COALESCE(
                rating_reminder_at,
                now() + make_interval(hours => $2)
              )
        WHERE id = $1 AND delivered_at IS NULL`,
      [id, Math.max(0, Math.trunc(reminderDelayHours))],
    );
    return (rowCount ?? 0) > 0;
  },

  /**
   * إعادة جدولة تذكير الاستلام/التقييم لطلب مستلَم.
   *
   * الشروط في `WHERE` لا في الخدمة: الطلب مستلَم فعلاً، ولم يُرسَل تذكيره
   * بعد. إعادة الجدولة بعد الإرسال لا معنى لها — الإشعار وصل العميل.
   * الإرجاع يخبر المتصل إن طُبِّق التعديل أم لا، فلا يعِد الواجهةَ بنجاح
   * لم يحدث.
   */
  async rescheduleReminder(
    db: pg.Pool | pg.PoolClient,
    id: string,
    remindAt: Date,
  ): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE orders
          SET rating_reminder_at = GREATEST($2::timestamptz, dispatched_at)
        WHERE id = $1
          AND dispatched_at IS NOT NULL
          AND rating_reminder_sent_at IS NULL`,
      [id, remindAt],
    );
    return (rowCount ?? 0) > 0;
  },

  /** تحديث الحالة مع التحقق من الانتقال المسموح + تسجيل التاريخ. */
  async updateStatus(
    db: pg.Pool | pg.PoolClient,
    id: string,
    status: OrderStatus,
    note: string | null,
    changedBy: string,
  ) {
    await db.query('UPDATE orders SET status = $2 WHERE id = $1', [id, status]);
    await db.query(
      'INSERT INTO order_status_history (order_id, status, changed_by, note) VALUES ($1, $2, $3, $4)',
      [id, status, changedBy, note],
    );
  },
};