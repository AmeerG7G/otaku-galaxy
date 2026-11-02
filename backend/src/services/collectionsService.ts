import { db } from '../database/pool.js';
import { productRepo } from '../repositories/catalogRepo.js';
import { collectionRepo } from '../repositories/collectionsRepo.js';
import { Errors } from '../utils/errors.js';

/** حد أقصى معقول يمنع إساءة الاستخدام. */
const MAX_COLLECTIONS_PER_USER = 50;

/**
 * تعارض الفهرس الفريد `(user_id, name)` — نفس الرفض الذي يعطيه الفحص المسبق.
 *
 * الفحص في `create` يقرأ ثم يكتب، فطلبان متزامنان يجتازانه معاً ويصطدم
 * الثاني بالقاعدة؛ و`rename` لم يكن يفحص أصلاً فكان إعادةُ تسمية مجموعةٍ
 * باسم أختها يخرج ٥٠٠. القيد هو الحارس، وهذا يحوّل رفضه إلى الرمز نفسه.
 */
function isDuplicateName(error: unknown): boolean {
  return (error as { code?: string }).code === '23505';
}

function nameTaken(): never {
  throw Errors.conflict('عندك مجموعة بنفس الاسم', 'COLLECTION_NAME_TAKEN');
}

export const collectionsService = {
  async listMine(userId: string) {
    return collectionRepo.listMine(db, userId);
  },

  async create(userId: string, name: string) {
    const existing = await collectionRepo.listMine(db, userId);
    if (existing.length >= MAX_COLLECTIONS_PER_USER) {
      throw Errors.badRequest('وصلت الحد الأقصى للمجموعات', 'COLLECTION_LIMIT');
    }
    if (existing.some((collection) => collection.name === name)) nameTaken();
    try {
      return await collectionRepo.create(db, userId, name);
    } catch (error) {
      if (isDuplicateName(error)) nameTaken();
      throw error;
    }
  },

  /** كل تعديل يتحقّق من الملكية على الخادم قبل تنفيذه. */
  async rename(userId: string, id: string, name: string) {
    const owned = await collectionRepo.findOwned(db, userId, id);
    if (!owned) throw Errors.notFound('المجموعة غير موجودة');
    let renamed = false;
    try {
      renamed = await collectionRepo.rename(db, userId, id, name);
    } catch (error) {
      if (isDuplicateName(error)) nameTaken();
      throw error;
    }
    if (!renamed) throw Errors.notFound('المجموعة غير موجودة');
    return { id, name };
  },

  async remove(userId: string, id: string) {
    const removed = await collectionRepo.remove(db, userId, id);
    if (!removed) throw Errors.notFound('المجموعة غير موجودة');
    return { id };
  },

  async addProduct(userId: string, collectionId: string, productId: string) {
    const owned = await collectionRepo.findOwned(db, userId, collectionId);
    if (!owned) throw Errors.notFound('المجموعة غير موجودة');

    const product = await productRepo.findById(db, productId);
    if (!product || !product.isActive) throw Errors.notFound('المنتج غير موجود');

    await collectionRepo.addProduct(db, collectionId, productId);
    return collectionRepo.findOwned(db, userId, collectionId);
  },

  async removeProduct(userId: string, collectionId: string, productId: string) {
    const owned = await collectionRepo.findOwned(db, userId, collectionId);
    if (!owned) throw Errors.notFound('المجموعة غير موجودة');

    await collectionRepo.removeProduct(db, collectionId, productId);
    return collectionRepo.findOwned(db, userId, collectionId);
  },
};
