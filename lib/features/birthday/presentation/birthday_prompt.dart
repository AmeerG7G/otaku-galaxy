import 'package:flutter/material.dart';

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
Future<bool> showBirthdayPrompt(
  BuildContext context, {
  /// نص يوضّح سبب السؤال في هذه اللحظة تحديداً.
  String? intro,
}) async {
  final birthday = sl<BirthdayStorage>();
  final dayCtrl = TextEditingController();
  final monthCtrl = TextEditingController();
  final formKey = GlobalKey<FormState>();

  final confirmed = await showOtakuSheet<bool>(
    context: context,
    builder: (sheetContext) => Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
      ),
      child: OtakuSheet(
        title: '🎂 تاريخ ميلادك',
        titleSize: 19,
        child: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                intro ??
                    'نعطيك خصم ${birthday.discountPercent}٪ على طلب واحد '
                        'بيوم ميلادك. لا يمكن تغيير التاريخ بعد حفظه.',
                style: Theme.of(sheetContext).textTheme.bodySmall?.copyWith(
                  fontSize: 13,
                  height: 1.75,
                  color: Theme.of(sheetContext).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: AnimeTextField(
                      controller: dayCtrl,
                      label: 'اليوم',
                      keyboardType: TextInputType.number,
                      validator: (v) {
                        final day = int.tryParse(v ?? '');
                        if (day == null || day < 1 || day > 31) {
                          return 'يوم غير صالح';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: AnimeTextField(
                      controller: monthCtrl,
                      label: 'الشهر',
                      keyboardType: TextInputType.number,
                      validator: (v) {
                        final month = int.tryParse(v ?? '');
                        if (month == null || month < 1 || month > 12) {
                          return 'شهر غير صالح';
                        }
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              AnimePrimaryButton(
                label: 'حفظ',
                onPressed: () {
                  if (formKey.currentState!.validate()) {
                    Navigator.of(sheetContext).pop(true);
                  }
                },
              ),
            ],
          ),
        ),
      ),
    ),
  );

  if (confirmed != true || !context.mounted) return false;

  try {
    // الحفظ على الخادم هو ما يحسم الأمر؛ الواجهة لا تعلن النجاح قبله.
    await birthday.save(
      day: int.parse(dayCtrl.text),
      month: int.parse(monthCtrl.text),
    );
    return true;
  } catch (error) {
    if (!context.mounted) return false;
    final message = error is AppException
        ? error.message
        : 'تعذّر حفظ تاريخ الميلاد، حاول مرة أخرى';
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
