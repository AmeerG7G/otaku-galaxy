import '../../../../core/l10n/bilingual_text.dart';
import '../../../../core/network/media_url.dart';
import '../../../settings/presentation/cubit/locale_cubit.dart';
import 'product_variant.dart';

export 'product_variant.dart';

/// حالة توفّر المنتج كما يراها الزبون.
///
/// [CRITICAL] المخزون هو مصدر الحقيقة، لا التاريخ. `restockAt` **موعد
/// متوقَّع** لا وعدٌ ولا مؤقّت: إن وصلت بضاعة قبله صار المنتج متوفراً فوراً
/// وسقط الموعد من العرض، وإن مضى الموعد ولم تصل بضاعة بقي المنتج غير متوفر.
/// لذلك يُقرأ `stock` أولاً دائماً، ولا يُستشار التاريخ إلا حين يكون
/// المخزون صفراً.
enum ProductAvailability {
  /// مخزون موجب — يُضاف إلى السلة.
  available,

  /// مخزون صفر **مع** موعد متوقَّع — «قريباً يتوفر».
  comingSoon,

  /// مخزون صفر بلا موعد — «غير متوفر».
  unavailable,

  /// «قريباً — السعر يُعلن لاحقاً» (084): يُعرض ولا يُشترى مهما كان المخزون.
  /// لا حالة مخزون ولا «أخبرني عند توفره» — كما في المتجر على الويب.
  priceComingSoon;

  bool get canAddToCart => this == ProductAvailability.available;

  /// هل يُعرض إجراء «أخبرني عند توفره»؟ في الحالتين غير المتوفرتين.
  bool get showsRestockAction =>
      this == ProductAvailability.comingSoon ||
      this == ProductAvailability.unavailable;
}

class Product {
  const Product({
    required this.id,
    required this.nameAr,
    this.nameCkb,
    required this.price,
    this.priceAnnounced = true,
    this.descriptionAr = '',
    this.descriptionCkb,
    required this.images,
    this.categoryId,
    this.categoryName,
    this.subcategoryId,
    this.subcategory,
    this.rating,
    this.reviewCount,
    this.options,
    this.stock = 0,
    this.inFavorites = false,
    this.isOffer = false,
    this.isSelected = false,
    this.previousPrice,
    this.discountPercent,
    this.hasDeliveryPromo = false,
    this.deliveryPromoAmount = 0,
    this.franchiseIds = const [],
    this.restockAt,
    this.pairPrice,
    this.variants = const [],
    this.variantKind = VariantKind.color,
  });

  final String id;

  // ═══ المحتوى بلغتين (هجرة ٠٦٦) ═══
  //
  // [CRITICAL] لا `name` ولا `description` واحداً: الخادم يرسل الأربعة
  // صريحة، والتطبيق يختار بلغة واجهته **الآن** ([localizedProductName]) —
  // فالمنتج المحفوظ في السلة أو المفضلة أو قائمةٍ مفتوحة يتبدّل مع تبديل
  // اللغة بلا جلبٍ ثانٍ، ويُعرف نقص كرديته بدل أن يُعرض العربي على أنه كردي.

  /// اسم المنتج بالعربية — حاضرٌ دائماً.
  final String nameAr;

  /// اسم المنتج بالكردية؛ `null` = ناقص (منتج قديم). لا فراغ أبداً.
  final String? nameCkb;

  /// وصف المنتج بالعربية — قد يكون فارغاً لمنتجٍ قديم أو لسطر سلة/طلب.
  final String descriptionAr;

  /// وصف المنتج بالكردية؛ `null` = ناقص.
  final String? descriptionCkb;

  /// [price] صالحٌ للعرض والشراء؟ `false` = «السعر يُعلن لاحقاً» (084).
  ///
  /// [CRITICAL] حين يكون `false` فـ[price] صفرٌ نائب لا سعر: لا يُعرض ولا
  /// يُحسب به. الخادم يرفض إضافته إلى السلة (`PRODUCT_NOT_PRICED`)، والتطبيق
  /// لا يعرض زرّ الإضافة أصلاً ([availability]). التطبيق يطلب هذه المنتجات
  /// صراحةً (`X-OG-Unpriced: 1`)؛ النسخ الأقدم لا تطلبها فلا تصلها.
  final bool priceAnnounced;

  final double price;
  final List<String> images;
  final String? categoryId;
  final String? categoryName;

  /// معرّف القسم الفرعي (يُصدّره الخادم في قوائم المنتجات).
  final String? subcategoryId;

  /// اسم القسم الفرعي الذي ينتمي إليه المنتج (تيشيرتات، هوديات، ...).
  final String? subcategory;
  final double? rating;
  final int? reviewCount;
  final List<ProductOption>? options;

  /// الكمية المتبقية في المخزون.
  final int stock;
  final bool inFavorites;

  /// شارة «عرض» — يرسلها الخادم في الكتالوج.
  final bool isOffer;

  /// شارة «مختار» — يرسلها الخادم في الكتالوج.
  final bool isSelected;

  /// السعر قبل الخصم — يرسله الخادم فقط عند وجود خصم حقيقي، وإلا `null`.
  final double? previousPrice;

  /// نسبة الخصم يحسبها الخادم من السعرين؛ `null` يعني لا خصم.
  final int? discountPercent;

  /// ترويج توصيل يضبطه المسؤول على المنتج.
  final bool hasDeliveryPromo;

  /// قيمة خصم التوصيل عن كل قطعة — القيمة المعتمدة، والخادم هو من يطبّقها.
  final double deliveryPromoAmount;

  /// سعر قطعتين من المنتج نفسه (085)؛ `null` = لا عرض. الخادم وحده يحسب به —
  /// التطبيق يعرض `lineTotal` كما وصل، ويُرسل هذه القيمة في `expectedPrices`
  /// ليُرفض الطلب إن تغيّر العرض بعد المراجعة.
  final double? pairPrice;

  /// الأنمي/الامتيازات المرتبطة بالمنتج.
  final List<String> franchiseIds;

  /// ألوان المنتج (STEP 74) بترتيب `sortOrder`، الفعّالة وغير الفعّالة كما
  /// أرسلها الخادم. `[]` = منتجٌ قديم بلا ألوان.
  final List<ProductVariant> variants;

  /// ما تمثّله [variants] للزبون (090) — يسمّي المحدّد لا غير.
  final VariantKind variantKind;

  /// صورة المنتج في البطاقات والقوائم: أولى صوره العامة كما كانت، وإن لم
  /// تكن له صورٌ عامة فصورة أول لونٍ فعّال (STEP 74) — فلا يُضطرّ المسؤول إلى
  /// رفع صورة اللون مرّةً ثانية صورةً عامة كي لا تظهر البطاقة فارغة.
  String? get coverImage {
    for (final url in images) {
      if (url.trim().isNotEmpty) return url;
    }
    for (final colour in activeVariants) {
      final url = colour.imageUrl;
      if (url != null && url.trim().isNotEmpty) return url;
    }
    return null;
  }

  /// هل هذا منتجٌ بألوان؟ — يكفي لونٌ واحد ولو غير فعّال (قاعدة العقد).
  bool get hasVariants => variants.isNotEmpty;

  /// الألوان التي يراها الزبون: الفعّالة وحدها، بترتيبها.
  List<ProductVariant> get activeVariants {
    final active = [for (final v in variants) if (v.isActive) v];
    active.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return active;
  }

  /// اللون [id] إن كان فعّالاً، وإلا `null`.
  ProductVariant? activeVariantById(String? id) {
    if (id == null) return null;
    for (final v in variants) {
      if (v.id == id && v.isActive) return v;
    }
    return null;
  }

  /// الموعد المتوقَّع لعودة التوفر — يضبطه المسؤول، و`null` يعني «بلا موعد».
  ///
  /// إرشاديٌّ محض: لا يُغيّر المخزون ولا يفتح الشراء ولا يُشغّل إشعاراً.
  /// الإشعار يقع حين يصير المخزون موجباً فعلاً (`restockService`).
  final DateTime? restockAt;

  /// الاسم بلغتيه — ما تختار منه [localizedProductName].
  BilingualText get names => BilingualText(ar: nameAr, ckb: nameCkb);

  /// الوصف بلغتيه — ما تختار منه [localizedProductDescription].
  BilingualText get descriptions =>
      BilingualText(ar: descriptionAr, ckb: descriptionCkb);

  /// هل ينقص المنتجَ اسمٌ أو وصفٌ كردي؟ — نفس حكم الخادم (`kurdishMissing`).
  bool get kurdishMissing => nameCkb == null || descriptionCkb == null;

  /// هل يملك المنتج خصماً حقيقياً مدعوماً ببيانات الخادم؟
  bool get hasDiscount =>
      previousPrice != null &&
      discountPercent != null &&
      previousPrice! > price;

  double get discountedPrice => price;

  /// منتجٌ بألوانٍ كلّها غير فعّالة غير متوفر مهما قال المخزون (العقد §2).
  bool get inStock =>
      stock > 0 && (variants.isEmpty || activeVariants.isNotEmpty);

  /// الكمية المخفية عن الزبون؛ لا تظهر إلا عند انخفاض المخزون إلى 3 قطع أو أقل.
  bool get lowStock => inStock && stock <= 3;

  /// [CRITICAL] الحساب **الوحيد** لحالة التوفر في التطبيق.
  ///
  /// كل شاشة تقرأ هذا ولا تعيد اشتقاقه من `stock` و`restockAt` بنفسها:
  /// شرطان متطابقان مكتوبان في عشر شاشات يتباعدان أول مرة يُعدَّل أحدها،
  /// فتقول البطاقة «قريباً» وتقول التفاصيل «غير متوفر» عن المنتج نفسه.
  ProductAvailability get availability {
    // بلا سعرٍ معلن لا يُشترى ولو وُجد المخزون — يسبق كل شيء.
    if (!priceAnnounced) return ProductAvailability.priceComingSoon;
    if (inStock) return ProductAvailability.available;
    return restockAt == null
        ? ProductAvailability.unavailable
        : ProductAvailability.comingSoon;
  }

  /// الموعد المعروض للزبون — `null` ما دام المنتج متوفراً.
  ///
  /// [CRITICAL] المتوفر لا يحمل موعداً حتى لو بقيت القيمة في القاعدة: عرضُ
  /// «متوقع التوفر ١٥/١٠» على منتجٍ يمكن شراؤه الآن تناقضٌ صريح. المسؤول قد
  /// يستلم البضاعة قبل موعده ولا يمسح التاريخ، وهذه الحالة هي القاعدة لا
  /// الاستثناء.
  ///
  /// والمنتج الذي لم يُعلن سعره يُعرض موعده المتوقَّع ما دام قادماً: لا يُشترى
  /// الآن، فالموعد معلومةٌ للزبون لا تناقض. الموعد الذي مضى لا يُعرض عليه.
  DateTime? get displayRestockAt => switch (availability) {
    ProductAvailability.comingSoon => restockAt,
    ProductAvailability.priceComingSoon
        when restockAt != null && restockAt!.isAfter(DateTime.now()) =>
      restockAt,
    _ => null,
  };

  factory Product.fromJson(Map<String, dynamic> json) {
    // الحقول الصريحة أولاً؛ `name`/`description` (المحسومان بلغة الطلب) لا
    // يُقرآن إلا من ردٍّ أقدم لا يحمل غيرهما — انظر [BilingualText.fromJson].
    final names = BilingualText.fromJson(
      json,
      arKey: 'nameAr',
      ckbKey: 'nameCkb',
      legacyKey: 'name',
    );
    final descriptions = BilingualText.fromJson(
      json,
      arKey: 'descriptionAr',
      ckbKey: 'descriptionCkb',
      legacyKey: 'description',
    );
    return Product(
      id: json['id']?.toString() ?? '',
      nameAr: names.ar,
      nameCkb: names.ckb,
      // `null` = لم يُعلن بعد (084). الصفر النائب لا يُعرض — انظر [priceAnnounced].
      price: (json['price'] as num?)?.toDouble() ?? 0,
      priceAnnounced: !json.containsKey('price') || json['price'] != null,
      descriptionAr: descriptions.ar,
      descriptionCkb: descriptions.ckb,
      images: resolveMediaUrls(json['images'] as List?),
      categoryId: json['categoryId']?.toString(),
      categoryName: json['categoryName'] as String?,
      subcategoryId: json['subcategoryId']?.toString(),
      subcategory: json['subcategory'] as String?,
      rating: (json['rating'] as num?)?.toDouble(),
      reviewCount: json['reviewCount'] as int?,
      options: (json['options'] as List?)
          ?.map((e) => ProductOption.fromJson(e as Map<String, dynamic>))
          .toList(),
      stock: json['stock'] as int? ?? 0,
      inFavorites: json['inFavorites'] as bool? ?? false,
      isOffer: json['isOffer'] as bool? ?? false,
      isSelected: json['isSelected'] as bool? ?? false,
      previousPrice: (json['previousPrice'] as num?)?.toDouble(),
      discountPercent: (json['discountPercent'] as num?)?.toInt(),
      hasDeliveryPromo: json['hasDeliveryPromo'] as bool? ?? false,
      deliveryPromoAmount:
          (json['deliveryPromoAmount'] as num?)?.toDouble() ?? 0,
      franchiseIds:
          (json['franchiseIds'] as List?)?.map((e) => e.toString()).toList() ??
          const [],
      // الخادم يرسله ISO-8601 أو `null`. نصٌّ معطوب يُقرأ `null` لا يرمي:
      // موعدٌ إرشادي لا يستحق إسقاط صفحة المنتج.
      restockAt: DateTime.tryParse(json['restockAt']?.toString() ?? '')?.toLocal(),
      pairPrice: (json['pairPrice'] as num?)?.toDouble(),
      // غيابُ الحقل (خادمٌ أقدم) أو `[]` = منتجٌ قديم.
      variants:
          (json['variants'] as List?)
              ?.whereType<Map<String, dynamic>>()
              .map(ProductVariant.fromJson)
              .toList() ??
          const [],
      variantKind: VariantKind.parse(json['variantKind']),
    );
  }

  Product copyWith({bool? inFavorites}) {
    return Product(
      id: id,
      nameAr: nameAr,
      nameCkb: nameCkb,
      price: price,
      priceAnnounced: priceAnnounced,
      descriptionAr: descriptionAr,
      descriptionCkb: descriptionCkb,
      images: images,
      categoryId: categoryId,
      categoryName: categoryName,
      subcategoryId: subcategoryId,
      subcategory: subcategory,
      rating: rating,
      reviewCount: reviewCount,
      options: options,
      stock: stock,
      inFavorites: inFavorites ?? this.inFavorites,
      isOffer: isOffer,
      isSelected: isSelected,
      previousPrice: previousPrice,
      discountPercent: discountPercent,
      hasDeliveryPromo: hasDeliveryPromo,
      deliveryPromoAmount: deliveryPromoAmount,
      restockAt: restockAt,
      franchiseIds: franchiseIds,
      pairPrice: pairPrice,
      variants: variants,
      variantKind: variantKind,
    );
  }
}

/// [CRITICAL] اسم المنتج بلغة الواجهة — **الآلية الوحيدة** لتسمية منتج.
///
/// كل شاشة (البطاقة، التفاصيل، البحث، السلة، المفضلة، الطلبات، التقييم)
/// تمرّ من هنا بلغة `context.language` — لغة التطبيق المختارة لا لغة الجهاز.
/// الكردية الناقصة تسقط إلى العربية، ويُعرف ذلك بـ[BilingualText.isFallbackIn].
String localizedProductName(Product product, AppLanguage language) =>
    product.names.of(language);

/// وصف المنتج بلغة الواجهة — نظير [localizedProductName].
String localizedProductDescription(Product product, AppLanguage language) =>
    product.descriptions.of(language);

class ProductOption {
  const ProductOption({required this.name, required this.values});

  final String name;
  final List<String> values;

  factory ProductOption.fromJson(Map<String, dynamic> json) {
    return ProductOption(
      name: json['name'] as String? ?? '',
      values:
          (json['values'] as List?)?.map((e) => e.toString()).toList() ??
          const [],
    );
  }
}
