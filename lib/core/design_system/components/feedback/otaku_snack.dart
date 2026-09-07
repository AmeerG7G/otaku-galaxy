import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

/// نبرة الرسالة — تحدّد الأيقونة ولونها وحدهما.
enum OtakuSnackTone { success, error }

/// الشريط السفلي المعتمد في التطبيق — تعريفٌ واحد لكل رسالة قصيرة.
///
/// [CRITICAL] كل ما يخصّ السلوك مضبوط هنا لا عند المستدعي: المدّة، الشكل،
/// الهوامش، الحركة، الموضع، الطبقة، والإخفاء. كانت كل شاشة تبني `SnackBar`
/// خاصاً بها، فاختلفت المدد والأشكال — وأخطرها أن بعضها كان يعلق على
/// الشاشة بلا اختفاء (انظر [persist] أدناه). المستدعي يمرّر النصّ والنبرة
/// والإجراء فقط.
///
/// [CRITICAL] `persist: false` صريح. منذ Flutter 3.29 صار `persist` يساوي
/// `action != null` افتراضياً، فأي شريط يحمل زرّ إجراء يبقى ظاهراً إلى
/// الأبد: المؤقّت يعمل، وعند انتهائه يرى `persist == true` فيعود دون
/// إخفاء. تمريره صراحةً هنا يحمي **كل** المستدعين دفعةً واحدة، بمن فيهم من
/// يضيف إجراءً لاحقاً بلا أن يعرف بالفخّ.
void showOtakuSnack(
  BuildContext context, {
  required String message,
  OtakuSnackTone tone = OtakuSnackTone.success,
  SnackBarAction? action,
}) {
  final theme = Theme.of(context);
  final colors = context.themeColors;
  // يُمسك المدير قبل العرض: محتوى الشريط يُبنى بسياق آخر، والإمساك هنا يجعل
  // الإخفاء آمناً حتى لو تفكّكت الشاشة التي أطلقت الرسالة.
  final messenger = ScaffoldMessenger.of(context);

  final (iconData, iconColor, iconBackground) = switch (tone) {
    OtakuSnackTone.success => (Icons.check, colors.success, colors.successPale),
    OtakuSnackTone.error => (
      Icons.error_outline,
      colors.error,
      colors.errorPale,
    ),
  };

  messenger
    // إخفاء السابق قبل العرض: رسالتان متتاليتان تستبدل إحداهما الأخرى بدل
    // أن تصطفّ الثانية خلف الأولى فيتأخّر ظهورها بمدّة كاملة.
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: theme.colorScheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          side: BorderSide(color: theme.colorScheme.outlineVariant),
        ),
        margin: const EdgeInsets.all(18),
        duration: const Duration(milliseconds: 1500),
        persist: false,
        // الضغط على الرسالة نفسها يُخفيها فوراً.
        //
        // `hideCurrentSnackBar` هو الطريق الصحيح: `ScaffoldMessenger` يُلغي
        // مؤقّته الداخلي ضمنها ويشغّل حركة الخروج. لا مؤقّت خاص بنا لنُلغيه،
        // فلا مجال لتسريب أو تحديث حالة بعد التخلص.
        content: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => messenger.hideCurrentSnackBar(
            reason: SnackBarClosedReason.dismiss,
          ),
          child: Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: iconBackground,
                  borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                ),
                child: Icon(iconData, size: 16, color: iconColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  message,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: AppDimens.weightSemiBold,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
              ),
            ],
          ),
        ),
        action: action,
      ),
    );
}
