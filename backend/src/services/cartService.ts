import { db } from '../database/pool.js';
import { cartRepo } from '../repositories/cartRepo.js';
import { productRepo } from '../repositories/catalogRepo.js';
import { Errors } from '../utils/errors.js';

export const cartService = {
  async getCart(userId: string) {
    return cartRepo.listItems(db, userId);
  },

  async addItem(userId: string, input: { productId: string; optionValue: string | null; quantity: number }) {
    const product = await productRepo.findById(db, input.productId);
    if (!product || !product.isActive) throw Errors.notFound('المنتج غير موجود');

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
    return { item: line, cart: await cartRepo.listItems(db, userId) };
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