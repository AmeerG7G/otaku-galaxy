import { db, withTransaction } from '../database/pool.js';
import { adminAuditRepo } from '../repositories/adminAuditRepo.js';
import { franchiseRepo } from '../repositories/franchisesRepo.js';
import { Errors } from '../utils/errors.js';

export const franchisesService = {
  async listPublic() {
    return franchiseRepo.listPublic(db);
  },

  async listAll() {
    return franchiseRepo.listAll(db);
  },

  async create(input: {
    name: string;
    altNames?: string[];
    imageUrl?: string | null;
    sortOrder?: number;
  }) {
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
    input: {
      name?: string;
      altNames?: string[];
      imageUrl?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const updated = await franchiseRepo.update(db, id, input);
    if (!updated) throw Errors.notFound('الأنمي غير موجود');
    return updated;
  },

  /**
   * كم منتجاً (نشطاً أو موقوفاً) مرتبطاً بالأنمي — ما يعرضه تأكيد الحذف.
   *
   * يختلف عن `productCount` في القائمة (النشطة وحدها، ما يراه الزبون):
   * الحذف يفكّ الارتباط عن **كل** المنتجات، فالتأكيد يقول العدد كله.
   */
  async usage(id: string) {
    const { rows } = await db.query<{ exists: boolean; product_count: string }>(
      `SELECT EXISTS (SELECT 1 FROM franchises WHERE id = $1) AS exists,
              (SELECT COUNT(*)::text FROM product_franchises WHERE franchise_id = $1) AS product_count`,
      [id],
    );
    if (!rows[0]?.exists) throw Errors.notFound('الأنمي غير موجود');
    return { id, productCount: Number(rows[0].product_count) };
  },

  /**
   * حذف الأنمي ولو كان مرتبطاً بمنتجات (قرار المالك، STEP 64).
   *
   * [CRITICAL] ما يُحذف: صفّ الأنمي وارتباطاته في `product_franchises` وحدها.
   * المنتجات وصورها وأقسامها وبقية أنميّاتها لا تُمسّ — المفتاح الأجنبي في
   * الهجرة ٠١٤ يتتالى من الأنمي إلى جدول الربط فقط، لا إلى `products`.
   *
   * كلّه في معاملة واحدة: قفلُ صفّ الأنمي أولاً (`FOR UPDATE`) يجعل ربطاً
   * متزامناً من نموذج منتج ينتظر ثم يفشل بمفتاحٍ غائب بدل أن يُلحق ارتباطاً
   * بأنمي يُحذف. فكُّ الارتباط صريحٌ لا متروكٌ للتتالي، ليُعدّ ويُسجَّل. البحث
   * يطوي أسماء الأنمي وقت الاستعلام (هجرتا ٠٢٥/٠٦٤)، فلا فهرس ولا عمود يُحدَّث.
   */
  async remove(id: string, actorId?: string) {
    return withTransaction(async (tx) => {
      const { rows } = await tx.query<{ name: string }>(
        'SELECT name FROM franchises WHERE id = $1 FOR UPDATE',
        [id],
      );
      const franchise = rows[0];
      if (!franchise) throw Errors.notFound('الأنمي غير موجود');
      const unlinked = await tx.query(
        'DELETE FROM product_franchises WHERE franchise_id = $1',
        [id],
      );
      await franchiseRepo.remove(tx, id);
      const unlinkedProducts = unlinked.rowCount ?? 0;
      if (actorId) {
        await adminAuditRepo.record(tx, {
          actorId,
          action: 'franchise.deleted',
          targetType: 'franchise',
          targetId: id,
          details: { name: franchise.name, unlinkedProducts },
        });
      }
      return { id, unlinkedProducts };
    });
  },
};
