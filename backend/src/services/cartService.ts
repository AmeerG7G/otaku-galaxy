import { db, withTransaction } from '../database/pool.js';
import { planCartSync } from '../domain/cartSync.js';
import { checkOptionValue } from '../domain/productOptions.js';
import { cartRepo } from '../repositories/cartRepo.js';
import { productRepo } from '../repositories/catalogRepo.js';
import { Errors } from '../utils/errors.js';

export const cartService = {
  async getCart(userId: string) {
    return cartRepo.listItems(db, userId);
  },

  /**
   * مزامنة العربة مع حال المنتجات الآن — `GET /cart` (CA-14).
   *
   * تحت قفل العربة: يُزال سطرٌ لم يعد قابلاً للبيع، وتُخفَّض كميةٌ تتجاوز
   * المخزون، ويعود ما عُدِّل في `adjustments` ليُبلَّغ الزبون مرةً واحدة
   * (المزامنة التالية لا تجد شيئاً). الأسعار حيّة في الأسطر نفسها. التكرار
   * آمن: عربةٌ صالحة لا تُمَسّ.
   */
  async sync(userId: string) {
    return withTransaction(async (tx) => {
      const lines = await cartRepo.lockForSync(tx, userId);
      const adjustments = planCartSync(lines);
      await cartRepo.applySync(tx, adjustments);
      const items = await cartRepo.listItems(tx, userId);
      return { items, adjustments };
    });
  },

  async addItem(userId: string, input: { productId: string; optionValue: string | null; quantity: number }) {
    const product = await productRepo.findById(db, input.productId);
    if (!product || !product.isActive) throw Errors.notFound('المنتج غير موجود');
    // «قريباً — السعر يُعلن لاحقاً» (084): يُعرض ولا يُشترى، مهما طلب العميل.
    if (product.price === null) throw Errors.conflict('سعر هذا المنتج لم يُعلن بعد', 'PRODUCT_NOT_PRICED');

    // [CRITICAL] الخيار من خيارات المنتج نفسها لا نصّاً حرّاً. كان أي نصٍّ حتى
    // ٨٠ حرفاً يُقبل — أو لا شيء لمنتجٍ له مقاس ولون — ثم يُنسخ إلى الطلب
    // ويراه المسؤول كما هو، بمحارف التحكم والاتجاه إن وُجدت. القاعدة في
    // `domain/productOptions.ts`.
    //
    // منتجٌ بلا خيارات يُرفض معه أي نصّ بدل أن يُسقَط بصمت: العميلان يرسلان
    // `null` له، فنصٌّ هنا يعني عميلاً يرى منتجاً غير الذي في القاعدة (أزال
    // المسؤول خياراته والصفحة مفتوحة) — يُبلَّغ ولا يُخمَّن عنه.
    //
    // يقع هنا وحده، عند الإضافة: سطرٌ قائم لم يعد مطابقاً (غيّر المسؤول الخيارات
    // بعد إضافته، أو أقدم من هذا الفحص) لا تمسّه المزامنة ولا الطلب — ما خُزِّن
    // يُطلب كما هو، ولا تنكسر عربةٌ قائمة.
    const verdict = checkOptionValue(input.optionValue, await productRepo.findOptionValues(db, product.id));
    if (verdict === 'unexpected') {
      throw Errors.badRequest('هذا المنتج بلا خيارات', 'INVALID_PRODUCT_OPTION');
    }
    if (verdict === 'invalid') {
      throw Errors.badRequest('اختر قيمة صالحة لكل خيار من خيارات المنتج', 'INVALID_PRODUCT_OPTION');
    }

    // تحقق من المخزون بعد الدمج مع ما هو موجود فعلاً.
    //
    // [CRITICAL] المجموع على **كل** الأسطر المطابقة لا أوّلِها. كانت
    // `find` تقرأ سطراً واحداً، وحين انقسمت أسطر المنتج الواحد (انظر هجرة
    // ٠٤٦) صار الحارس يحسب أقلّ من الحقيقة فيمرّ ما يتجاوز المخزون. القيد
    // في القاعدة يمنع الانقسام أصلاً، وهذا يبقى طبقةً ثانية: لا يعتمد
    // الحارس على أن الدمج تمّ.
    //
    // [CRITICAL] التجميع على **المنتج** لا على (المنتج، الخيار).
    // `products.stock` عمود واحد للمنتج ولا مخزون لكل خيار، فحصرُ الجمع في
    // الخيار نفسه كان يمنح كل خيارٍ حصةً كاملة: مخزون ٣ يقبل «أحمر ٢» ثم
    // «أزرق ٢» = ٤ في العربة. مسار الطلب يجمع على المنتج فيرفضها بـ409،
    // فيكتشف الزبون المشكلة عند الدفع لا عند الإضافة. الحدّان الآن يقيسان
    // الشيء نفسه.
    const existing = await cartRepo.listItems(db, userId);
    const alreadyInCart = existing
      .filter((line) => line.productId === input.productId)
      .reduce((sum, line) => sum + line.quantity, 0);
    const requestedTotal = alreadyInCart + input.quantity;

    const maxQty = Number(product.stock);
    if (maxQty === 0) throw Errors.conflict('هذا المنتج نفد من المخزون');
    if (requestedTotal > maxQty) {
      throw Errors.conflict(`الكمية المطلوبة تتجاوز المخزون المتاح (${maxQty})`);
    }

    const line = await cartRepo.upsertItem(db, userId, input);
    const cart = await cartRepo.listItems(db, userId);
    // السطر من العربة كلها لا وحده: مبلغه بعد عرض القطعتين (085) يعتمد على
    // أسطر المنتج الأخرى.
    return { item: cart.find((entry) => entry.id === line.id) ?? line, cart };
  },

  async updateQuantity(userId: string, itemId: string, quantity: number) {
    const line = await cartRepo.findItem(db, userId, itemId);
    if (!line) throw Errors.notFound('العنصر غير موجود في العربة');
    // [CRITICAL] المقارنة على مجموع المنتج في العربة لا على هذا السطر وحده.
    // سطران لمنتجٍ واحد بخيارين، ورفعُ أحدهما إلى كامل المخزون، كان يمرّ
    // لأن الشرط لا يرى السطر الآخر — نفس عيب `addItem` من الجهة الأخرى.
    const others = (await cartRepo.listItems(db, userId))
      .filter((row) => row.productId === line.productId && row.id !== line.id)
      .reduce((sum, row) => sum + row.quantity, 0);
    if (others + quantity > line.stock) {
      throw Errors.conflict(`الكمية المطلوبة تتجاوز المخزون المتاح (${line.stock})`);
    }
    await cartRepo.updateQuantity(db, userId, itemId, quantity);
    return cartRepo.listItems(db, userId);
  },

  async removeItem(userId: string, itemId: string) {
    const ok = await cartRepo.removeItem(db, userId, itemId);
    if (!ok) throw Errors.notFound('العنصر غير موجود في العربة');
    return cartRepo.listItems(db, userId);
  },

  async clear(userId: string) {
    await cartRepo.clear(db, userId);
  },
};