import 'package:flutter/widgets.dart';

import '../../features/settings/presentation/cubit/locale_cubit.dart';

/// لغة الواجهة كودجةٍ موروثة — ما يجعل تبديل اللغة يُعيد رسم كل ما قرأ نصّاً.
///
/// [CRITICAL] لماذا لا يكفي `BlocBuilder<LocaleCubit>` فوق `MaterialApp`؟
/// كانت `context.strings` تقرأ المكعّب بـ`read` بلا اعتماد موروث، على
/// افتراض أن إعادة بناء `MaterialApp` تعيد بناء الشجرة كلها. الافتراض
/// خاطئ ثلاث مرات: `localeResolutionCallback` يثبّت `ar` فلا تتغيّر
/// `Localizations`؛ و`ThemeData` متساوٍ قيمةً فلا يُخطر `Theme`؛ وصفحة كل
/// مسار مخبّأة في `_ModalScopeState` فلا يُعاد بناؤها. فكل شاشة مبنية قبل
/// التبديل — التبويبات الخمسة في `IndexedStack`، الإعدادات، أي شاشة مدفوعة —
/// بقيت بلغتها القديمة حتى تُبنى لسببٍ آخر. وهذا هو «نصوص كردية باقية بعد
/// التبديل إلى العربية».
///
/// الحلّ هو ما تفعله `Localizations` و`Theme` أصلاً: ودجة موروثة يعتمد عليها
/// كل من قرأ نصّاً (`dependOnInheritedWidgetOfExactType`)، فيُعلَّم للبناء
/// عند تغيّرها. الاعتماد الموروث — خلافاً لـ`context.watch` من provider —
/// جائز خارج `build` أيضاً (مُدقِّق حقل، `onPressed`)، فلا يكسر ما كان
/// `read` يحميه.
///
/// تُركَّب في `MaterialApp.builder` (فوق الموجّه)، فتكون سلفاً لكل مسار
/// وورقة وحوار. غيابها (شجرة معزولة في اختبار) يُسقط القراءة إلى
/// `LocaleCubit` ثم إلى العربية — كما كان.
class LocaleScope extends InheritedWidget {
  const LocaleScope({super.key, required this.language, required super.child});

  final AppLanguage language;

  /// اللغة مع تسجيل اعتماد — أو `null` إن غابت الودجة من الشجرة.
  static AppLanguage? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<LocaleScope>()?.language;

  @override
  bool updateShouldNotify(LocaleScope oldWidget) =>
      language != oldWidget.language;
}
