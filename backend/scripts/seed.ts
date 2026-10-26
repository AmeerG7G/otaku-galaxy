import type pg from 'pg';
import { config } from '../src/config/index.js';
import { db, closePools } from '../src/database/pool.js';
import { runMigrations } from './migrate.js';
import { seedAdminUser } from './seedAdmin.js';

/**
 * التصنيف المعتمد — ستة أقسام لا أربعة.
 *
 * [CRITICAL] كان هذا الملف يزرع أربعة أقسام وأحد عشر قسماً فرعياً، بينما
 * التطبيق يعرف ستة (`kMainCategoryOrder` في Flutter) وقاعدة التطوير تحمل
 * خمسةً وثلاثين قسماً فرعياً أُضيفت من لوحة الإدارة. الفجوة تعني أن
 * `db:reset && db:seed` يبني كتالوجاً **مختلفاً** عمّا يراه المطوّر على
 * جهازه، وأن اختبار التكامل يقيس بيانات لا يُنتجها الزرع.
 *
 * الترتيب هنا يطابق `kMainCategoryOrder`، والأسماء تُطابَق بالتطبيع في
 * `canonicalCategoryKey` فتُكتب بإملائها الطبيعي لا مطبَّعةً سلفاً.
 */
const CATEGORIES = [
  { name: 'قرطاسية', nameCkb: 'قرتاسیە', imageUrl: '' },
  { name: 'ملابس', nameCkb: 'جلوبەرگ', imageUrl: '' },
  { name: 'حقائب', nameCkb: 'جانتا', imageUrl: '' },
  { name: 'إكسسوارات', nameCkb: 'ئەکسسوارات', imageUrl: '' },
  { name: 'مجسمات وهدايا', nameCkb: 'فیگەر و دیاری', imageUrl: '' },
  { name: 'منتجات أنمي متنوعة', nameCkb: 'بەرهەمی جۆراوجۆری ئەنیمە', imageUrl: '' },
];

const SUBCATEGORIES: Record<string, { name: string; nameCkb: string }[]> = {
  'ملابس': [
    { name: 'تيشيرتات', nameCkb: 'تیشێرت' },
    { name: 'هوديز', nameCkb: 'هودی' },
    { name: 'قبعات', nameCkb: 'کڵاو' },
    { name: 'جوارب', nameCkb: 'گۆرەوی' },
    { name: 'قفازات', nameCkb: 'دەستکێش' },
    { name: 'وشاح', nameCkb: 'شاڵ' },
    { name: 'غطاء عين للنوم', nameCkb: 'چاوبەند بۆ خەو' },
    { name: 'ملابس أخرى', nameCkb: 'جلوبەرگی تر' },
  ],
  'قرطاسية': [
    { name: 'دفاتر', nameCkb: 'دەفتەر' },
    { name: 'أقلام', nameCkb: 'قەڵەم' },
    { name: 'ملصقات', nameCkb: 'ستیکەر' },
    { name: 'دفاتر ومذكرات', nameCkb: 'دەفتەر و یاداشت' },
    { name: 'دفتر رسم', nameCkb: 'دەفتەری وێنەکێشان' },
    { name: 'محفظة مدرسية', nameCkb: 'قەڵەمدان' },
    { name: 'مساطر', nameCkb: 'ڕاستە' },
    { name: 'ممحاة', nameCkb: 'سڕەوە' },
  ],
  'حقائب': [
    { name: 'ظهرية', nameCkb: 'جانتای پشت' },
    { name: 'قماشية', nameCkb: 'جانتای قوماش' },
    { name: 'حقائب كتف', nameCkb: 'جانتای شان' },
    { name: 'حقائب للطلعة / الاستخدام اليومي', nameCkb: 'جانتای ڕۆژانە' },
  ],
  'إكسسوارات': [
    { name: 'سلاسل', nameCkb: 'زنجیر' },
    { name: 'خواتم', nameCkb: 'ئەنگوستیلە' },
    { name: 'بروشات', nameCkb: 'بڕۆش' },
    { name: 'سلاسل مفاتيح', nameCkb: 'زنجیری کلیل' },
    { name: 'أساور', nameCkb: 'بازن' },
    { name: 'قلائد', nameCkb: 'ملوانکە' },
    { name: 'ميداليات', nameCkb: 'مێدالیا' },
    { name: 'ساعة يد / ساعة جيب', nameCkb: 'کاتژمێری دەست / گیرفان' },
    { name: 'إكسسوارات أخرى', nameCkb: 'ئەکسسواراتی تر' },
  ],
  'مجسمات وهدايا': [
    { name: 'دمى', nameCkb: 'بووکەڵە' },
  ],
  'منتجات أنمي متنوعة': [
    { name: 'بوسترات', nameCkb: 'پۆستەر' },
    { name: 'لوحات', nameCkb: 'تابلۆ' },
    { name: 'ماوس باد', nameCkb: 'ماوس پاد' },
    { name: 'أغطية وسائد', nameCkb: 'ڕووپۆشی سەرین' },
    { name: 'ساعة حائط ومكتبية', nameCkb: 'کاتژمێری دیوار و مێز' },
  ],
};

/**
 * مناطق التوصيل داخل المحافظة. النجف مقسّمة داخل/خارج القضاء برسمين
 * مستقلين — متى وُجدت مناطق، صار اختيارها إلزامياً ورسمها هو المحتسب.
 */
const GOVERNORATE_ZONES: Record<string, { name: string; nameCkb: string; deliveryFee: number }[]> = {
  'النجف': [
    { name: 'داخل قضاء النجف', nameCkb: 'ناو قەزای نەجەف', deliveryFee: 3000 },
    { name: 'خارج قضاء النجف', nameCkb: 'دەرەوەی قەزای نەجەف', deliveryFee: 4000 },
  ],
};

const GOVERNORATES = [
  { name: 'بغداد', nameCkb: 'بەغدا', deliveryFee: 5000 },
  { name: 'البصرة', nameCkb: 'بەسرە', deliveryFee: 6000 },
  { name: 'نينوى', nameCkb: 'نەینەوا', deliveryFee: 6000 },
  { name: 'أربيل', nameCkb: 'هەولێر', deliveryFee: 6000 },
  { name: 'السليمانية', nameCkb: 'سلێمانی', deliveryFee: 6000 },
  { name: 'دهوك', nameCkb: 'دهۆک', deliveryFee: 6000 },
  { name: 'كركوك', nameCkb: 'کەرکووک', deliveryFee: 6000 },
  { name: 'الأنبار', nameCkb: 'ئەنبار', deliveryFee: 6000 },
  { name: 'ديالى', nameCkb: 'دیالە', deliveryFee: 6000 },
  { name: 'بابل', nameCkb: 'بابل', deliveryFee: 6000 },
  { name: 'كربلاء', nameCkb: 'کەربەلا', deliveryFee: 6000 },
  { name: 'النجف', nameCkb: 'نەجەف', deliveryFee: 6000 },
  { name: 'واسط', nameCkb: 'واسیت', deliveryFee: 6000 },
  { name: 'صلاح الدين', nameCkb: 'سەڵاحەدین', deliveryFee: 6000 },
  { name: 'القادسية', nameCkb: 'قادسیە', deliveryFee: 6000 },
  { name: 'المثنى', nameCkb: 'مەسەنا', deliveryFee: 6000 },
  { name: 'ذي قار', nameCkb: 'زیقار', deliveryFee: 6000 },
  { name: 'ميسان', nameCkb: 'مێسان', deliveryFee: 6000 },
];

const img = (label: string) => `https://placehold.co/600x600/e91e63/ffffff?text=${label}`;

const PRODUCTS: {
  name: string;
  nameCkb: string;
  description: string;
  descriptionCkb: string;
  price: number;
  category: string;
  subcategory: string;
  stock: number;
  isOffer: boolean;
  isSelected: boolean;
  images: string[];
  options: { name: string; nameCkb: string; values: string[]; valuesCkb: string[] }[];
}[] = [
  { name: 'تيشيرت ناروتو أسود', nameCkb: 'تیشێرتی ناروتۆی ڕەش', description: 'تيشيرت قطني بقصة ناروتو المميزة.', descriptionCkb: 'تیشێرتی لۆکە بە دیزاینی تایبەتی ناروتۆ.', price: 20000, category: 'ملابس', subcategory: 'تيشيرتات', stock: 30, isOffer: true, isSelected: true, images: [img('naruto')], options: [{ name: 'المقاس', nameCkb: 'قەبارە', values: ['S', 'M', 'L', 'XL'], valuesCkb: [] }] },
  { name: 'هودي ون بيس', nameCkb: 'هودی وان پیس', description: 'هودي شتوي بطبعة ون بيس.', descriptionCkb: 'هودی زستانە بە چاپی وان پیس.', price: 45000, category: 'ملابس', subcategory: 'هوديز', stock: 20, isOffer: false, isSelected: true, images: [img('onepiece')], options: [{ name: 'المقاس', nameCkb: 'قەبارە', values: ['M', 'L', 'XL'], valuesCkb: [] }] },
  { name: 'قبعة بيكاتشو', nameCkb: 'کڵاوی پیکاچو', description: 'قبعة كاجوال بشعار بوكيمون.', descriptionCkb: 'کڵاوی کاژوەڵ بە لۆگۆی پۆکێمۆن.', price: 12000, category: 'ملابس', subcategory: 'قبعات', stock: 40, isOffer: true, isSelected: false, images: [img('pikachu')], options: [] },
  { name: 'دفتر أنمي مقاس A5', nameCkb: 'دەفتەری ئەنیمە قەبارە A5', description: 'دفتر 100 ورقة بغلاف أنمي.', descriptionCkb: 'دەفتەری 100 لاپەڕە بە بەرگی ئەنیمە.', price: 8000, category: 'قرطاسية', subcategory: 'دفاتر', stock: 80, isOffer: false, isSelected: true, images: [img('notebook')], options: [{ name: 'عدد الأوراق', nameCkb: 'ژمارەی لاپەڕە', values: ['80', '120'], valuesCkb: [] }] },
  { name: 'قلم بوكيمون', nameCkb: 'قەڵەمی پۆکێمۆن', description: 'قلم حبر جاف بتصميم بوكيمون.', descriptionCkb: 'قەڵەمی جاف بە دیزاینی پۆکێمۆن.', price: 3000, category: 'قرطاسية', subcategory: 'أقلام', stock: 150, isOffer: true, isSelected: false, images: [img('pen')], options: [] },
  { name: 'ملصقات جدارية أنمي', nameCkb: 'ستیکەری دیواری ئەنیمە', description: 'مجموعة 10 ملصقات متنوعة.', descriptionCkb: 'کۆمەڵەی 10 ستیکەری جۆراوجۆر.', price: 6000, category: 'قرطاسية', subcategory: 'ملصقات', stock: 60, isOffer: false, isSelected: false, images: [img('stickers')], options: [] },
  { name: 'حقيبة ظهر ناروتو', nameCkb: 'جانتای پشتی ناروتۆ', description: 'حقيبة ظهر عملية بتصميم المعلمة.', descriptionCkb: 'جانتای پشتی پراکتیکی بە دیزاینی ناروتۆ.', price: 35000, category: 'حقائب', subcategory: 'ظهرية', stock: 25, isOffer: true, isSelected: true, images: [img('bag')], options: [] },
  { name: 'حقيبة قماشية أنمي', nameCkb: 'جانتای قوماشی ئەنیمە', description: 'حقيبة قماشية خفيفة بتصميم أنمي.', descriptionCkb: 'جانتای قوماشی سووک بە دیزاینی ئەنیمە.', price: 10000, category: 'حقائب', subcategory: 'قماشية', stock: 50, isOffer: false, isSelected: false, images: [img('tote')], options: [] },
  { name: 'سلسلة مفاتيح بيرسونا', nameCkb: 'زنجیری کلیلی پێرسۆنا', description: 'سلسلة معدنية عالية الجودة.', descriptionCkb: 'زنجیری کانزایی بە کوالیتی بەرز.', price: 7000, category: 'إكسسوارات', subcategory: 'سلاسل', stock: 0, isOffer: false, isSelected: true, images: [img('keychain')], options: [{ name: 'التصميم', nameCkb: 'دیزاین', values: ['بيرسونا 1', 'بيرسونا 2'], valuesCkb: ['پێرسۆنا 1', 'پێرسۆنا 2'] }] },
  { name: 'خاتم فضة أنمي', nameCkb: 'ئەنگوستیلەی زیوی ئەنیمە', description: 'خاتم بتصميم ياباني.', descriptionCkb: 'ئەنگوستیلە بە دیزاینی ژاپۆنی.', price: 15000, category: 'إكسسوارات', subcategory: 'خواتم', stock: 35, isOffer: false, isSelected: false, images: [img('ring')], options: [{ name: 'المقاس', nameCkb: 'قەبارە', values: ['18', '19', '20'], valuesCkb: [] }] },
  { name: 'بروش شعار أنمي', nameCkb: 'بڕۆشی لۆگۆی ئەنیمە', description: 'بروش معدني يلمع.', descriptionCkb: 'بڕۆشی کانزایی بریسکەدار.', price: 5000, category: 'إكسسوارات', subcategory: 'بروشات', stock: 45, isOffer: true, isSelected: false, images: [img('pin')], options: [] },
  { name: 'تيشيرت جوجوتسو كايسن', nameCkb: 'تیشێرتی جوجوتسو کایسن', description: 'تيشيرت قطني بقصة جوجوتسو.', descriptionCkb: 'تیشێرتی لۆکە بە دیزاینی جوجوتسو.', price: 22000, category: 'ملابس', subcategory: 'تيشيرتات', stock: 18, isOffer: false, isSelected: false, images: [img('jjk')], options: [{ name: 'المقاس', nameCkb: 'قەبارە', values: ['S', 'M', 'L'], valuesCkb: [] }] },
  { name: 'هودي ديمون سلاير', nameCkb: 'هودی دیمۆن سلەیەر', description: 'هودي بتصميم تنغيرين.', descriptionCkb: 'هودی بە دیزاینی تانجیرۆ.', price: 48000, category: 'ملابس', subcategory: 'هوديز', stock: 12, isOffer: true, isSelected: false, images: [img('demon')], options: [{ name: 'المقاس', nameCkb: 'قەبارە', values: ['M', 'L'], valuesCkb: [] }] },
  { name: 'قبعة لوفي', nameCkb: 'کڵاوی لوفی', description: 'قبعة القش الشهيرة.', descriptionCkb: 'کڵاوە کایە بەناوبانگەکە.', price: 14000, category: 'ملابس', subcategory: 'قبعات', stock: 22, isOffer: false, isSelected: true, images: [img('luffy')], options: [] },
  { name: 'دفتر سبيستون', nameCkb: 'دەفتەری سپەیستوون', description: 'دفتر حكايات ورسومات.', descriptionCkb: 'دەفتەری چیرۆک و وێنە.', price: 9000, category: 'قرطاسية', subcategory: 'دفاتر', stock: 70, isOffer: false, isSelected: false, images: [img('book2')], options: [] },
  { name: 'أقلام تلوين أنمي', nameCkb: 'قەڵەمی ڕەنگکردنی ئەنیمە', description: 'مجموعة أقلام تلوين 12 لوناً.', descriptionCkb: 'کۆمەڵەی قەڵەمی ڕەنگکردن 12 ڕەنگ.', price: 12000, category: 'قرطاسية', subcategory: 'أقلام', stock: 90, isOffer: false, isSelected: false, images: [img('crayons')], options: [] },
  { name: 'حقيبة ظهر جيمس', nameCkb: 'جانتای پشتی جەیمس', description: 'حقيبة بتصميم مميز.', descriptionCkb: 'جانتا بە دیزاینی تایبەت.', price: 38000, category: 'حقائب', subcategory: 'ظهرية', stock: 15, isOffer: false, isSelected: false, images: [img('bag2')], options: [] },
  { name: 'سلسلة نيكو', nameCkb: 'زنجیری نیکۆ', description: 'سلسلة أنمي.', descriptionCkb: 'زنجیری ئەنیمە.', price: 8000, category: 'إكسسوارات', subcategory: 'سلاسل', stock: 33, isOffer: true, isSelected: false, images: [img('chain2')], options: [] },
  { name: 'خاتم أوكو', nameCkb: 'ئەنگوستیلەی ئۆکۆ', description: 'خاتم أنمي فضي.', descriptionCkb: 'ئەنگوستیلەی ئەنیمەی زیوی.', price: 16000, category: 'إكسسوارات', subcategory: 'خواتم', stock: 28, isOffer: false, isSelected: false, images: [img('ring2')], options: [{ name: 'المقاس', nameCkb: 'قەبارە', values: ['19', '20'], valuesCkb: [] }] },
  { name: 'بوستر أنمي A3', nameCkb: 'پۆستەری ئەنیمە A3', description: 'بوستر مطبوع عالي الجودة.', descriptionCkb: 'پۆستەری چاپکراو بە کوالیتی بەرز.', price: 8000, category: 'قرطاسية', subcategory: 'ملصقات', stock: 55, isOffer: false, isSelected: true, images: [img('poster')], options: [] },

  // ═══ منتجات تغطية الأقسام الفرعية ═══
  //
  // [CRITICAL] كل قسمٍ فرعيّ يعرضه الخادم يجب أن يحمل منتجاً واحداً على
  // الأقل. قسمٌ فرعيّ فارغ ليس نقصَ بيانات فحسب: الزبون يفتحه فيجد حالة
  // فراغ في متجرٍ يبدو عامراً، واختبارُ التكامل يسقط عليه بحق. هذه
  // المنتجات تغطّي التسعة عشر قسماً التي كانت فارغة في قاعدة التطوير.
  { name: 'سوار أنمي جلدي', nameCkb: 'بازنی چەرمی ئەنیمە', description: 'سوار جلدي بشعار أنمي.', descriptionCkb: 'بازنی چەرم بە لۆگۆی ئەنیمە.', price: 9000, category: 'إكسسوارات', subcategory: 'أساور', stock: 40, isOffer: false, isSelected: false, images: [img('bracelet')], options: [] },
  { name: 'قلادة أنمي معدنية', nameCkb: 'ملوانکەی کانزایی ئەنیمە', description: 'قلادة بسلسلة فولاذية.', descriptionCkb: 'ملوانکە بە زنجیری پۆڵا.', price: 13000, category: 'إكسسوارات', subcategory: 'قلائد', stock: 30, isOffer: false, isSelected: false, images: [img('necklace')], options: [] },
  { name: 'ميدالية أنمي معدنية', nameCkb: 'مێدالیای کانزایی ئەنیمە', description: 'ميدالية مينا ملوّنة.', descriptionCkb: 'مێدالیای مینای ڕەنگاوڕەنگ.', price: 6000, category: 'إكسسوارات', subcategory: 'ميداليات', stock: 60, isOffer: true, isSelected: false, images: [img('medal')], options: [] },
  { name: 'ساعة يد أنمي', nameCkb: 'کاتژمێری دەستی ئەنیمە', description: 'ساعة يد بعقارب وتصميم أنمي.', descriptionCkb: 'کاتژمێری دەستی عەقرەبەدار بە دیزاینی ئەنیمە.', price: 28000, category: 'إكسسوارات', subcategory: 'ساعة يد / ساعة جيب', stock: 18, isOffer: false, isSelected: false, images: [img('watch')], options: [] },
  { name: 'دبوس ربطة أنمي', nameCkb: 'دەبووسی ئەنیمە', description: 'إكسسوار صغير متعدّد الاستعمال.', descriptionCkb: 'ئەکسسوارێکی بچووکی فرەبەکارهێنان.', price: 4000, category: 'إكسسوارات', subcategory: 'إكسسوارات أخرى', stock: 50, isOffer: false, isSelected: false, images: [img('misc')], options: [] },
  { name: 'دفتر رسم أنمي A4', nameCkb: 'دەفتەری وێنەکێشانی ئەنیمە A4', description: 'دفتر رسم بورق سميك.', descriptionCkb: 'دەفتەری وێنەکێشان بە لاپەڕەی ئەستوور.', price: 11000, category: 'قرطاسية', subcategory: 'دفتر رسم', stock: 45, isOffer: false, isSelected: false, images: [img('sketch')], options: [] },
  { name: 'محفظة مدرسية أنمي', nameCkb: 'قەڵەمدانی ئەنیمە', description: 'محفظة أقلام بسحّاب.', descriptionCkb: 'قەڵەمدانی زیپدار.', price: 7000, category: 'قرطاسية', subcategory: 'محفظة مدرسية', stock: 55, isOffer: false, isSelected: false, images: [img('pencilcase')], options: [] },
  { name: 'مسطرة أنمي 30 سم', nameCkb: 'ڕاستەی ئەنیمە 30 سم', description: 'مسطرة بلاستيكية شفافة.', descriptionCkb: 'ڕاستەی پلاستیکی شەفاف.', price: 2000, category: 'قرطاسية', subcategory: 'مساطر', stock: 100, isOffer: false, isSelected: false, images: [img('ruler')], options: [] },
  { name: 'ممحاة أنمي', nameCkb: 'سڕەوەی ئەنیمە', description: 'ممحاة ناعمة بتصميم شخصية.', descriptionCkb: 'سڕەوەی نەرم بە دیزاینی کارەکتەر.', price: 1500, category: 'قرطاسية', subcategory: 'ممحاة', stock: 120, isOffer: false, isSelected: false, images: [img('eraser')], options: [] },
  { name: 'دمية أنمي قطيفة', nameCkb: 'بووکەڵەی قەتیفەی ئەنیمە', description: 'دمية قطيفة ناعمة 25 سم.', descriptionCkb: 'بووکەڵەی قەتیفەی نەرم 25 سم.', price: 18000, category: 'مجسمات وهدايا', subcategory: 'دمى', stock: 25, isOffer: true, isSelected: true, images: [img('plush')], options: [{ name: 'الحجم', nameCkb: 'قەبارە', values: ['25 سم', '35 سم'], valuesCkb: [] }] },
  { name: 'جوارب أنمي قطنية', nameCkb: 'گۆرەوی لۆکەی ئەنیمە', description: 'زوج جوارب بتصميم أنمي.', descriptionCkb: 'جووتێک گۆرەوی بە دیزاینی ئەنیمە.', price: 4000, category: 'ملابس', subcategory: 'جوارب', stock: 90, isOffer: false, isSelected: false, images: [img('socks')], options: [{ name: 'المقاس', nameCkb: 'قەبارە', values: ['وسط', 'كبير'], valuesCkb: ['ناوەند', 'گەورە'] }] },
  { name: 'قفازات أنمي شتوية', nameCkb: 'دەستکێشی زستانەی ئەنیمە', description: 'قفازات صوف بتصميم أنمي.', descriptionCkb: 'دەستکێشی خوری بە دیزاینی ئەنیمە.', price: 8000, category: 'ملابس', subcategory: 'قفازات', stock: 35, isOffer: false, isSelected: false, images: [img('gloves')], options: [] },
  { name: 'وشاح أنمي', nameCkb: 'شاڵی ئەنیمە', description: 'وشاح شتوي طويل.', descriptionCkb: 'شاڵی زستانەی درێژ.', price: 12000, category: 'ملابس', subcategory: 'وشاح', stock: 30, isOffer: false, isSelected: false, images: [img('scarf')], options: [] },
  { name: 'غطاء عين للنوم أنمي', nameCkb: 'چاوبەندی خەوی ئەنیمە', description: 'غطاء عين ناعم للسفر والنوم.', descriptionCkb: 'چاوبەندی نەرم بۆ گەشت و خەو.', price: 5000, category: 'ملابس', subcategory: 'غطاء عين للنوم', stock: 70, isOffer: false, isSelected: false, images: [img('sleepmask')], options: [] },
  { name: 'بوستر أنمي كبير', nameCkb: 'پۆستەری گەورەی ئەنیمە', description: 'بوستر مقاس كبير بطباعة مطفية.', descriptionCkb: 'پۆستەری قەبارە گەورە بە چاپی مات.', price: 9000, category: 'منتجات أنمي متنوعة', subcategory: 'بوسترات', stock: 50, isOffer: false, isSelected: false, images: [img('poster2')], options: [] },
  { name: 'لوحة أنمي مؤطّرة', nameCkb: 'تابلۆی چوارچێوەداری ئەنیمە', description: 'لوحة خشبية مؤطّرة للجدار.', descriptionCkb: 'تابلۆی داری چوارچێوەدار بۆ دیوار.', price: 25000, category: 'منتجات أنمي متنوعة', subcategory: 'لوحات', stock: 20, isOffer: false, isSelected: false, images: [img('canvas')], options: [] },
  { name: 'ماوس باد أنمي', nameCkb: 'ماوس پادی ئەنیمە', description: 'ماوس باد بسطح ناعم وقاعدة مانعة للانزلاق.', descriptionCkb: 'ماوس پاد بە ڕووی نەرم و بنکەی دژە خلیسکان.', price: 7000, category: 'منتجات أنمي متنوعة', subcategory: 'ماوس باد', stock: 65, isOffer: true, isSelected: false, images: [img('mousepad')], options: [{ name: 'الحجم', nameCkb: 'قەبارە', values: ['وسط', 'كبير'], valuesCkb: ['ناوەند', 'گەورە'] }] },
  { name: 'غطاء وسادة أنمي', nameCkb: 'ڕووپۆشی سەرینی ئەنیمە', description: 'غطاء وسادة قطني بطبعة أنمي.', descriptionCkb: 'ڕووپۆشی سەرینی لۆکە بە چاپی ئەنیمە.', price: 10000, category: 'منتجات أنمي متنوعة', subcategory: 'أغطية وسائد', stock: 40, isOffer: false, isSelected: false, images: [img('pillow')], options: [] },
  { name: 'ساعة حائط أنمي', nameCkb: 'کاتژمێری دیواری ئەنیمە', description: 'ساعة حائط صامتة بتصميم أنمي.', descriptionCkb: 'کاتژمێری دیواری بێدەنگ بە دیزاینی ئەنیمە.', price: 20000, category: 'منتجات أنمي متنوعة', subcategory: 'ساعة حائط ومكتبية', stock: 22, isOffer: false, isSelected: false, images: [img('clock')], options: [] },
];


async function main() {
  // البذر يكتب بيانات تجريبية ويستطيع إنشاء مسؤول — تشغيله على الإنتاج
  // بالخطأ حادثةٌ لا تراجُع عنها، فيتطلّب طلباً صريحاً.
  // البذر يكتب بيانات تجريبية — يُرفض في الإنتاج **وفي الاختبار المسبق**،
  // لأن staging يحمل بيانات شبه حقيقية يفسدها البذر أيضاً.
  if ((config.isProduction || config.isStaging) && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error(
      `رفض البذر في ${config.appEnv}. اضبط ALLOW_PRODUCTION_SEED=true إن كنت متأكداً.`,
    );
  }

  const url = config.migrationDatabaseUrl || config.databaseUrl;
  console.log('Seeding database…');
  await runMigrations(url);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const categoryIds: Record<string, string> = {};
    for (const c of CATEGORIES) {
      const { rows } = await client.query(
        // الكردية تُملأ إن كانت فارغة فقط — ما كتبه المسؤول من اللوحة لا يُمسّ.
        `INSERT INTO categories (name, name_ckb, image_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE
           SET name_ckb = COALESCE(categories.name_ckb, EXCLUDED.name_ckb)
         RETURNING id`,
        [c.name, c.nameCkb, c.imageUrl],
      );
      categoryIds[c.name] = rows[0]!.id;
    }

    const subcategoryIds: Record<string, string> = {};
    for (const [categoryName, subs] of Object.entries(SUBCATEGORIES)) {
      for (const sub of subs) {
        const { rows } = await client.query(
          `INSERT INTO subcategories (category_id, name, name_ckb)
           VALUES ($1, $2, $3)
           ON CONFLICT (category_id, name) DO UPDATE
             SET name_ckb = COALESCE(subcategories.name_ckb, EXCLUDED.name_ckb)
           RETURNING id`,
          [categoryIds[categoryName], sub.name, sub.nameCkb],
        );
        subcategoryIds[`${categoryName}/${sub.name}`] = rows[0]!.id;
      }
    }

    for (const p of PRODUCTS) {
      const categoryId = categoryIds[p.category];
      const subcategoryId = subcategoryIds[`${p.category}/${p.subcategory}`];
      // [CRITICAL] `ON CONFLICT DO NOTHING` بلا قيدٍ فريد لا يفعل شيئاً.
      //
      // جدول `products` لا يحمل قيداً فريداً على الاسم (وهو صحيح: منتجان
      // قد يتشاركان اسماً في الإنتاج)، فالجملة كانت تُدرج صفّاً جديداً في
      // كل تشغيل. الأثر مقيس في قاعدة التطوير: أحد عشر صفّاً مكرّراً، أي
      // أن الزرع شُغّل مرّتين فتضاعف الكتالوج. الفحص الصريح قبل الإدراج
      // يجعل الزرع خاملاً حقاً بلا تغيير المخطّط ولا فرض قيدٍ على الإنتاج.
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM products
          WHERE name = $1 AND category_id = $2
            AND subcategory_id IS NOT DISTINCT FROM $3
          LIMIT 1`,
        [p.name, categoryId, subcategoryId ?? null],
      );
      if (existing.rows.length > 0) continue;
      const { rows } = await client.query(
        `INSERT INTO products (name, name_ckb, description, description_ckb, price, category_id, subcategory_id, stock, is_offer, is_selected, rating, review_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, 0)
         RETURNING id`,
        [p.name, p.nameCkb, p.description, p.descriptionCkb, p.price, categoryId, subcategoryId, p.stock, p.isOffer, p.isSelected],
      );
      const productId = rows[0]!.id;
      for (const [i, imageUrl] of p.images.entries()) {
        await client.query(
          'INSERT INTO product_images (product_id, url, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [productId, imageUrl, i],
        );
      }
      for (const option of p.options) {
        await client.query(
          'INSERT INTO product_options (product_id, name, name_ckb, values, values_ckb) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
          [productId, option.name, option.nameCkb, option.values, option.valuesCkb],
        );
      }
    }

    for (const g of GOVERNORATES) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO governorates (name, name_ckb, delivery_fee)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE
           SET delivery_fee = EXCLUDED.delivery_fee,
               name_ckb = COALESCE(governorates.name_ckb, EXCLUDED.name_ckb)
         RETURNING id`,
        [g.name, g.nameCkb, g.deliveryFee],
      );
      const governorateId = rows[0]!.id;

      for (const [index, zone] of (GOVERNORATE_ZONES[g.name] ?? []).entries()) {
        await client.query(
          `INSERT INTO governorate_zones (governorate_id, name, name_ckb, delivery_fee, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (governorate_id, name)
           DO UPDATE SET delivery_fee = EXCLUDED.delivery_fee,
                         name_ckb = COALESCE(governorate_zones.name_ckb, EXCLUDED.name_ckb)`,
          [governorateId, zone.name, zone.nameCkb, zone.deliveryFee, index],
        );
      }
    }

    await client.query(
      `INSERT INTO banners (image_url, destination_type, sort_order)
       VALUES ($1, 'category', 1), ($2, 'category', 2)
       ON CONFLICT DO NOTHING`,
      [img('banner1'), img('banner2')],
    );

    await seedAdminUser(client);

    await client.query('COMMIT');
    console.log(`Seeded: ${CATEGORIES.length} categories, ${PRODUCTS.length} products, ${GOVERNORATES.length} governorates.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await closePools();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});