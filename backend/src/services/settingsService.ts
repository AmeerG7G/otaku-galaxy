import { db } from '../database/pool.js';
import { settingsRepo, type StoreSettings } from '../repositories/settingsRepo.js';

export const settingsService = {
  /** إعدادات المتجر العامة — يقرأها تطبيق العميل بلا مصادقة. */
  async publicSettings() {
    const settings = await settingsRepo.getAll(db);
    return {
      social: {
        tiktok: settings.social_tiktok,
        instagram: settings.social_instagram,
        whatsapp: settings.social_whatsapp,
      },
    };
  },

  async getAll() {
    return settingsRepo.getAll(db);
  },

  async update(values: Partial<StoreSettings>) {
    return settingsRepo.setMany(db, values);
  },
};
