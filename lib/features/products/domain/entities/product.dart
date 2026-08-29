import '../../../../core/network/media_url.dart';

class Product {
  const Product({
    required this.id,
    required this.name,
    required this.price,
    required this.description,
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
  });

  final String id;
  final String name;
  final double price;
  final String description;
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

  /// الأنمي/الامتيازات المرتبطة بالمنتج.
  final List<String> franchiseIds;

  /// هل يملك المنتج خصماً حقيقياً مدعوماً ببيانات الخادم؟
  bool get hasDiscount =>
      previousPrice != null &&
      discountPercent != null &&
      previousPrice! > price;

  double get discountedPrice => price;

  bool get inStock => stock > 0;

  /// الكمية المخفية عن الزبون؛ لا تظهر إلا عند انخفاض المخزون إلى 3 قطع أو أقل.
  bool get lowStock => inStock && stock <= 3;

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id']?.toString() ?? '',
      name: json['name'] as String? ?? '',
      price: (json['price'] as num?)?.toDouble() ?? 0,
      description: json['description'] as String? ?? '',
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
    );
  }

  Product copyWith({bool? inFavorites}) {
    return Product(
      id: id,
      name: name,
      price: price,
      description: description,
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
      franchiseIds: franchiseIds,
    );
  }
}

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
