/// خيارات ترتيب قوائم المنتجات.
///
/// [apiValue] يطابق القائمة المغلقة التي يقبلها الخادم؛ أي قيمة أخرى
/// يرفضها التحقق هناك بـ400، فلا يوجد ترتيب «واجهي» بلا أثر حقيقي.
enum ProductSort {
  newest('newest', 'الأحدث'),
  priceAsc('price_asc', 'السعر: من الأقل'),
  priceDesc('price_desc', 'السعر: من الأعلى'),
  rating('rating', 'الأعلى تقييماً');

  const ProductSort(this.apiValue, this.label);

  final String apiValue;
  final String label;
}
