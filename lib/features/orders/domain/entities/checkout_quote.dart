/// ملخّص الدفع كما يحسبه الخادم قبل التأكيد (`GET /orders/checkout-quote`).
///
/// [CRITICAL] الأرقام هنا أرقام الخادم لا حساب التطبيق: العربة المحفوظة على
/// الخادم، وخصم الميلاد، وخصم مزيّة المستوى المطالَب بها، بالدالة نفسها التي
/// يحفظ بها الخادم الطلب (`priceOrder`). كانت شاشتا الدفع تعاينان خصم الميلاد
/// وحده على العميل ولا تعرفان المزيّة، فيطالب الزبون بها ثم لا يجدها في
/// ملخّص طلبه (2026-09-27).
///
/// المعاينة لا تحجز المزيّة ولا تستهلكها؛ الإنشاء يعيد الحساب تحت الأقفال
/// وهو الحكم.
class CheckoutQuote {
  const CheckoutQuote({
    required this.productsTotal,
    this.birthdayDiscount = 0,
    this.loyaltyDiscount = 0,
    this.loyaltyRewardLevelKey,
    this.loyaltyRewardPercent,
    this.deliveryFee,
    this.deliveryDiscount = 0,
    this.total,
  });

  final double productsTotal;
  final double birthdayDiscount;

  /// خصم مزيّة المستوى المطالَب بها — صفرٌ إن لم تكن مزيّة مفتوحة.
  final double loyaltyDiscount;
  final String? loyaltyRewardLevelKey;
  final int? loyaltyRewardPercent;

  /// رسوم التوصيل — `null` قبل أن تُعرف المحافظة (والمنطقة إن كانت مقسّمة).
  final double? deliveryFee;
  final double deliveryDiscount;

  /// الإجمالي كما سيُحفظ — `null` ما دامت الرسوم غير معروفة.
  final double? total;

  /// مجموع الخصم على المنتجات (الميلاد + المزيّة).
  double get discount => birthdayDiscount + loyaltyDiscount;

  static double _num(Object? value) => (value as num?)?.toDouble() ?? 0;

  factory CheckoutQuote.fromJson(Map<String, dynamic> json) {
    final reward = json['loyaltyReward'] as Map<String, dynamic>?;
    return CheckoutQuote(
      productsTotal: _num(json['productsTotal']),
      birthdayDiscount: _num(json['birthdayDiscount']),
      loyaltyDiscount: _num(json['loyaltyDiscount']),
      loyaltyRewardLevelKey: reward?['levelKey']?.toString(),
      loyaltyRewardPercent: (reward?['percent'] as num?)?.toInt(),
      deliveryFee: (json['deliveryFee'] as num?)?.toDouble(),
      deliveryDiscount: _num(json['deliveryDiscount']),
      total: (json['total'] as num?)?.toDouble(),
    );
  }
}
