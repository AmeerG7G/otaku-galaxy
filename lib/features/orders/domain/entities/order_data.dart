import '../../../cart/domain/entities/cart_item.dart';

class OrderData {
  const OrderData({
    required this.governorateId,
    required this.province,
    required this.deliveryCost,
    required this.fullAddress,
    required this.phone,
    required this.items,
    this.discount = 0,
    this.deliveryDiscount = 0,
    this.zoneId,
    this.zoneName,
  });

  /// معرّف المحافظة لدى الخادم — إلزامي لإنشاء الطلب.
  final String governorateId;
  final String province;
  final double deliveryCost;
  final String fullAddress;
  final String phone;
  final List<CartItem> items;
  final double discount;

  /// خصم التوصيل المعاين — الخادم يعيد حسابه ويطبّقه عند الإنشاء.
  final double deliveryDiscount;

  /// رسوم التوصيل بعد الخصم.
  double get payableDelivery =>
      (deliveryCost - deliveryDiscount).clamp(0, double.infinity);

  /// منطقة التوصيل المختارة — إلزامية للمحافظات المقسّمة مناطق (النجف).
  final String? zoneId;

  /// اسم المنطقة للعرض في المراجعة فقط؛ الخادم يحفظ لقطته بنفسه.
  final String? zoneName;

  double get productsTotal =>
      items.fold(0, (sum, item) => sum + item.lineTotal);

  double get total => productsTotal + payableDelivery - discount;

  /// جسم الطلب: الخادم يقرأ العربة ويرسل المجاميع النهائية.
  Map<String, dynamic> toJson() {
    return {
      'governorateId': governorateId,
      'fullAddress': fullAddress,
      'phone': phone,
      if (zoneId != null) 'zoneId': zoneId,
    };
  }
}