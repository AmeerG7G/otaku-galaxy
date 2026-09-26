import 'package:flutter/material.dart';

import '../../../l10n/app_strings.dart';
import '../../../l10n/gender.dart';
import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

/// اختيار الجنس ببطاقتين مرئيتين — لا حقل نصّي.
///
/// [CRITICAL] الاختيار بالضغط لا بالكتابة. حقلٌ حرّ كان سيقبل «ذكر» و«ذكـر»
/// و«m» و«رجل»، فلا يصلح أيٌّ منها لتصريف الخطاب، ويصل القاعدةَ ما يرفضه
/// قيدُها فيظهر للزبون خطأٌ لا ذنب له فيه.
///
/// ودجة واحدة يستعملها التسجيل والإعدادات معاً: صيغتان للاختيار نفسه كانتا
/// ستتباعدان في التسمية والسلوك.
///
/// لكل خيار لونه حين يُختار: الذكر أزرق والأنثى أحمر — إشارةٌ فورية تميّز
/// المحدَّد بلا قراءة. اللونان من رموز النظام الدلالية (`info` و`error`) لا
/// قيمتين مكتوبتين هنا، فيتبعان الوضعين الفاتح والداكن من تلقائهما.
///
/// [CRITICAL] اللون على البطاقة المحدَّدة وحدها: حافتها وأيقونتها. الخيار
/// غير المحدَّد يبقى محايداً كبقية النظام، ولا يمتدّ اللون إلى الخلفية ولا
/// إلى بقية الشاشة.
///
/// إتاحة: كل بطاقة `Semantics` بحالة اختيار صريحة، ومساحة اللمس ٦٤ ارتفاعاً
/// (فوق الحدّ الأدنى ٤٨). واللون ليس الإشارة الوحيدة — الحافة تغلظ، والوزن
/// يزيد، والحالة معلَنة للقارئ الصوتي؛ فلا يعتمد التمييز على تمييز الألوان.
class GenderSelector extends StatelessWidget {
  const GenderSelector({
    super.key,
    required this.value,
    required this.onChanged,
    this.label,
    this.errorText,
  });

  /// الاختيار الحالي — `null` يعني «لم يُختَر بعد».
  ///
  /// [AppGender.unknown] تُعامَل معاملة `null` هنا: لا بطاقة ثالثة للمجهول.
  /// «مجهول» حالةُ بياناتٍ لا خيارٌ يُعرض، وعرضُه كخيار يدعو الزبون إلى
  /// تركِ حقلٍ نحتاجه لمخاطبته.
  final AppGender? value;

  final ValueChanged<AppGender> onChanged;

  /// عنوان الحقل — `null` يعني «الجنس» بلغة الواجهة.
  final String? label;

  /// رسالة التحقق — تظهر تحت البطاقتين عند الإرسال بلا اختيار.
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label ?? context.strings('gender'),
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: AppDimens.weightBold,
          ),
        ),
        SizedBox(height: AppDimens.space2),
        Row(
          children: [
            Expanded(
              child: _GenderCard(
                label: context.strings('genderMale'),
                icon: Icons.male_rounded,
                // الأزرق الدلالي (`info`) لا لونٌ مكتوب هنا.
                accent: colors.info,
                selected: value == AppGender.male,
                onTap: () => onChanged(AppGender.male),
              ),
            ),
            SizedBox(width: AppDimens.space3),
            Expanded(
              child: _GenderCard(
                label: context.strings('genderFemale'),
                icon: Icons.female_rounded,
                // الأحمر الدلالي (`error`) — يُستعمل هنا كهوية لونية لا
                // كإشارة خطأ؛ وهو اللون الأحمر الوحيد في النظام.
                accent: colors.error,
                selected: value == AppGender.female,
                onTap: () => onChanged(AppGender.female),
              ),
            ),
          ],
        ),
        if (errorText != null) ...[
          SizedBox(height: AppDimens.space2),
          Text(
            errorText!,
            style: theme.textTheme.labelSmall?.copyWith(color: colors.error),
          ),
        ],
      ],
    );
  }
}

class _GenderCard extends StatelessWidget {
  const _GenderCard({
    required this.label,
    required this.icon,
    required this.accent,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;

  /// لون هذا الخيار حين يُختار — يُمرَّر من الرموز الدلالية لا يُكتب هنا.
  final Color accent;

  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        child: AnimatedContainer(
          duration: AppDimens.durationFast,
          curve: AppDimens.curveEmphasized,
          height: 64,
          decoration: BoxDecoration(
            // تظليل خفيف بلون الخيار فوق السطح وحافة أعرض — لا خلفية صمّاء
            // تطغى على الحقول المجاورة. المزج مع السطح يُبقي التباين صحيحاً
            // في الوضعين الفاتح والداكن بلا لونين مكتوبين لكلٍّ منهما.
            color: selected
                ? Color.alphaBlend(
                    accent.withValues(alpha: 0.10),
                    theme.colorScheme.surface,
                  )
                : theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(AppDimens.radiusMd),
            border: Border.all(
              width: selected ? 1.5 : 1,
              color: selected ? accent : theme.colorScheme.outlineVariant,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: AppDimens.iconLg,
                color: selected ? accent : theme.colorScheme.onSurfaceVariant,
              ),
              SizedBox(width: AppDimens.space2),
              Text(
                label,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: selected
                      ? AppDimens.weightBold
                      : AppDimens.weightSemiBold,
                  color: selected
                      ? theme.colorScheme.onSurface
                      : theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
