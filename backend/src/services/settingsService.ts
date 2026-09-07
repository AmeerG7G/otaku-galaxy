import { db } from '../database/pool.js';
import { settingsRepo, type StoreSettings } from '../repositories/settingsRepo.js';
import { resetAppVersionCache } from './appVersionService.js';

export const settingsService = {
  /** إعدادات المتجر العامة — يقرأها تطبيق العميل بلا مصادقة. */
  async publicSettings() {
    const settings = await settingsRepo.getAll(db);
    return {
      social: {
        tiktok: settings.social_tiktok,
        instagram: settings.social_instagram,
        whatsapp: settings.social_whatsapp,
        description: settings.social_description,
      },
    };
  },

  async getAll() {
    return settingsRepo.getAll(db);
  },

  async update(values: Partial<StoreSettings>) {
    const saved = await settingsRepo.setMany(db, values);
    // إعدادات النسخة مخبّأة ثلاثين ثانية لأن الوسيط يقرؤها كل طلب؛ إبطالها
    // هنا يجعل تغيير الحدّ الأدنى من اللوحة يسري فوراً لا بعد انتهاء المدة.
    resetAppVersionCache();
    return saved;
  },
};
