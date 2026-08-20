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
  });

  /// معرّف المحافظة لدى الخادم — إلزامي لإنشاء الطلب.
  final String governorateId;
  final String province;
  final double deliveryCost;
  final String fullAddress;
  final String phone;
  final List<CartItem> items;
  final double discount;

  double get productsTotal =>
      items.fold(0, (sum, item) => sum + item.lineTotal);

  double get total => productsTotal + deliveryCost - discount;

  /// جسم الطلب: الخادم يقرأ العربة ويرسل المجاميع النهائية.
  Map<String, dynamic> toJson() {
    return {
      'governorateId': governorateId,
      'fullAddress': fullAddress,
      'phone': phone,
    };
  }
}