import { db } from '../database/pool.js';
import { birthdayRepo } from '../repositories/birthdayRepo.js';
import { Errors } from '../utils/errors.js';

export const birthdayService = {
  async status(userId: string) {
    return birthdayRepo.status(db, userId);
  },

  /**
   * حفظ تاريخ الميلاد مرة واحدة فقط. الشروط مفروضة هنا لا في الواجهة:
   * - لا يُسمح قبل استلام أول طلب.
   * - لا يُسمح بالتعديل بعد الحفظ.
   */
  async setBirthday(userId: string, day: number, month: number) {
    const status = await birthdayRepo.status(db, userId);
    if (!status.unlocked) {
      throw Errors.badRequest(
        'خيار عيد الميلاد يُفتح بعد استلام أول طلب',
        'BIRTHDAY_LOCKED',
      );
    }
    if (status.hasBirthday) {
      throw Errors.conflict('تاريخ الميلاد محفوظ ولا يمكن تغييره', 'BIRTHDAY_ALREADY_SET');
    }
    // تحقّق من صحة اليوم داخل الشهر (٣٠/٣١ و٢٩ لشباط).
    if (!isValidDayForMonth(day, month)) {
      throw Errors.validation('تاريخ غير صالح');
    }

    const saved = await birthdayRepo.setBirthday(db, userId, day, month);
    if (!saved) throw Errors.conflict('تاريخ الميلاد محفوظ مسبقاً', 'BIRTHDAY_ALREADY_SET');
    return birthdayRepo.status(db, userId);
  },
};

/** أقصى عدد أيام لكل شهر (شباط ٢٩ لأننا لا نخزّن السنة). */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isValidDayForMonth(day: number, month: number) {
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= DAYS_IN_MONTH[month - 1]!;
}
