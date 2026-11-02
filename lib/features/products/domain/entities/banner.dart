import '../../../../core/l10n/bilingual_text.dart';
import '../../../../core/network/media_url.dart';
import '../../../settings/presentation/cubit/locale_cubit.dart';

/// وجهة البنر عند الضغط — تطابق `destination_type` في القاعدة.
enum BannerDestination { product, category, subcategory, anime, none }

BannerDestination _destinationFrom(String? raw) {
  switch (raw) {
    case 'product':
      return BannerDestination.product;
    case 'category':
      return BannerDestination.category;
    case 'subcategory':
      return BannerDestination.subcategory;
    case 'anime':
      return BannerDestination.anime;
    default:
      return BannerDestination.none;
  }
}

/// بنر يديره المسؤول من لوحة التحكم.
///
/// الموضع (`placement`) يقرّره المسؤول لا التطبيق: `hero` اللوحة الكبيرة
/// أعلى الرئيسية، و`promo` الشريط الأفقي تحتها. الوجهة كذلك بيانات لا كود —
/// لا مسار تنقّل مخبوز في الواجهة.
///
/// النصّ بلغتين (هجرة ٠٦٧): عنوانٌ وسطرٌ ثانٍ بالعربية، ومثلهما بالكردية —
/// يكتبها المسؤول مستقلةً، وكلٌّ اختياري. لا `title` واحداً: الشاشة تقرأ
/// [titleIn]/[subtitleIn] بلغة واجهتها **الآن**، فيتبدّل النصّ مع تبديل اللغة
/// بلا جلبٍ ثانٍ.
class Banner {
  const Banner({
    required this.id,
    this.imageUrl,
    this.titleAr,
    this.subtitleAr,
    this.titleCkb,
    this.subtitleCkb,
    this.placement = 'promo',
    this.destination = BannerDestination.none,
    this.destinationValue,
  });

  final String id;
  final String? imageUrl;

  /// العنوان بالعربية؛ `null` = لا عنوان عربي.
  final String? titleAr;

  /// السطر الثاني بالعربية؛ `null` = لا سطر عربي.
  final String? subtitleAr;

  /// العنوان بالكردية (سوراني)؛ `null` = ناقص.
  final String? titleCkb;

  /// السطر الثاني بالكردية (سوراني)؛ `null` = ناقص.
  final String? subtitleCkb;

  final String placement;
  final BannerDestination destination;

  /// معرّف الوجهة (منتج/قسم/أنمي) — يفسَّر حسب [destination].
  final String? destinationValue;

  /// العنوان بلغة الواجهة — لغتها إن حضرت وإلا الأخرى، أو `null` بلا نصّ.
  String? titleIn(AppLanguage language) =>
      pickEitherLanguage(ar: titleAr, ckb: titleCkb, language: language);

  /// السطر الثاني بلغة الواجهة — القاعدة نفسها ([pickEitherLanguage]).
  String? subtitleIn(AppLanguage language) =>
      pickEitherLanguage(ar: subtitleAr, ckb: subtitleCkb, language: language);

  /// هل للبنر وجهة قابلة للفتح؟
  bool get isTappable =>
      destination != BannerDestination.none &&
      (destinationValue?.trim().isNotEmpty ?? false);

  factory Banner.fromJson(Map<String, dynamic> json) {
    return Banner(
      id: json['id']?.toString() ?? '',
      imageUrl: resolveMediaUrl(json['imageUrl'] as String?),
      titleAr: _explicitOrLegacy(json, 'titleAr', legacyKey: 'title'),
      subtitleAr: _explicitOrLegacy(json, 'subtitleAr', legacyKey: 'subtitle'),
      titleCkb: _text(json['titleCkb']),
      subtitleCkb: _text(json['subtitleCkb']),
      placement: json['placement']?.toString() ?? 'promo',
      destination: _destinationFrom(json['destinationType'] as String?),
      destinationValue: json['destinationValue'] as String?,
    );
  }
}

/// الحقل الصريح، أو — لردٍّ أقدم من ٠٦٧ لا يحمله — الحقل القديم.
///
/// [CRITICAL] القديم يُقرأ فقط حين **يغيب المفتاح الصريح** لا حين يكون
/// `null`: الخادم الجديد يرسل `titleAr: null` لبنرٍ بلا عنوان عربي، و`title`
/// محسوماً بلغة الطلب — أي الكردي احتياطاً. قراءته عندئذٍ كانت ستضع نصاً
/// كردياً في خانة العربية. والردّ الأقدم كان `title` فيه العمودَ العربي دائماً.
String? _explicitOrLegacy(
  Map<String, dynamic> json,
  String key, {
  required String legacyKey,
}) => json.containsKey(key) ? _text(json[key]) : _text(json[legacyKey]);

/// نصٌّ حاضر أو `null` — الفراغ والمسافات غياب (كـ`textOrNull` في الخادم).
String? _text(Object? raw) {
  final text = raw?.toString();
  return text == null || text.trim().isEmpty ? null : text;
}
