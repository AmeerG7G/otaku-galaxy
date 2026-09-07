import '../../../../core/network/media_url.dart';

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
class Banner {
  const Banner({
    required this.id,
    this.imageUrl,
    this.title,
    this.subtitle = '',
    this.placement = 'promo',
    this.destination = BannerDestination.none,
    this.destinationValue,
  });

  final String id;
  final String? imageUrl;
  final String? title;
  final String subtitle;
  final String placement;
  final BannerDestination destination;

  /// معرّف الوجهة (منتج/قسم/أنمي) — يفسَّر حسب [destination].
  final String? destinationValue;

  /// هل للبنر وجهة قابلة للفتح؟
  bool get isTappable =>
      destination != BannerDestination.none &&
      (destinationValue?.trim().isNotEmpty ?? false);

  factory Banner.fromJson(Map<String, dynamic> json) {
    return Banner(
      id: json['id']?.toString() ?? '',
      imageUrl: resolveMediaUrl(json['imageUrl'] as String?),
      title: json['title'] as String?,
      subtitle: json['subtitle']?.toString() ?? '',
      placement: json['placement']?.toString() ?? 'promo',
      destination: _destinationFrom(json['destinationType'] as String?),
      destinationValue: json['destinationValue'] as String?,
    );
  }
}
