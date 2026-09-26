/// خيارات ترتيب قوائم المنتجات.
///
/// [apiValue] يطابق القائمة المغلقة التي يقبلها الخادم؛ أي قيمة أخرى
/// يرفضها التحقق هناك بـ400، فلا يوجد ترتيب «واجهي» بلا أثر حقيقي.
enum ProductSort {
  newest('newest', 'sortNewest'),
  priceAsc('price_asc', 'sortPriceAsc'),
  priceDesc('price_desc', 'sortPriceDesc'),
  rating('rating', 'sortRating');

  const ProductSort(this.apiValue, this.labelKey);

  final String apiValue;
  /// مفتاح `AppStrings` لا نصّ معروض — التعداد ثابتٌ لا يملك سياقاً،
  /// فيُصرَّف عند العرض في مُنتقي الترتيب.
  final String labelKey;
}
