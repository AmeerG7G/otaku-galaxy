import 'package:auto_route/auto_route.dart';

import '../../../core/router/app_router.dart';

/// وجهة الإشعار الفوري عند لمسه — بقاعدة قائمة الإشعارات داخل التطبيق نفسها
/// (`NotificationsScreen._openNotification`): الطلب أولاً، ثم المنتج، ولا
/// وجهة لما سواهما (ترويج مثلاً) — يكفي أن يُفتح التطبيق.
///
/// المفاتيح من `push_outbox.data` (ترحيل 070): `orderId` و`productId` نصّيان.
PageRouteInfo<Object?>? routeForPushData(Map<String, Object?> data) {
  String? read(String key) {
    final value = data[key];
    return value is String && value.trim().isNotEmpty ? value.trim() : null;
  }

  final orderId = read('orderId');
  if (orderId != null) return OrderDetailRoute(orderId: orderId);
  final productId = read('productId');
  if (productId != null) return ProductDetailRoute(productId: productId);
  return null;
}

/// يفتح وجهة الإشعار الملموس.
///
/// [CRITICAL] لمسةٌ تُطلق التطبيق من العدم (`getInitialMessage`) تصل قبل أن
/// تنتهي شاشة البداية — ودفعُ الوجهة حينها يضيع حين تستبدل البدايةُ نفسها
/// بالتطبيق الرئيسي. لذلك تُحفظ حتى تعلن الواجهة الرئيسية جاهزيتها
/// ([markReady]) ثم تُدفع فوقها. اللمسة والتطبيق مفتوح تُدفع فوراً.
///
/// [D3] وكل لمسةٍ تحمل `notificationId` تُبلَّغ إلى [onOpened] — حتى لمسة
/// ترويجٍ بلا وجهة: فتحُ التطبيق نفسه هو المقيس. ولمسة الإقلاع تُبلَّغ عند
/// الجاهزية مثل وجهتها، حين تكون الجلسة قد استُعيدت.
class PushTapRouter {
  PushTapRouter(this._push, {this.onOpened});

  /// عادةً `sl<AppRouter>().push` — دالةٌ لا موجِّه كي يُختبر بلا شجرة.
  final Future<Object?> Function(PageRouteInfo<Object?> route) _push;

  /// عادةً `TrackingSignals.notificationOpened` — يقرّر هو إن كان القياس مُشغَّلاً.
  final void Function(String notificationId)? onOpened;

  bool _ready = false;
  PageRouteInfo<Object?>? _pending;
  final List<String> _pendingOpens = [];

  void handle(Map<String, Object?> data) {
    final value = data['notificationId'];
    final notificationId =
        value is String && value.trim().isNotEmpty ? value.trim() : null;
    final route = routeForPushData(data);
    if (_ready) {
      if (notificationId != null) onOpened?.call(notificationId);
      if (route != null) _push(route);
    } else {
      if (notificationId != null) _pendingOpens.add(notificationId);
      // الأحدث يفوز: لمستان قبل الجاهزية تفتحان الأخيرة لا الاثنتين.
      if (route != null) _pending = route;
    }
  }

  /// تستدعيه الواجهة الرئيسية بعد أول إطار — مرّة واحدة تكفي.
  void markReady() {
    if (_ready) return;
    _ready = true;
    final opens = List.of(_pendingOpens);
    _pendingOpens.clear();
    for (final id in opens) {
      onOpened?.call(id);
    }
    final pending = _pending;
    _pending = null;
    if (pending != null) _push(pending);
  }
}
