import 'dart:async';

import 'push_token_repository.dart';

/// يدير دورة حياة رمز الإشعارات مع دورة حياة الحساب.
///
/// نقطة واحدة يستدعيها التطبيق: [onLogin] بعد نجاح الدخول واستعادة الجلسة،
/// و[onLogout] قبل مسحها. ما بينهما — طلب الإذن، جلب الرمز، إرساله، ومتابعة
/// تدويره — يقع هنا.
class PushRegistrar {
  PushRegistrar(this._source, this._repository);

  final PushTokenSource _source;
  final PushTokenRepository _repository;

  StreamSubscription<String>? _refreshSub;

  /// آخر رمز أُرسل — يُحتفظ به في الذاكرة ليُلغى عند الخروج فقط.
  String? _current;

  /// يُستدعى بعد أن يصير للتطبيق حسابٌ مسجَّل.
  ///
  /// يفشل بهدوء: رفضُ المستخدم للإذن، أو غياب المزوّد، لا يجوز أن يمنع
  /// الدخول أو يُظهر خطأً — الإشعار الفوري تحسينٌ لا شرطٌ لاستعمال التطبيق.
  Future<void> onLogin() async {
    try {
      final token = await _source.requestPermissionAndGetToken();
      if (token == null || token.isEmpty) return;
      _current = token;
      await _repository.register(token);

      // تدوير الرمز: المزوّد يغيّره أحياناً (إعادة تثبيت، مسح بيانات).
      // بلا متابعة يبقى الخادم يرسل إلى رمزٍ ميت والجهاز لا يستقبل شيئاً.
      await _refreshSub?.cancel();
      _refreshSub = _source.onTokenRefresh.listen((refreshed) async {
        _current = refreshed;
        try {
          await _repository.register(refreshed);
        } catch (_) {
          // تعذّر التحديث الآن — يُعاد عند الدخول القادم.
        }
      });
    } catch (_) {
      // لا شيء: انظر شرح الفشل الهادئ أعلاه.
    }
  }

  /// يُستدعى قبل مسح الجلسة.
  ///
  /// [CRITICAL] الإلغاء **قبل** فقدان التوكن لا بعده: المسار محميّ
  /// بالمصادقة، وإلغاؤه بعد الخروج يرتدّ بـ401 فيبقى الجهاز مسجَّلاً باسم
  /// من خرج — ويستقبل إشعاراته الخاصة من يستعمل الهاتف بعده.
  Future<void> onLogout() async {
    await _refreshSub?.cancel();
    _refreshSub = null;
    final token = _current;
    _current = null;
    if (token == null) return;
    try {
      await _repository.unregister(token);
    } catch (_) {
      // الشبكة مقطوعة وقت الخروج: الخادم سينقل الرمز تلقائياً إلى الحساب
      // التالي الذي يسجّله من هذا الجهاز (`ON CONFLICT (token) DO UPDATE`).
    }
  }

  Future<void> dispose() async {
    await _refreshSub?.cancel();
    _refreshSub = null;
  }
}
