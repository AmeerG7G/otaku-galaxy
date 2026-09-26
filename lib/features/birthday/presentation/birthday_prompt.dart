import 'package:flutter/material.dart';
import '../../../core/l10n/app_strings.dart';
import 'package:flutter/services.dart';
import '../../../core/utils/digits.dart';

import '../../../core/design_system/design_system.dart';
import '../../../core/di/injection_container.dart';
import '../../../core/errors/app_exception.dart';
import '../data/birthday_storage.dart';

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
      child: OtakuSheet(
        title: context.strings('birthdayTitle'),
        titleSize: 19,
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.intro ??
                    context.strings.p('birthdayPromptShort', {
                      'percent': '${birthday.discountPercent}',
                    }),
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
                        if (day == null || day < 1 || day > 31) {
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
    );
  }
}
