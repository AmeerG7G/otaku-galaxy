import { formatIraqiPhone } from '../utils/phone.js';

/**
 * نصوص إشعارات هاتف **المسؤول** (STEP 64) — عربيةٌ وحدها عمداً.
 *
 * [I18N] ليست إشعارات زبون: اللوحة عربيةٌ كلها ومسار `/api/admin` مثبَّتٌ على
 * العربية (`pinLocale`). إشعارات الزبون تمرّ بـ`notificationTemplates.ts`
 * باللغتين، وحارس `localization.test.ts` يمنع أي نصّ إشعارٍ حرفي في
 * `services/` — لذلك تعيش نصوص المسؤول هنا جدولاً مسمّى لا سطوراً متناثرة.
 */

const iqd = (amount: number) => `${Math.round(amount).toLocaleString('en-US')} د.ع`;

export const ADMIN_EVENT_TEXTS = {
  newOrder: (customerName: string | null | undefined, total: number) => ({
    title: 'طلب جديد 🛒',
    body: `${customerName ?? 'زبون'} — ${iqd(total)}`,
  }),
  accountRequest: (kind: 'registration' | 'password_reset', username: string, phone: string) => ({
    title: kind === 'registration' ? 'طلب إنشاء حساب' : 'طلب إعادة تعيين كلمة المرور',
    // الرقم بصيغة اللوحة `07…` لا المخزَّنة `+9647…` — المسؤول يرى الرقم نفسه هنا وفي الطلب.
    body: `${username} — ${formatIraqiPhone(phone)}`,
  }),
  restockRequest: (productName: string) => ({
    title: 'طلب توفّر جديد',
    body: productName,
  }),
} as const;
