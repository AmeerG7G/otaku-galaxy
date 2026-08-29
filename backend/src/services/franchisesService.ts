import { db } from '../database/pool.js';
import { franchiseRepo } from '../repositories/franchisesRepo.js';
import { Errors } from '../utils/errors.js';

export const franchisesService = {
  async listPublic() {
    return franchiseRepo.listPublic(db);
  },

  async listAll() {
    return franchiseRepo.listAll(db);
  },

  async create(input: { name: string; imageUrl?: string | null; sortOrder?: number }) {
    try {
      return await franchiseRepo.create(db, input);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw Errors.conflict('يوجد أنمي بنفس الاسم', 'FRANCHISE_NAME_TAKEN');
      }
      throw error;
    }
  },

  async update(
    id: string,
    input: { name?: string; imageUrl?: string | null; sortOrder?: number; isActive?: boolean },
  ) {
    const updated = await franchiseRepo.update(db, id, input);
    if (!updated) throw Errors.notFound('الأنمي غير موجود');
    return updated;
  },

  /**
   * الحذف مسموح فقط بلا منتجات مرتبطة — لئلا تختفي روابط تصفّح قائمة.
   * الإدارة تُوقف الأنمي (isActive=false) بدل حذفه في هذه الحالة.
   */
  async remove(id: string) {
    const franchise = await franchiseRepo.findById(db, id);
    if (!franchise) throw Errors.notFound('الأنمي غير موجود');
    if (franchise.productCount > 0) {
      throw Errors.conflict(
        'لا يمكن حذف أنمي مرتبط بمنتجات — أوقفه بدل حذفه',
        'FRANCHISE_HAS_PRODUCTS',
      );
    }
    await franchiseRepo.remove(db, id);
    return { id };
  },
};
