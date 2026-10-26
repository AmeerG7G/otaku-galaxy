import 'package:flutter/material.dart';
import '../../../core/l10n/app_strings.dart';
import 'package:flutter/services.dart';
import '../../../core/utils/digits.dart';

import '../../../core/design_system/design_system.dart';
import '../../../core/di/injection_container.dart';
import '../../../core/errors/app_exception.dart';
import '../data/birthday_storage.dart';
import '../../settings/presentation/cubit/locale_cubit.dart';

/// ورقة إدخال تاريخ الميلاد — التنفيذ الوحيد في التطبيق.
///
/// يستدعيها مدخلان: شاشة الحساب، وتأكيد استلام أول طلب. تُركت في مكان
/// واحد عمداً حتى لا يتفرّع نصّ الشرح ولا قواعد التحقق بين نسختين.
///
/// «هل سبق أن أُدخل التاريخ؟» يقرّره الخادم عبر [BirthdayStorage] لا
/// التخزين المحلي، فإعادة تثبيت التطبيق أو الدخول من جهاز آخر لا يُظهر
/// الطلب مجدداً لعميل أدخله فعلاً.
///
/// يعيد `true` إذا حُفظ التاريخ فعلاً.
///
/// [CRITICAL] النموذج ودجةٌ ذات حالة ([_BirthdayForm]) تملك متحكّميها
/// وتحرّرهما في `dispose` — أي بعد زوال الورقة من الشجرة. كانت المتحكّمات
/// محلّية هنا وتُحرَّر في `finally` فور عودة نتيجة الورقة، بينما الحقول ما
/// تزال مركّبة طوال حركة الخروج وتكتب في متحكّميها عند نزول لوحة المفاتيح؛
/// فكان النقر خارج الورقة يرمي «used after being disposed» أثناء البناء،
/// ويترك شجرةً يتيمة تُسقط أول إخطار موروث تالٍ (تبديل المظهر) بشاشة
/// حمراء. هذه الدالة لا تحمل الآن إلا قيمتين مقروءتين بعد الإغلاق.
Future<bool> showBirthdayPrompt(
  BuildContext context, {

  /// نص يوضّح سبب السؤال في هذه اللحظة تحديداً.
  String? intro,
}) async {
  final birthday = sl<BirthdayStorage>();

  final picked = await showOtakuSheet<({int day, int month})>(
    context: context,
    builder: (_) => _BirthdayForm(intro: intro),
  );
  if (picked == null || !context.mounted) return false;

  try {
    // الحفظ على الخادم هو ما يحسم الأمر؛ الواجهة لا تعلن النجاح قبله.
    await birthday.save(day: picked.day, month: picked.month);
    return true;
  } catch (error) {
    if (!context.mounted) return false;
    final message = error is AppException
        ? error.message
        : context.strings('birthdaySaveFailed');
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: context.themeColors.error,
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(AppDimens.screenHorizontalPadding),
        ),
      );
    return false;
  }
}

/// نموذج اليوم والشهر داخل الورقة. يقرأ نصوصه ومظهره بسياقه هو.
class _BirthdayForm extends StatefulWidget {
  const _BirthdayForm({this.intro});

  final String? intro;

  @override
  State<_BirthdayForm> createState() => _BirthdayFormState();
}

class _BirthdayFormState extends State<_BirthdayForm> {
  final _formKey = GlobalKey<FormState>();
  final _dayCtrl = TextEditingController();
  final _monthCtrl = TextEditingController();

  @override
  void dispose() {
    _dayCtrl.dispose();
    _monthCtrl.dispose();
    super.dispose();
  }

  /// القيمة الرقمية للحقل بعد تطبيع الأرقام الشرقية — أو `null`.
  /// أطول يومٍ في كل شهرٍ لعيد ميلاد — فبراير ٢٩ (مولودو السنة الكبيسة).
  static const _maxBirthdayDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  static int? _parse(String? raw) => int.tryParse(normalizeDigits(raw ?? '').trim());

  void _save() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.of(context).pop(
      (day: _parse(_dayCtrl.text)!, month: _parse(_monthCtrl.text)!),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final birthday = sl<BirthdayStorage>();

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      // [CRITICAL] (البوّابة ١٥، 2026-10-17) كورقة كلمة المرور: العنوان يحجز
      // أطول ترجماته (على ٣٢٠×٥٦٨ عند ×٢٫٠ كان العنوان الكردي يلتفّ سطرين
      // والعمود يتجاوز أسفله ٤٣)، والنموذج يُمرَّر حين لا يتّسع (ولوحة المفاتيح
      // مفتوحة على ٣٢٠×٥٦٨ ×١٫٣ كان الحفظ تحتها بلا وصول، باللغتين). حين يتّسع:
      // كما كان تماماً.
      child: OtakuSheet(
        title: context.strings('birthdayTitle'),
        titleTranslations: AppStrings.across('birthdayTitle'),
        titleSize: 19,
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // [CRITICAL] (البوّابة ٨، 2026-10-10) فقرةٌ تحجز أسطر أطول
                // ترجماتها: الكردية أطول بسطر عند ×١٫٣ فكانت الورقة تطول ٣٠.
                // مقدّمةٌ يمرّرها المستدعي: بلغته وحدها.
                BoundedText(
                  widget.intro ??
                      context.strings.p('birthdayPromptShort', {
                        'percent': '${birthday.discountPercent}',
                      }),
                  maxLines: 12,
                  minScale: 1,
                  reserveFor: widget.intro != null
                      ? const []
                      : [
                          for (final l in AppLanguage.values)
                            AppStrings.of(l).p('birthdayPromptShort', {
                              'percent': '${birthday.discountPercent}',
                            }),
                        ],
                  alignment: AlignmentDirectional.topStart,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 13,
                    height: 1.75,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: AnimeTextField(
                        controller: _dayCtrl,
                        label: context.strings('day'),
                        keyboardType: TextInputType.number,
                        textInputAction: TextInputAction.next,
                        inputFormatters: [
                          digitsOnlyInputFormatter,
                          LengthLimitingTextInputFormatter(2),
                        ],
                        validator: (v) {
                          final day = _parse(v);
                          // [CRITICAL] (2026-10-26) طول الشهر لا ٣١ لكل شهر:
                          // ٣١/٤ و٣٠/٢ أيامٌ لا وجود لها. ٢٩/٢ صالح (ميلادٌ في
                          // سنةٍ كبيسة) — الخادم يحكم بالقاعدة نفسها.
                          final month = _parse(_monthCtrl.text);
                          final max = month != null && month >= 1 && month <= 12
                              ? _maxBirthdayDay[month - 1]
                              : 31;
                          if (day == null || day < 1 || day > max) {
                            return context.strings('invalidDay');
                          }
                          return null;
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: AnimeTextField(
                        controller: _monthCtrl,
                        label: context.strings('month'),
                        keyboardType: TextInputType.number,
                        textInputAction: TextInputAction.done,
                        onSubmitted: (_) => _save(),
                        inputFormatters: [
                          digitsOnlyInputFormatter,
                          LengthLimitingTextInputFormatter(2),
                        ],
                        validator: (v) {
                          final month = _parse(v);
                          if (month == null || month < 1 || month > 12) {
                            return context.strings('invalidMonth');
                          }
                          return null;
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                AnimePrimaryButton(
                  label: context.strings('save'),
                  onPressed: _save,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
