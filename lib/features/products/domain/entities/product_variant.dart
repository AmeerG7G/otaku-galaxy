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

/// ما تمثّله خيارات المنتج (090، STEP 77): لون أو تصميم أو مقاس.
///
/// نظام الخيارات نفسه (صورةٌ ومخزونٌ لكل خيار) — النوع يسمّي المحدّد للزبون
/// وحده، فلا يُقال «اللون» لحقيبةٍ بتصميمين. الغائب أو المجهول (خادمٌ أقدم)
/// لون، كما كان كل منتجٍ بخيارات قبل هذا الحقل.
enum VariantKind {
  color('productColor', 'chooseColorFirst', 'colorValue'),
  design('productDesign', 'chooseDesignFirst', 'designValue'),
  size('productSize', 'chooseSizeFirst', 'sizeValue');

  const VariantKind(this.headingKey, this.chooseFirstKey, this.lineValueKey);

  /// عنوان المحدّد في صفحة المنتج.
  final String headingKey;

  /// نصّ زرّ الإضافة قبل اختيار خيار.
  final String chooseFirstKey;

  /// «النوع: الاسم» في سطر السلة والطلب — معاملُه `{color}`.
  final String lineValueKey;

  static VariantKind parse(Object? value) => switch (value) {
    'design' => VariantKind.design,
    'size' => VariantKind.size,
    _ => VariantKind.color,
  };
}
