import 'dart:math';

import '../../../cart/domain/entities/cart_item.dart';

/// مفتاح عدم التكرار لإرسال طلب: ٣٢ محرفاً سداسياً عشوائياً آمناً — ضمن صيغة
/// الخادم (`[A-Za-z0-9_-]{16,128}`).
String newOrderIdempotencyKey([Random? random]) {
  final rng = random ?? Random.secure();
  return List.generate(32, (_) => rng.nextInt(16).toRadixString(16)).join();
}

class OrderData {
  const OrderData({
    required this.governorateId,
    required this.province,
    required this.deliveryCost,
    required this.fullAddress,
    required this.phone,
    required this.items,
    this.discount = 0,
    this.loyaltyDiscount = 0,
    this.deliveryDiscount = 0,
    this.quotedTotal,
    this.zoneId,
    this.zoneName,
    this.loyaltyGiftActivated = false,
    this.idempotencyKey,
  });

  /// معرّف المحافظة لدى الخادم — إلزامي لإنشاء الطلب.
  final String governorateId;
  final String province;
  final double deliveryCost;
  final String fullAddress;
  final String phone;
  final List<CartItem> items;

  /// الخصم على المنتجات كما حسبه الخادم في ملخّص الدفع (الميلاد + المزيّة).
  final double discount;

  /// الجزء الآتي من مزيّة المستوى داخل [discount] — للعرض في المراجعة.
  final double loyaltyDiscount;

  /// خصم الميلاد: ما بقي من [discount] بعد المزيّة.
  double get birthdayDiscount =>
      (discount - loyaltyDiscount).clamp(0, double.infinity);

  /// الإجمالي كما أعاده ملخّص الخادم (`CheckoutQuote.total`)، إن وُجد.
  final double? quotedTotal;

  /// خصم التوصيل المعاين — الخادم يعيد حسابه ويطبّقه عند الإنشاء.
  final double deliveryDiscount;

  /// رسوم التوصيل بعد الخصم.
  double get payableDelivery =>
      (deliveryCost - deliveryDiscount).clamp(0, double.infinity);

  /// منطقة التوصيل المختارة — إلزامية للمحافظات المقسّمة مناطق (النجف).
  final String? zoneId;

  /// اسم المنطقة للعرض في المراجعة فقط؛ الخادم يحفظ لقطته بنفسه.
  final String? zoneName;

  /// هل فعَّل الزبون هديةَ مستوى مرتبطة بهذا الطلب؟ — للعرض في المراجعة فقط.
  final bool loyaltyGiftActivated;

  /// [CRITICAL] مفتاح `Idempotency-Key` لهذا الإرسال — ثابتٌ عبر كل محاولةٍ
  /// من شاشة المراجعة نفسها. ردٌّ ضاع بعد التزام الخادم (مهلة ١٥ ثانية على
  /// شبكةٍ بطيئة) كان يترك الزبون أمام «العربة فارغة» عند إعادة الضغط، فيعيد
  /// إضافة المنتجات ويطلب مرةً ثانية. بالمفتاح نفسه يعيد الخادم الطلب الأول.
  /// لا يدخل [toJson]: يُرسَل ترويسةً.
  final String? idempotencyKey;

  /// نسخةٌ تحمل [key] — تُبنى مرةً واحدة لكل شاشة مراجعة.
  OrderData withIdempotencyKey(String key) => OrderData(
    governorateId: governorateId,
    province: province,
    deliveryCost: deliveryCost,
    fullAddress: fullAddress,
    phone: phone,
    items: items,
    discount: discount,
    loyaltyDiscount: loyaltyDiscount,
    deliveryDiscount: deliveryDiscount,
    quotedTotal: quotedTotal,
    zoneId: zoneId,
    zoneName: zoneName,
    loyaltyGiftActivated: loyaltyGiftActivated,
    idempotencyKey: key,
  );

  double get productsTotal =>
      items.fold(0, (sum, item) => sum + item.lineTotal);

  /// إجمالي الخادم متى وصل ملخّصه — لا يُعاد حسابه على العميل.
  double get total => quotedTotal ?? productsTotal + payableDelivery - discount;

  /// جسم الطلب: الخادم يقرأ العربة ويرسل المجاميع النهائية.
  ///
  /// `expectedPrices` (CA-14، الخيار أ): سعر الوحدة الذي **راجعه** الزبون لكل
  /// سطر — من [items] كما بُنيت من العربة المُزامَنة، لا قراءةً جديدة عند
  /// الإرسال. الخادم يقارنه بالسعر الحالي ويرفض أي اختلاف بـ`409
  /// PRODUCT_PRICE_CHANGED`. فحصٌ لا مصدر: لا يُرسَل مجموعٌ ولا خصمٌ، والسعر
  /// المحفوظ في الطلب سعر الخادم وحده.
  Map<String, dynamic> toJson() {
    return {
      'governorateId': governorateId,
      'fullAddress': fullAddress,
      'phone': phone,
      if (zoneId != null) 'zoneId': zoneId,
      'expectedPrices': [
        for (final item in items)
          {'productId': item.product.id, 'unitPrice': item.product.price},
      ],
    };
  }
}
