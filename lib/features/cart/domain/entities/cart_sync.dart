import 'cart_item.dart';

/// سبب تعديل الخادم لسطرٍ أثناء مزامنة العربة (CA-14).
enum CartAdjustmentReason {
  /// المنتج معطَّل أو نفد مخزونه — أُزيل السطر.
  unavailable,

  /// الكمية تجاوزت المخزون فخُفِّضت إليه.
  reduced,
}

/// تعديلٌ أجراه الخادم على سطرٍ في العربة — كما يصل في `adjustments`.
class CartAdjustment {
  const CartAdjustment({
    required this.lineId,
    required this.productId,
    required this.reason,
    required this.previousQuantity,
    required this.quantity,
  });

  factory CartAdjustment.fromJson(Map<String, dynamic> json) => CartAdjustment(
    lineId: json['lineId']?.toString() ?? '',
    productId: json['productId']?.toString() ?? '',
    reason: json['reason'] == 'reduced'
        ? CartAdjustmentReason.reduced
        : CartAdjustmentReason.unavailable,
    previousQuantity: (json['previousQuantity'] as num?)?.toInt() ?? 0,
    quantity: (json['quantity'] as num?)?.toInt() ?? 0,
  );

  final String lineId;
  final String productId;
  final CartAdjustmentReason reason;
  final int previousQuantity;

  /// الكمية بعد المزامنة؛ صفرٌ يعني أن السطر أُزيل.
  final int quantity;
}

/// العربة كما هي على الخادم الآن، وما عدّله الخادم فيها لتبقى صالحة.
class CartSnapshot {
  const CartSnapshot({required this.items, this.adjustments = const []});

  final List<CartItem> items;
  final List<CartAdjustment> adjustments;
}

/// ما يُبلَّغ به الزبون بعد مزامنةٍ واحدة — رسالةٌ واحدة مجمَّعة لا رسالة لكل
/// منتج.
///
/// تغيّرُ السعر يُستنتج هنا بمقارنة ما عرضه التطبيق بما أعاده الخادم: السعر لا
/// يُخزَّن في العربة على الخادم، فلا يعرف الخادم ما رآه الزبون. أمّا الإزالة
/// وخفض الكمية فيُبلِغ بهما الخادم نفسه (`adjustments`) لأنه هو من أجراهما —
/// المقارنة وحدها لا تميّز سطراً أزاله الخادم من سطرٍ أزاله الزبون من جهازٍ آخر.
class CartSyncNotice {
  const CartSyncNotice({
    this.priceChanged = false,
    this.quantityReduced = false,
    this.itemRemoved = false,
  });

  /// [before] ما كان معروضاً قبل المزامنة؛ [after] ما أعاده الخادم.
  factory CartSyncNotice.between({
    required List<CartItem> before,
    required CartSnapshot after,
  }) {
    final shown = <String, CartItem>{
      for (final item in before)
        if (item.lineId != null) item.lineId!: item,
    };
    return CartSyncNotice(
      priceChanged: after.items.any((item) {
        final previous = shown[item.lineId];
        return previous != null && previous.product.price != item.product.price;
      }),
      quantityReduced: after.adjustments.any(
        (a) => a.reason == CartAdjustmentReason.reduced,
      ),
      itemRemoved: after.adjustments.any(
        (a) => a.reason == CartAdjustmentReason.unavailable,
      ),
    );
  }

  final bool priceChanged;
  final bool quantityReduced;
  final bool itemRemoved;

  bool get hasChanges => priceChanged || quantityReduced || itemRemoved;

  /// مفاتيح `AppStrings` للرسالة، بترتيبٍ ثابت: الإزالة، ثم الكمية، ثم السعر.
  List<String> get messageKeys => [
    if (itemRemoved) 'cartSyncItemRemoved',
    if (quantityReduced) 'cartSyncQuantityReduced',
    if (priceChanged) 'cartSyncPriceChanged',
  ];
}
