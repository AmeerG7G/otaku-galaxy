import type { NextFunction, Request, Response } from 'express';
import type { AppLocale } from '../utils/locale.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** لغةٌ مثبَّتة لهذا المسار — تسبق الترويسة والتفضيل في `resolveLocale`. */
    pinnedLocale?: AppLocale;
  }
}

/**
 * يثبّت لغة الردّ لمسارٍ كامل بصرف النظر عن `Accept-Language` وتفضيل المستخدم.
 *
 * [CRITICAL] لوحة الإدارة عربيةُ الواجهة كلّها. بعد أن صارت الترويسة أولى
 * (`resolveLocale`) كان متصفّحُ مسؤولٍ يرسل `ckb` — أو مسؤولٌ ضبط الكردية في
 * التطبيق — يجعل أخطاء `/api/admin` كرديةً داخل واجهةٍ عربية. التثبيت هنا
 * لا يمسّ سلسلة لغة الزبون: التطبيق، الإشعارات، والكتالوج تبقى كما هي.
 *
 * يُركَّب **قبل** `authenticate` كي تكون أخطاء ٤٠١/٤٠٣ عربيةً أيضاً، ويبقى
 * أثره حتى معالج الأخطاء العامّ لأنه يعيش على `req` لا على المسار.
 */
export function pinLocale(locale: AppLocale) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.pinnedLocale = locale;
    next();
  };
}
