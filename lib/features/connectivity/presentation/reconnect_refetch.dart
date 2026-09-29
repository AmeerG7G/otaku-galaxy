import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// عدّاد عودات الاتصال الذي يملكه حاجز الاتصال (`OfflineGate`)، مكشوفاً
/// للشاشات تحته.
///
/// الحاجز يغلّف الموجّه كلّه، فكل شاشةٍ مركّبة تجده فوقها. يزيد العدّاد مرةً
/// واحدة عند كل انتقالٍ من «غير متصل» إلى «متصل» — لا عند كل ضغطة «إعادة
/// المحاولة» ولا عند كل حدثٍ من النظام.
class ReconnectScope extends InheritedWidget {
  const ReconnectScope({
    super.key,
    required this.reconnections,
    required super.child,
  });

  final ValueListenable<int> reconnections;

  @override
  bool updateShouldNotify(ReconnectScope oldWidget) =>
      reconnections != oldWidget.reconnections;
}

/// يعيد جلب محتوى الشاشة حين يعود الاتصال بعد انقطاع.
///
/// [CRITICAL] الحاجز يُغطّي الشاشات ولا يُزيلها: تبقى مركّبةً تحته بما صنعته
/// أثناء الانقطاع — طلبٌ فشل، صورٌ لم تُحمَّل فبقي مكانها البديل. كانت «إعادة
/// المحاولة» تعيد فحص الاتصال وتُخفي الحاجز فقط، فينكشف ذلك كلّه كما هو ولا
/// يُطلب شيء. الشاشة التي تحمل هذا الخلّاط تُبلَّغ بالعودة فتبدأ جلباً جديداً.
///
/// الاستعمال كـ`LocaleRefetch`:
/// `class _XState extends State<X> with ReconnectRefetch` ثم
/// `onReconnected() => _load();`. غياب الحاجز (شجرة اختبار معزولة) يعني لا
/// اشتراك — لا استثناء.
mixin ReconnectRefetch<T extends StatefulWidget> on State<T> {
  ValueListenable<int>? _reconnections;

  @override
  void initState() {
    super.initState();
    // بلا تبعية: العدّاد نفسه يُبلغ، ولا حاجة لإعادة بناء الشاشة حين يُعاد
    // بناء الحاجز.
    _reconnections = context
        .getInheritedWidgetOfExactType<ReconnectScope>()
        ?.reconnections;
    _reconnections?.addListener(_handleReconnected);
  }

  @override
  void dispose() {
    _reconnections?.removeListener(_handleReconnected);
    super.dispose();
  }

  void _handleReconnected() {
    if (mounted) onReconnected();
  }

  /// يُستدعى مرةً لكل عودة اتصال؛ أعد جلب ما قد يكون فشل أو تقادم أثناء
  /// الانقطاع.
  void onReconnected();
}
