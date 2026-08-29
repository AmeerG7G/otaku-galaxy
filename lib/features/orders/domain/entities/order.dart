import '../../../../core/network/media_url.dart';
import '../../../cart/domain/entities/cart_item.dart';
import '../../../products/domain/entities/product.dart';

enum OrderStatus {
  pending,
  waitingAdmin,
  confirmed,
  processing,
  delivering,
  completed,
  rejected;

  static OrderStatus fromString(String value) {
    switch (value) {
      case 'PENDING_ADMIN_CONFIRMATION':
        return OrderStatus.waitingAdmin;
      case 'CONFIRMED':
        return OrderStatus.confirmed;
      case 'PREPARING':
        return OrderStatus.processing;
      case 'OUT_FOR_DELIVERY':
        return OrderStatus.delivering;
      case 'COMPLETED':
        return OrderStatus.completed;
      case 'REJECTED':
        return OrderStatus.rejected;
      default:
        return OrderStatus.pending;
    }
  }
}

class Order {
  const Order({
    required this.id,
    required this.number,
    required this.province,
    required this.deliveryCost,
    required this.fullAddress,
    required this.phone,
    required this.total,
    required this.status,
    this.productsTotal = 0,
    this.discount = 0,
    this.deliveryDiscount = 0,
    this.items = const [],
    this.createdAt,
    this.rejectionReason,
    this.zoneName,
    this.deliveryNote,
    this.deliveredAt,
    this.ratingAvailableAt,
    this.ratingAvailable = false,
    this.statusHistory = const [],
  });

  final String id;
  final String number;
  final String province;
  final double deliveryCost;
  final String fullAddress;
  final String phone;
  final double total;

  /// إجمالي سعر المنتجات قبل التوصيل (من الخادم).
  final double productsTotal;

  /// الخصم المطبق (من الخادم).
  final double discount;

  /// خصم التوصيل المطبَّق وقت الطلب — لقطة تاريخية من الخادم.
  final double deliveryDiscount;

  /// رسوم التوصيل بعد الخصم — ما يدفعه العميل فعلاً مقابل التوصيل.
  double get payableDelivery =>
      (deliveryCost - deliveryDiscount).clamp(0, double.infinity);

  /// توصيل مجاني: الخصم غطّى الرسوم بالكامل (ورسوم أصلية أكبر من صفر).
  bool get isFreeDelivery => deliveryCost > 0 && payableDelivery == 0;
  final OrderStatus status;
  final List<CartItem> items;
  final DateTime? createdAt;

  /// سبب الرفض من الإدارة — غير فارغ فقط عندما تكون الحالة [OrderStatus.rejected].
  final String? rejectionReason;

  /// منطقة التوصيل داخل المحافظة وقت الطلب (النجف)؛ null لغيرها.
  final String? zoneName;

  /// وقت الوصول المتوقع الذي أدخلته الإدارة (مثل: سيصل غداً).
  final String? deliveryNote;

  /// لحظة تأكيد الاستلام كما سجّلها الخادم؛ null قبل الاستلام.
  final DateTime? deliveredAt;

  /// لحظة فتح التقييم (الاستلام + المهلة)؛ null قبل الاستلام.
  final DateTime? ratingAvailableAt;

  /// هل التقييم مسموح الآن؟ يقرّره الخادم — التطبيق يعرض ولا يحسب.
  ///
  /// لا نشتقّها من ساعة الجهاز: تغيير وقت الهاتف يجب ألّا يفتح التقييم.
  final bool ratingAvailable;

  /// مسار الطلب بأوقاته كما سجّله الخادم (بلا هوية من غيّر الحالة).
  final List<OrderStatusEvent> statusHistory;

  /// الوقت المتبقي حتى يُفتح التقييم، أو null إن كان مفتوحاً/غير منطبق.
  ///
  /// للعرض فقط: القرار النهائي هو [ratingAvailable] القادم من الخادم.
  Duration? get timeUntilRating {
    final at = ratingAvailableAt;
    if (ratingAvailable || at == null) return null;
    final remaining = at.difference(DateTime.now());
    return remaining.isNegative ? Duration.zero : remaining;
  }

  factory Order.fromJson(Map<String, dynamic> json) {
    return Order(
      id: json['id']?.toString() ?? '',
      number: json['number']?.toString() ?? '',
      province: json['province'] as String? ?? '',
      deliveryCost: (json['deliveryFee'] as num?)?.toDouble() ?? 0,
      fullAddress: json['fullAddress'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      total: (json['total'] as num?)?.toDouble() ?? 0,
      productsTotal: (json['productsTotal'] as num?)?.toDouble() ?? 0,
      discount: (json['discount'] as num?)?.toDouble() ?? 0,
      deliveryDiscount:
          (json['deliveryDiscount'] as num?)?.toDouble() ?? 0,
      status: OrderStatus.fromString(json['status'] as String? ?? ''),
      items: (json['items'] as List? ?? const [])
          .map((e) => _mapItem(e as Map<String, dynamic>))
          .toList(),
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
      rejectionReason: json['rejectionReason'] as String?,
      zoneName: json['zoneName'] as String?,
      deliveryNote: json['deliveryNote'] as String?,
      deliveredAt: DateTime.tryParse(json['deliveredAt'] as String? ?? ''),
      ratingAvailableAt: DateTime.tryParse(
        json['ratingAvailableAt'] as String? ?? '',
      ),
      ratingAvailable: json['ratingAvailable'] as bool? ?? false,
      statusHistory: (json['statusHistory'] as List? ?? const [])
          .map((e) => OrderStatusEvent.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  /// يحوّل عنصر طلب الخادم
  /// ({ productId, productName, imageUrl, optionValue, price, quantity, lineTotal })
  /// إلى [CartItem] بالنموذج الذي تعرضه الواجهة.
  static CartItem _mapItem(Map<String, dynamic> json) {
    final image = resolveMediaUrl(json['imageUrl'] as String?);
    return CartItem(
      product: Product.fromJson({
        'id': json['productId']?.toString() ?? '',
        'name': json['productName'] as String? ?? '',
        'price': (json['price'] as num?)?.toDouble() ?? 0,
        'images': image != null && image.isNotEmpty ? [image] : const [],
        'stock': (json['quantity'] as num?)?.toInt() ?? 0,
      }),
      quantity: json['quantity'] as int? ?? 1,
      selectedOption: json['optionValue'] as String?,
    );
  }
}

/// حدث واحد في مسار الطلب كما يسجّله الخادم.
class OrderStatusEvent {
  const OrderStatusEvent({
    required this.status,
    required this.createdAt,
    this.note,
  });

  final OrderStatus status;
  final DateTime createdAt;

  /// ملاحظة الإدارة المرتبطة بالانتقال (سبب رفض / وقت وصول متوقع).
  final String? note;

  factory OrderStatusEvent.fromJson(Map<String, dynamic> json) {
    return OrderStatusEvent(
      status: OrderStatus.fromString(json['status'] as String? ?? ''),
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      note: json['note'] as String?,
    );
  }
}
