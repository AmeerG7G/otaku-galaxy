/**
 * Privacy policy and account-deletion text (STEP 78), in Arabic and English.
 *
 * Every statement here is derived from the code, migrations and configuration
 * as of the date below — nothing is promised that the system does not do.
 * When the backend changes what it collects, keeps or erases, this file must
 * change with it (see `backend/src/repositories/accountDeletionRepo.ts` for
 * the erased/retained lists, and PROJECT_FEATURE_SPEC.md STEP 78).
 *
 * The rest of the site is Arabic only; these two pages also offer English
 * (`?lang=en`) because the store listing and its reviewers read them.
 */

export type LegalLang = 'ar' | 'en';

export function parseLegalLang(value: unknown): LegalLang {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'en' ? 'en' : 'ar';
}

export const LEGAL_UPDATED = '2026-10-31';

export interface LegalSection {
  id: string;
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalPage {
  title: string;
  /** Label before the date; the date itself is rendered isolated (`<bdi dir="ltr">`) so RTL text does not reorder it. */
  updatedLabel: string;
  intro: string[];
  sections: LegalSection[];
}

const PRIVACY_AR: LegalPage = {
  title: 'سياسة الخصوصية',
  updatedLabel: 'آخر تحديث:',
  intro: [
    'توضّح هذه الصفحة البيانات التي يجمعها متجر «مجرة الأوتاكو» — تطبيق Android والموقع otakugalaxystore.com — وكيف تُستعمل وتُحفظ ومتى تُحذف.',
    'المتجر يبيع منتجات الأنمي في العراق، والدفع عند الاستلام فقط.',
  ],
  sections: [
    {
      id: 'collect',
      heading: 'البيانات التي نجمعها',
      items: [
        'بيانات الحساب: الاسم، ورقم الموبايل العراقي، والجنس (ذكر أو أنثى)، ولغة الواجهة المختارة (العربية أو الكردية)، وصورة الملف الشخصي إن أضفتها، ويوم ميلادك وشهره إن سجّلتهما (بلا سنة).',
        'كلمة المرور: لا نحفظها نصّاً؛ نحفظ تجزئةً أحادية الاتجاه منها (bcrypt) لا يمكن استرجاع كلمة المرور منها.',
        'طلبات الحساب: عند إنشاء حساب أو نسيان كلمة المرور نحفظ ما ترسله (الاسم والرقم والجنس، ومستوى الحساب في طلب إعادة التعيين) ليتحقّق منه فريق المتجر يدوياً عبر واتساب. لا نرسل رسائل SMS ولا رموز تحقّق.',
        'الطلبات: المنتجات والكميات والأسعار والخصومات والمجموع، ومحافظة التوصيل ومنطقته، والعنوان الكامل ورقم التواصل الذي تكتبه للطلب، وتاريخ الطلب وسجلّ حالاته.',
        'نشاطك في المتجر: السلة، والمفضلة، والمجموعات، وتنبيهات توفّر المنتجات، والتقييمات (النجوم والتعليق والصور التي ترفعها)، ونقاط المجرّة ومكافآتها، والإشعارات وهل قرأتها أو فتحتها، وتفضيلات الإشعارات.',
        'الجهاز: لإرسال الإشعارات نحفظ رمز إشعارات الجهاز ونوع المنصّة (Android أو الويب).',
        'إحصاءات الاستعمال — حين يفعّلها المتجر فقط (مطفأة افتراضياً): الأيام التي استُعمل فيها حسابك وعدد مرات تسجيل دخوله في كل يوم، وعدّادات لكل منتج (مشاهدات، إضافات إلى السلة، مشاركات) لا ترتبط بأحد، وكلمات البحث اليومية دون ربطها بأي حساب أو جهاز (وتُستبعد منها الأرقام الشبيهة بأرقام الهواتف).',
        'البيانات التقنية: تسجّل خوادمنا الطلبات الواردة (عنوان IP، والصفحة أو المسار المطلوب، ومعلومات المتصفح أو التطبيق). ويُستعمل عنوان IP لحظياً لحدود عدد الطلبات (منع الإساءة) ولا يُحفظ في قاعدة البيانات.',
        'ملفات تعريف الارتباط في الموقع: ملفّ جلسة واحد مشفَّر (HttpOnly) يحفظ تسجيل دخولك، وملفّ يحفظ اختيار المظهر (فاتح أو داكن). لا ملفات إعلانية ولا ملفات تتبّع من أطراف أخرى.',
        'على جهازك في التطبيق: رمز تسجيل الدخول في التخزين الآمن للجهاز، وعمليات البحث الأخيرة.',
      ],
    },
    {
      id: 'not-collected',
      heading: 'ما لا نجمعه',
      items: [
        'لا بيانات بطاقات دفع ولا حسابات مصرفية — الدفع عند الاستلام.',
        'لا موقع جغرافي من جهازك، ولا جهات اتصال، ولا بريد إلكتروني.',
        'تطبيق Android لا يطلب منك إلا إذن الإشعارات؛ لا يطلب الموقع ولا جهات الاتصال ولا الكاميرا ولا الملفات.',
      ],
    },
    {
      id: 'use',
      heading: 'كيف نستعمل البيانات',
      items: [
        'إنشاء حسابك وتسجيل دخولك، والتحقّق من طلبات إنشاء الحساب وإعادة تعيين كلمة المرور.',
        'تنفيذ طلباتك وتوصيلها والتواصل معك بشأنها، ومنه تواصل فريق المتجر معك عبر واتساب.',
        'نقاط المجرّة والمكافآت وخصم عيد الميلاد.',
        'إرسال الإشعارات التي تختارها (حالة الطلب، توفّر المنتجات، العروض…)، ويمكنك إيقافها من الإعدادات.',
        'عرض تقييمك للآخرين بعد أن يوافق عليه فريق المتجر: يظهر اسم حسابك كما كان عند كتابة التقييم مع النجوم والتعليق والصور.',
        'حماية المتجر من الإساءة، وإحصاءات مجمَّعة عن المبيعات والاستعمال لا تحدّد هويتك.',
      ],
    },
    {
      id: 'share',
      heading: 'مع من نشارك البيانات',
      paragraphs: ['لا نبيع بياناتك ولا نشاركها لأغراض إعلانية. تصل البيانات إلى:'],
      items: [
        'فريق المتجر في لوحة التحكم، كلٌّ بحسب صلاحياته، وتُسجَّل إجراءات الإدارة على الحسابات.',
        'Google Firebase Cloud Messaging لتوصيل الإشعارات: يستلم رمز إشعارات جهازك ونصّ الإشعار ومعرّفات الطلب أو المنتج المرتبطة به.',
        'Cloudflare: يمرّ عبرها الاتصال بالموقع والخادم، فتعالج عنوان IP وبيانات الطلب التقنية.',
        'واتساب (Meta): حين يتواصل معك فريق المتجر للتحقّق من طلب حساب أو بشأن طلب شراء، يمرّ رقمك والمحادثة عبر واتساب.',
        'زوّار المتجر الآخرون: يرون تقييماتك المعتمدة فقط.',
      ],
    },
    {
      id: 'security',
      heading: 'الحفظ والأمان',
      items: [
        'تُحفظ البيانات في قاعدة بيانات المتجر على خوادمه، وتُنقل عبر اتصال مشفَّر (HTTPS).',
        'كلمات المرور مجزّأة، ورمز تسجيل الدخول ينتهي بعد 7 أيام، ويُبطَل فوراً على كل الأجهزة عند تغيير كلمة المرور أو إيقاف الحساب أو حذفه.',
        'في الموقع لا يصل رمز الدخول إلى المتصفح: يُحفظ مشفَّراً في ملفّ جلسة لا تقرؤه الصفحات.',
        'صور الملف الشخصي والتقييمات يجب أن تكون ملفات رفعتها أنت عبر المتجر.',
        'لا توجد وسيلة نقل أو حفظ آمنة تماماً، لكننا نطبّق هذه الإجراءات لحماية بياناتك.',
      ],
    },
    {
      id: 'retention',
      heading: 'مدة الاحتفاظ',
      items: [
        'بيانات الحساب ونشاطه: ما دام الحساب موجوداً، وتُحذف فور حذف الحساب.',
        'الطلبات: تبقى بعد حذف الحساب كاملةً — ومنها رقم التوصيل وعنوانه — لأغراض المحاسبة والالتزامات القانونية. لم يحدِّد المتجر بعدُ مدة ثابتة لحذفها.',
        'سجلّات إرسال الإشعارات: تُحذف بعد 30 يوماً، ورمز الجهاز الذي لا يتواصل 60 يوماً يتوقّف استعماله.',
        'سجلّ الأيام التي استُعمل فيها الحساب، وكلمات البحث اليومية (حين تكون الإحصاءات مفعّلة): 400 يوم.',
        'الإحصاءات المجمَّعة التي لا تحدّد هويتك: تبقى.',
        'سجلّات الخوادم والنسخ الاحتياطية: لا مدة ثابتة مضبوطة لها، وقد تبقى فيها بيانات إلى أن تُحذف تلك السجلّات أو النسخ أو يُكتب فوقها.',
      ],
    },
    {
      id: 'choices',
      heading: 'خياراتك',
      items: [
        'تعديل الاسم والجنس والصورة ولغة الواجهة من الإعدادات، وتغيير كلمة المرور.',
        'تشغيل كل نوع من الإشعارات أو إيقافه.',
        'تغيير رقم الهاتف أو تصحيح تاريخ الميلاد أو السؤال عن بياناتك: تواصل مع فريق المتجر عبر روابط التواصل في التطبيق أو الموقع.',
        'حذف الحساب في أي وقت من صفحة «حذف الحساب» (الرابط أدناه)، أو من الإعدادات في التطبيق.',
      ],
    },
    {
      id: 'changes',
      heading: 'التغييرات على هذه السياسة',
      paragraphs: ['حين تتغيّر هذه السياسة نحدّث هذه الصفحة وتاريخ «آخر تحديث» أعلاها.'],
    },
  ],
};

const PRIVACY_EN: LegalPage = {
  title: 'Privacy Policy',
  updatedLabel: 'Last updated:',
  intro: [
    'This page explains what data the Otaku Galaxy store (مجرة الأوتاكو) — the Android app and the website otakugalaxystore.com — collects, how it is used and stored, and when it is deleted.',
    'The store sells anime merchandise in Iraq, with cash on delivery only.',
  ],
  sections: [
    {
      id: 'collect',
      heading: 'Data we collect',
      items: [
        'Account data: your name, Iraqi mobile number, gender (male or female), chosen interface language (Arabic or Kurdish), a profile photo if you add one, and your birthday day and month if you enter them (no year).',
        'Password: never stored as text. We store a one-way hash (bcrypt) from which the password cannot be recovered.',
        'Account requests: when you register or forget your password, we keep what you submit (name, number, gender, and your account level for a password reset) so that store staff can verify it manually over WhatsApp. We send no SMS and no verification codes.',
        'Orders: products, quantities, prices, discounts and totals; the delivery governorate and zone; the full address and contact phone you enter for the order; the order date and its status history.',
        'Your activity in the store: cart, favourites, collections, back-in-stock alerts, reviews (stars, comment and the photos you upload), Galaxy Points and rewards, notifications and whether you read or opened them, and notification preferences.',
        'Device: to send notifications we store your device notification token and its platform (Android or web).',
        'Usage statistics — only when the store turns them on (off by default): the days your account was used and how many times it signed in on each; per-product counters (views, cart adds, shares) that are not linked to anyone; and daily search terms, not linked to any account or device (phone-like numbers are dropped).',
        'Technical data: our servers log incoming requests (IP address, the page or path requested, browser or app information). The IP address is also used momentarily for request limits (abuse prevention) and is not stored in the database.',
        'Website cookies: one encrypted session cookie (HttpOnly) that keeps you signed in, and one that remembers your theme (light or dark). No advertising or third-party tracking cookies.',
        'On your device, in the app: the sign-in token in the device’s secure storage, and your recent searches.',
      ],
    },
    {
      id: 'not-collected',
      heading: 'What we do not collect',
      items: [
        'No payment card or bank details — payment is cash on delivery.',
        'No location from your device, no contacts, no email address.',
        'The Android app asks you for one permission only, notifications; it requests no location, contacts, camera or storage access.',
      ],
    },
    {
      id: 'use',
      heading: 'How we use data',
      items: [
        'To create your account and sign you in, and to verify registration and password-reset requests.',
        'To fulfil and deliver your orders and contact you about them, including store staff contacting you on WhatsApp.',
        'For Galaxy Points, rewards and the birthday discount.',
        'To send the notifications you choose (order status, back in stock, offers…); you can turn them off in settings.',
        'To show your review to others once store staff approve it: the account name you had when you wrote it appears with the stars, comment and photos.',
        'To protect the store from abuse, and for aggregated sales and usage statistics that do not identify you.',
      ],
    },
    {
      id: 'share',
      heading: 'Who receives data',
      paragraphs: ['We do not sell your data or share it for advertising. Data reaches:'],
      items: [
        'Store staff in the admin dashboard, each according to their permissions; staff actions on accounts are logged.',
        'Google Firebase Cloud Messaging, to deliver notifications: it receives your device token, the notification text and the related order or product identifiers.',
        'Cloudflare: connections to the website and server pass through it, so it processes your IP address and technical request data.',
        'WhatsApp (Meta): when store staff contact you to verify an account request or about an order, your number and the conversation go through WhatsApp.',
        'Other store visitors: they see only your approved reviews.',
      ],
    },
    {
      id: 'security',
      heading: 'Storage and security',
      items: [
        'Data is kept in the store’s database on its servers and sent over encrypted connections (HTTPS).',
        'Passwords are hashed. Sign-in tokens expire after 7 days and are revoked at once on every device when you change your password or the account is suspended or deleted.',
        'On the website the sign-in token never reaches the browser: it is kept encrypted in a session cookie that pages cannot read.',
        'Profile and review photos must be files you uploaded through the store.',
        'No method of transmission or storage is completely secure, but we apply these measures to protect your data.',
      ],
    },
    {
      id: 'retention',
      heading: 'How long we keep data',
      items: [
        'Account data and activity: for as long as the account exists; deleted as soon as the account is deleted.',
        'Orders: kept in full after the account is deleted — including the delivery phone and address — for accounting and legal obligations. The store has not yet set a fixed period after which they are deleted.',
        'Notification delivery records: deleted after 30 days; a device token that has not checked in for 60 days stops being used.',
        'The record of days your account was used, and daily search terms (when statistics are on): 400 days.',
        'Aggregated statistics that do not identify you: kept.',
        'Server logs and backups: no fixed period is configured; data may remain in them until those logs or copies are deleted or overwritten.',
      ],
    },
    {
      id: 'choices',
      heading: 'Your choices',
      items: [
        'Edit your name, gender, photo and interface language in settings, and change your password.',
        'Turn each type of notification on or off.',
        'To change your phone number, correct your birthday or ask about your data, contact store staff through the contact links in the app or on the website.',
        'Delete your account at any time from the “Delete account” page (link below) or from settings in the app.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      paragraphs: ['When this policy changes, we update this page and the “Last updated” date at the top.'],
    },
  ],
};

const DELETION_AR: LegalPage = {
  title: 'حذف الحساب',
  updatedLabel: 'آخر تحديث:',
  intro: [
    'من هنا تحذف حسابك في «مجرة الأوتاكو» (التطبيق والموقع حسابٌ واحد). الحذف فوري ونهائي ولا يمكن التراجع عنه.',
  ],
  sections: [
    {
      id: 'how',
      heading: 'كيف يتم الحذف',
      items: [
        'سجّل الدخول في هذه الصفحة برقم هاتفك وكلمة المرور — هكذا نتأكّد أنك صاحب الحساب.',
        'أدخل كلمة المرور مرة أخرى للتأكيد، واكتب سبب الحذف إن أردت (اختياري).',
        'أكّد الحذف، فيُحذف الحساب فوراً ويظهر لك رقمٌ مرجعي للعملية.',
        'لا يمكن حذف الحساب ما دام له طلب قيد التنفيذ؛ انتظر حتى يكتمل الطلب أو يُرفض.',
        'نسيت كلمة المرور؟ اطلب إعادة تعيينها من صفحة «نسيت كلمة المرور»، فيتواصل معك فريق المتجر عبر واتساب، ثم عُد إلى هنا.',
      ],
    },
    {
      id: 'deleted',
      heading: 'ما يُحذف',
      items: [
        'الاسم ورقم الهاتف وكلمة المرور والجنس وتاريخ الميلاد وصورة الملف الشخصي ولغة الواجهة.',
        'السلة والمفضلة والمجموعات وتنبيهات التوفّر.',
        'التقييمات بتعليقاتها وصورها — تختفي من صفحات المنتجات ومن المجتمع.',
        'نقاط المجرّة وسجلّها، والمكافآت التي طلبتها ولم تُستعمل أو تُسلَّم، والإشعارات وتفضيلاتها، وتسجيلات أجهزة الإشعارات.',
        'طلبات إنشاء الحساب وإعادة تعيين كلمة المرور المرتبطة بك أو برقمك، وسجلّ الأيام التي استُعمل فيها الحساب.',
        'تنتهي جلسات الدخول على كل الأجهزة فوراً.',
      ],
    },
    {
      id: 'retained',
      heading: 'ما يبقى ولماذا',
      items: [
        'طلباتك السابقة كاملةً: المنتجات والأسعار والخصومات والمجموع والتواريخ وسجلّ الحالات، ومحافظة التوصيل ومنطقته، وعنوان التوصيل ورقم التواصل المكتوبان في الطلب — سجلّات مالية للمحاسبة والالتزامات القانونية. تظهر في لوحة المتجر باسم «حساب محذوف».',
        'سجلّات الخصومات والمكافآت المطبَّقة على تلك الطلبات.',
        'سجلّ الحذف نفسه: الرقم المرجعي والتاريخ والسبب إن كتبته وعدد الطلبات الباقية — بلا اسمك ولا رقمك.',
        'سجلّات إجراءات فريق المتجر على الحساب: نوع الإجراء ومن قام به ومتى — بلا محتواه (كالجنس أو تاريخ الميلاد أو السبب).',
        'الإحصاءات المجمَّعة التي لا تحدّد هويتك، وما قد يبقى في سجلّات الخوادم والنسخ الاحتياطية إلى أن تُحذف أو يُكتب فوقها.',
        'مدة الاحتفاظ: لم يحدِّد المتجر بعدُ مدة ثابتة لحذف هذه السجلّات.',
      ],
    },
    {
      id: 'after',
      heading: 'بعد الحذف',
      items: [
        'لا يمكن استعادة الحساب ولا نقاطه.',
        'يصير رقمك متاحاً، فيمكنك إنشاء حساب جديد به لاحقاً — حساباً جديداً بلا طلبات ولا نقاط سابقة.',
      ],
    },
  ],
};

const DELETION_EN: LegalPage = {
  title: 'Delete your account',
  updatedLabel: 'Last updated:',
  intro: [
    'Use this page to delete your Otaku Galaxy (مجرة الأوتاكو) account — the app and the website share one account. Deletion is immediate and permanent and cannot be undone.',
  ],
  sections: [
    {
      id: 'how',
      heading: 'How deletion works',
      items: [
        'Sign in on this page with your phone number and password — this is how we confirm that you own the account.',
        'Enter your password again to confirm, and add a reason if you wish (optional).',
        'Confirm, and the account is deleted at once; you are shown a reference number for the request.',
        'An account cannot be deleted while one of its orders is still in progress; wait until the order is completed or rejected.',
        'Forgot your password? Request a reset from the “Forgot password” page; store staff will contact you on WhatsApp. Then come back here.',
      ],
    },
    {
      id: 'deleted',
      heading: 'What is deleted',
      items: [
        'Your name, phone number, password, gender, birthday, profile photo and interface language.',
        'Your cart, favourites, collections and back-in-stock alerts.',
        'Your reviews with their comments and photos — they disappear from product pages and the community.',
        'Your Galaxy Points and their history, rewards you claimed that were not used or delivered, your notifications and notification preferences, and your registered notification devices.',
        'Registration and password-reset requests linked to you or your number, and the record of days the account was used.',
        'Every signed-in session on every device ends immediately.',
      ],
    },
    {
      id: 'retained',
      heading: 'What is kept, and why',
      items: [
        'Your past orders in full: products, prices, discounts, totals, dates and status history, the delivery governorate and zone, and the delivery address and contact phone written on each order — financial records kept for accounting and legal obligations. In the store dashboard they show as “Deleted account”.',
        'Records of discounts and rewards applied to those orders.',
        'A deletion record: the reference number, the date, your reason if you gave one, and how many orders were kept — without your name or number.',
        'Records of actions store staff took on the account: the type of action, who did it and when — without its content (such as gender, birthday or reason).',
        'Aggregated statistics that do not identify you, and anything that may remain in server logs and backups until they are deleted or overwritten.',
        'Retention period: the store has not yet set a fixed period after which these records are deleted.',
      ],
    },
    {
      id: 'after',
      heading: 'After deletion',
      items: [
        'The account and its points cannot be restored.',
        'Your number becomes free, so you can register with it again later — as a new account with no previous orders or points.',
      ],
    },
  ],
};

export function privacyPolicy(lang: LegalLang): LegalPage {
  return lang === 'en' ? PRIVACY_EN : PRIVACY_AR;
}

export function accountDeletionInfo(lang: LegalLang): LegalPage {
  return lang === 'en' ? DELETION_EN : DELETION_AR;
}

/** Interface text for the deletion workflow (the form, the confirmation, the result). */
export const DELETION_UI = {
  ar: {
    languageSwitch: 'اللغة',
    signInHeading: 'سجّل الدخول للمتابعة',
    signInBody: 'لحماية حسابك لا يُقبل طلب الحذف إلا من صاحب الحساب بعد تسجيل دخوله.',
    signIn: 'تسجيل الدخول',
    forgot: 'نسيت كلمة المرور؟',
    formHeading: 'طلب حذف الحساب',
    signedInAs: 'الحساب الحالي',
    password: 'كلمة المرور',
    reason: 'سبب الحذف (اختياري)',
    reasonHint: '500 حرف على الأكثر.',
    understand: 'أفهم أن الحذف نهائي، وأن طلباتي السابقة تبقى كما هو موضّح أعلاه.',
    continue: 'متابعة',
    confirmHeading: 'تأكيد الحذف النهائي',
    confirmBody: 'سيُحذف حسابك الآن ولا يمكن التراجع. هل تريد المتابعة؟',
    confirm: 'نعم، احذف حسابي',
    cancel: 'إلغاء',
    deleting: 'جارٍ الحذف…',
    missingPassword: 'أدخل كلمة المرور.',
    missingConsent: 'أكّد أنك فهمت ما يحدث عند الحذف.',
    doneHeading: 'تم حذف حسابك',
    reference: 'الرقم المرجعي',
    referenceHint: 'احتفظ بهذا الرقم إن احتجت إلى التواصل مع المتجر بشأن هذا الطلب.',
    retained: (n: number) => (n === 0 ? 'لا طلبات سابقة على هذا الحساب.' : `بقي ${n} من طلباتك السابقة كسجلّات مالية كما هو موضّح أعلاه.`),
    home: 'العودة إلى المتجر',
    privacyLink: 'سياسة الخصوصية',
  },
  en: {
    languageSwitch: 'Language',
    signInHeading: 'Sign in to continue',
    signInBody: 'To protect your account, a deletion request is accepted only from the account owner after signing in.',
    signIn: 'Sign in',
    forgot: 'Forgot your password?',
    formHeading: 'Request account deletion',
    signedInAs: 'Current account',
    password: 'Password',
    reason: 'Reason for deleting (optional)',
    reasonHint: 'Up to 500 characters.',
    understand: 'I understand that deletion is permanent and that my past orders are kept as described above.',
    continue: 'Continue',
    confirmHeading: 'Confirm permanent deletion',
    confirmBody: 'Your account will be deleted now and this cannot be undone. Do you want to continue?',
    confirm: 'Yes, delete my account',
    cancel: 'Cancel',
    deleting: 'Deleting…',
    missingPassword: 'Enter your password.',
    missingConsent: 'Confirm that you understand what deletion does.',
    doneHeading: 'Your account has been deleted',
    reference: 'Reference number',
    referenceHint: 'Keep this number in case you need to contact the store about this request.',
    retained: (n: number) => (n === 0 ? 'This account had no past orders.' : `${n} of your past orders were kept as financial records, as described above.`),
    home: 'Back to the store',
    privacyLink: 'Privacy Policy',
  },
} as const;

/**
 * English for the API's deletion errors. The API answers in Arabic (or
 * Kurdish); on the English page a known code is shown in English, and an
 * unknown one falls back to the API's own message.
 */
export const DELETION_ERRORS_EN: Readonly<Record<string, string>> = {
  INVALID_CURRENT_PASSWORD: 'The password is incorrect.',
  ACCOUNT_HAS_ACTIVE_ORDERS: 'The account has an order in progress. Wait until it is completed or rejected, or contact the store.',
  ACCOUNT_DELETION_RATE_LIMITED: 'Too many attempts. Try again in an hour.',
  ACCOUNT_DELETION_CUSTOMERS_ONLY: 'Only customer accounts can be deleted here.',
  SESSION_REVOKED: 'Your session has ended. Sign in again.',
  UNAUTHORIZED: 'Your session has ended. Sign in again.',
  LOGIN_REQUIRED: 'Sign in first.',
  VALIDATION_ERROR: 'Check the details you entered.',
  NETWORK_ERROR: 'Could not connect. Check your network and try again.',
};
