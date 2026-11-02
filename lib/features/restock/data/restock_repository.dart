import '../../../core/network/api_client.dart';

/// نتيجة طلب «أعلمني عند توفر المنتج».
class RestockSubscription {
  const RestockSubscription({
    required this.subscribed,
    required this.alreadySubscribed,
    this.restockAt,
  });

  /// هل المستخدم مشترك الآن؟
  final bool subscribed;

  /// هل كان مشتركاً سلفاً؟ يميّز «سجّلناك» من «أنت مسجّل من قبل»، فالرسالة
  /// تختلف ولا يبدو التكرار خطأً.
  final bool alreadySubscribed;

  /// موعد التوفر المتوقَّع كما ضبطه المسؤول، إن ضبطه.
  final DateTime? restockAt;
}

/// انتظارٌ قائم لمنتج: هل له موعد متوقَّع؟ وهل عاد للتوفر؟
///
/// [CRITICAL] الموعد يأتي من **المنتج** عند كل قراءة لا من لقطة محفوظة وقت
/// الاشتراك. المسؤول قد يعدّله بعد أسبوع، والزبون يجب أن يرى الموعد الحالي
/// لا الذي أُعلن له أول مرة.
class RestockWaiting {
  const RestockWaiting({
    required this.productId,
    this.restockAt,
    this.inStock = false,
  });

  final String productId;

  /// موعد التوفر المتوقَّع كما ضبطه المسؤول الآن، إن ضبطه.
  final DateTime? restockAt;

  /// هل عاد المنتج للتوفر فعلاً؟ التوفر الحقيقي يتقدّم على أي موعد متوقَّع.
  final bool inStock;
}

/// «أعلمني عند توفر المنتج» — واجهة العميل لمسارات إعادة التوفر.
///
/// كل المسارات تخصّ صاحب الجلسة: الخادم يشتقّ المستخدم من التوكن ولا يقبل
/// معرّفاً من العميل، فلا سبيل لقراءة اشتراكات غيره أو الكتابة عليها.
class RestockRepository {
  RestockRepository(this._api);

  final ApiClient _api;

  /// ما ينتظره المستخدم الآن، بمواعيده الحالية.
  Future<List<RestockWaiting>> mine() async {
    final data = await _api.get('/restock-subscriptions/mine');
    if (data is! List) return const [];
    return [
      for (final item in data)
        if (item is Map && item['productId'] is String)
          RestockWaiting(
            productId: item['productId'] as String,
            restockAt: item['restockAt'] is String
                ? DateTime.tryParse(item['restockAt'] as String)?.toLocal()
                : null,
            inStock: item['inStock'] == true,
          ),
    ];
  }

  /// الاشتراك. الخادم مكرَّرٌ آمن: طلبٌ ثانٍ لنفس المنتج لا يُنشئ صفاً
  /// ثانياً بل يعيد `alreadySubscribed: true`.
  Future<RestockSubscription> subscribe(String productId) async {
    final data = await _api.post(
      '/restock-subscriptions',
      body: {'productId': productId},
    );
    final map = data is Map ? data : const {};
    final rawDate = map['restockAt'];
    return RestockSubscription(
      subscribed: map['subscribed'] == true,
      alreadySubscribed: map['alreadySubscribed'] == true,
      restockAt: rawDate is String ? DateTime.tryParse(rawDate)?.toLocal() : null,
    );
  }

  /// إلغاء الانتظار — مدعوم من الخادم، فلا حاجة لسلوك بديل.
  Future<void> unsubscribe(String productId) async {
    await _api.delete('/restock-subscriptions/$productId');
  }
}
