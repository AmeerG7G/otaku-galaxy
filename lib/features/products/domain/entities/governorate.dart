/// محافظة متاحة للتوصيل مع تكلفة التوصيل بالدينار العراقي.
class Governorate {
  const Governorate({
    required this.id,
    required this.name,
    required this.deliveryFee,
  });

  final String id;
  final String name;
  final double deliveryFee;

  factory Governorate.fromJson(Map<String, dynamic> json) {
    return Governorate(
      id: json['id']?.toString() ?? '',
      name: json['name'] as String? ?? '',
      deliveryFee: (json['deliveryFee'] as num?)?.toDouble() ?? 0,
    );
  }
}

/// منطقة توصيل داخل محافظة، لها رسمها الخاص.
///
/// متى وُجدت مناطق نشطة لمحافظة، صار اختيار المنطقة إلزامياً، ورسمها هو
/// المحتسب بدل رسم المحافظة.
class DeliveryZone {
  const DeliveryZone({
    required this.id,
    required this.name,
    required this.deliveryFee,
  });

  final String id;
  final String name;
  final double deliveryFee;

  factory DeliveryZone.fromJson(Map<String, dynamic> json) {
    return DeliveryZone(
      id: json['id']?.toString() ?? '',
      name: json['name'] as String? ?? '',
      deliveryFee: (json['deliveryFee'] as num?)?.toDouble() ?? 0,
    );
  }
}
