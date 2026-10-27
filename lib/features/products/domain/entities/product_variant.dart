import '../../../../core/l10n/bilingual_text.dart';
import '../../../../core/network/media_url.dart';
import '../../../settings/presentation/cubit/locale_cubit.dart';

/// لون واحد من ألوان المنتج (STEP 74، هجرة ٠٨٧) — بصورته ومخزونه.
///
/// [CRITICAL] الهوية هي [id] لا ترتيب اللون في القائمة: يُرسَل `variantId`
/// إلى السلة، والخادم يحسب مخزون كل لون على حدة. المنتج بلا ألوان (`[]`)
/// منتجٌ قديم يعمل كما كان تماماً.
class ProductVariant {
  const ProductVariant({
    required this.id,
    required this.names,
    this.colorHex,
    this.imageUrl,
    this.stock = 0,
    this.isActive = true,
    this.sortOrder = 0,
  });

  factory ProductVariant.fromJson(Map<String, dynamic> json) {
    // الاسمان صريحان كاسم المنتج؛ `colorName` (المحسوم بلغة الطلب) لا يُقرأ
    // إلا من ردٍّ لا يحمل غيره.
    final names = BilingualText.fromJson(
      json,
      arKey: 'colorNameAr',
      ckbKey: 'colorNameCkb',
      legacyKey: 'colorName',
    );
    final image = resolveMediaUrl(json['imageUrl'] as String?);
    final hex = json['colorHex']?.toString().trim();
    return ProductVariant(
      id: json['id']?.toString() ?? '',
      names: names,
      colorHex: hex == null || hex.isEmpty ? null : hex,
      imageUrl: image == null || image.isEmpty ? null : image,
      stock: (json['stock'] as num?)?.toInt() ?? 0,
      isActive: json['isActive'] as bool? ?? true,
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
    );
  }

  final String id;

  /// اسم اللون بلغتيه — الكردية الناقصة تسقط إلى العربية ([BilingualText]).
  final BilingualText names;

  /// `#RRGGBB` أو `null` — بلا لونٍ معلن تُعرض صورة اللون مصغّرةً بدلاً منه.
  final String? colorHex;

  /// صورة هذا اللون (مسارٌ محلول) — تحلّ محلّ صورة المنتج حين يُختار.
  final String? imageUrl;

  /// مخزون هذا اللون وحده.
  final int stock;

  /// غير الفعّال لا يُباع ولا يُعرض للزبون.
  final bool isActive;

  final int sortOrder;

  /// لونٌ نفد مخزونه يُعرض معطَّلاً ولا يُختار.
  bool get inStock => stock > 0;

  String nameIn(AppLanguage language) => names.of(language);
}
