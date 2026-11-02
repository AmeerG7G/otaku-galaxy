import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../features/settings/presentation/cubit/locale_cubit.dart';

/// يعيد جلب المحتوى الخادمي حين تتبدّل لغة الواجهة.
///
/// [CRITICAL] نصوص التطبيق تتبدّل بـ`LocaleScope`، أما ما يأتي من الخادم —
/// أسماء الأقسام والمنتجات والخيارات والمحافظات، رسائل الحالة — فيُصرَّف
/// لحظة الجلب بلغة الطلب، وتحتفظ به الشاشة كما جاء. قبل هذا الخلّاط كان
/// تبديل اللغة لا يعيد جلب شيء: الرئيسية والأقسام بـ`Future` من `initState`،
/// والزائر بلا أي مسار إعادة جلب أصلاً — فتبقى أسماء كردية في واجهةٍ عربية
/// حتى يسحب المستخدم للتحديث.
///
/// الاستعمال: `class _XState extends State<X> with LocaleRefetch` ثم
/// `onLanguageChanged() => _load();`. غياب `LocaleCubit` (شجرة اختبار
/// معزولة) يعني لا اشتراك — لا استثناء.
mixin LocaleRefetch<T extends StatefulWidget> on State<T> {
  StreamSubscription<AppLanguage>? _localeSubscription;

  @override
  void initState() {
    super.initState();
    try {
      _localeSubscription = context.read<LocaleCubit>().stream.listen((_) {
        if (mounted) onLanguageChanged();
      });
    } on ProviderNotFoundException {
      // لا مكعّب لغة في هذه الشجرة — لا شيء يُعاد جلبه.
    }
  }

  @override
  void dispose() {
    _localeSubscription?.cancel();
    super.dispose();
  }

  /// يُستدعى بعد كل تبديل فعلي للغة؛ أعد جلب ما يصرّفه الخادم هنا.
  void onLanguageChanged();
}
