import '../../../products/domain/entities/product.dart';

class CartItem {
  const CartItem({
    required this.product,
    this.quantity = 1,
    this.selectedOption,
    this.lineId,
    this.serverLineTotal,
  });

  final Product product;
  final int quantity;
  final String? selectedOption;

  /// معرّف سطر العربة لدى الخادم (لتحديث الكمية/الحذف).
  final String? lineId;

  /// مبلغ السطر كما حسبه الخادم (`lineTotal`) — بعد عرض «قطعتان بسعر» (085)
  /// على أسطر المنتج كلها، فقد يقلّ عن السعر × الكمية. `null` = سطرٌ لم يصل من
  /// الخادم (اختبارات، أو ردٌّ أقدم) فيُحسب كما كان.
  final double? serverLineTotal;

  /// [CRITICAL] لا يُعاد حساب العرض هنا: قطعتان بخيارين من المنتج نفسه عرضٌ
  /// واحد يعرفه الخادم وحده، والسطر يعرض ما سيُحفظ في الطلب.
  double get lineTotal => serverLineTotal ?? product.price * quantity;

  // [REMOVED] `CartItem.fromJson` — لم يكن يُستدعى قط، وكان يقرأ
  // `json['product']` بينما الخادم يعيد سطر سلة مسطّحاً بلا هذا المفتاح
  // إطلاقاً. أي استعمال له كان سيرمي وقت التشغيل. التحويل الحقيقي والوحيد
  // هو `CartRepositoryImpl._mapLine`، وهو يقرأ الشكل الذي يرسله الخادم فعلاً.

  CartItem copyWith({int? quantity, String? selectedOption, String? lineId}) {
    return CartItem(
      product: product,
      quantity: quantity ?? this.quantity,
      selectedOption: selectedOption ?? this.selectedOption,
      lineId: lineId ?? this.lineId,
      // مبلغ الخادم يخصّ كميته — كميةٌ أخرى تنتظر ردّه لا تحمل مبلغاً قديماً.
      serverLineTotal:
          quantity == null || quantity == this.quantity ? serverLineTotal : null,
    );
  }
}