import 'package:flutter/material.dart';
import '../../../../core/l10n/app_strings.dart';

import '../../../../core/design_system/design_system.dart';
import '../../domain/app_version_config.dart';
import '../open_store.dart';

/// شاشة إجبار التحديث — حاجزٌ كامل بلا مخرج سوى المتجر.
///
/// [CRITICAL] لا زرّ «تخطّي» ولا «لاحقاً» ولا «متابعة». وجودُ أيٍّ منها يُلغي
/// معنى الإجبار: الحجب يقع لأن النسخة القديمة لم تعد تعمل مع الخادم، فـ
/// «لاحقاً» تعني شاشةً مكسورة لا تجربةً مؤجَّلة.
///
/// التصميم يتبع حاجز الاتصال (`OfflineGate`) في بنيته: صفّ الهوية أعلى
/// الشاشة، ثم لوحة الرسالة، ثم زرّ التدرّج.
///
/// [PRODUCT] **نصٌّ وواجهة فقط — بلا رسم شخصية** (قرار 2026-09-27). كانت
/// اللوحة تحمل رسم شخصيةٍ يكسر حافتها؛ أُزيل ولا يعود. يحرسه
/// `test/force_update_test.dart` («بلا رسم شخصية»).
///
/// [STEP 64 §16] النصّ المترجَم الافتراضي وحده بلغة الواجهة — لا رسالة
/// مسؤول ولا «أحدث نسخة». سطر النسخ: المثبَّتة والحدّ الأدنى المطلوب.
class ForceUpdateScreen extends StatelessWidget {
  const ForceUpdateScreen({
    super.key,
    required this.config,
    required this.installedVersion,
    this.onOpenStore,
  });

  final AppVersionConfig config;
  final String installedVersion;

  /// يُحقن في الاختبارات؛ الافتراضي يفتح رابط المتجر خارج التطبيق.
  final Future<void> Function(String url)? onOpenStore;

  /// مفتاحٌ لا نصّ: العضو ثابتٌ على مستوى الصنف فلا سياق له، ويُصرَّف
  /// عند البناء حيث السياق متاح.
  static const defaultMessageKey = 'updateRequiredMessage';

  /// رابطٌ غائب أو غير موثوق ⇒ «الرابط غير متوفر»؛ انظر [openStoreListing].
  Future<void> _openStore(BuildContext context) =>
      openStoreListing(context, config.updateUrl, onOpenStore: onOpenStore);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final message = context.strings(defaultMessageKey);

    return PopScope(
      // [CRITICAL] زرّ الرجوع لا يُخرج من الحاجز. بدونه يخرج المستخدم بضغطة
      // واحدة إلى الشاشة التي تحتها — والحاجز الذي يُخرَج منه ليس حاجزاً.
      canPop: false,
      // Scaffold لا Material: `ScaffoldMessenger` يحتاج Scaffold مسجَّلاً
      // ليعرض تنبيه «تعذّر فتح المتجر»، وبدونه يبتلع الزرُّ فشلَه صامتاً.
      child: Scaffold(
        backgroundColor: theme.scaffoldBackgroundColor,
        body: Stack(
          children: [
            PositionedDirectional(
              top: -90,
              end: -80,
              child: IgnorePointer(
                child: Container(
                  width: 280,
                  height: 280,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        colors.glowSecondary,
                        colors.glowSecondary.withValues(alpha: 0),
                      ],
                      stops: const [0, 0.68],
                    ),
                  ),
                ),
              ),
            ),
            SafeArea(
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(22, 22, 22, 0),
                    child: Row(
                      children: [
                        // [STAGE 12] كان JPEG مقصوصاً بـ ClipRRect + cover.
                        // صار يمرّ بمكوّن الشعار الوحيد فلا يمكن أن ينحرف عنه.
                        const OtakuStoreLogoSimple(size: 38),
                        const SizedBox(width: 11),
                        // [CRITICAL] (البوّابة ١٥، 2026-10-17) اسم المتجر نصّ
                        // ترويسة كاسم الرئيسية: يُصغَّر حتى ٠٫٨ من مقاس التصميم،
                        // ويحجز سطراً ثانياً بكل لغة إن لم تتّسع ترجمةٌ حتى عنده.
                        // كان `Text` بلا حدّ في الصفّ: «گەلاکسی ئۆتاکو» يتجاوز
                        // يميناً ١٧ على ٣٢٠ عند ×٢٫٠ (مصفوفة القياس الموثّقة).
                        Flexible(
                          child: BoundedText(
                            context.strings('brandName'),
                            maxLines: 2,
                            floorAtDesignSize: true,
                            reserveFor: AppStrings.across('brandName'),
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontFamily: AppFonts.heading,
                              fontFamilyFallback: AppFonts.headingFallback,
                              fontSize: 15.5,
                              fontWeight: AppDimens.weightExtraBold,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: SingleChildScrollView(
                      // الشاشة القصيرة (هاتف صغير بخطّ مكبَّر) تمرَّر بدل أن
                      // تفيض — الحاجز يجب أن يبقى قابلاً للاستعمال دائماً.
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 20,
                      ),
                      child: ResponsiveContentFrame(
                        maxWidth: kFormMaxWidth,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _UpdateCard(message: message),
                            const SizedBox(height: 20),
                            _VersionLine(
                              installedVersion: installedVersion,
                              requiredVersion: config.minimumSupportedVersion,
                            ),
                            const SizedBox(height: 22),
                            AnimePrimaryButton(
                              key: const Key('force_update_button'),
                              label: context.strings('updateApp'),
                              onPressed: () => _openStore(context),
                              height: AppDimens.buttonHeightXl,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// لوحة الرسالة — سطح عائم: أيقونة، عنوان، رسالة. لا رسم شخصية.
class _UpdateCard extends StatelessWidget {
  const _UpdateCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Container(
      key: const Key('force_update_card'),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(AppDimens.radiusXl),
        border: Border.all(color: theme.colorScheme.outlineVariant),
        boxShadow: colors.shadowFloating,
      ),
      padding: const EdgeInsets.fromLTRB(22, 30, 22, 26),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.system_update_rounded,
            size: 54,
            color: AppColors.secondary,
          ),
          const SizedBox(height: 20),
          // [CRITICAL] (البوّابة ٨، 2026-10-10) عنوانٌ يُصغَّر أولاً ورسالةٌ
          // فقرة، وكلاهما يحجز أطول ترجماته: نصٌّ كردي أطول كان يطيل البطاقة
          // ٥٧–٧٤ ويُنزل زرّ التحديث.
          BoundedText(
            context.strings('updateRequiredTitle'),
            maxLines: 3,
            reserveFor: AppStrings.across('updateRequiredTitle'),
            alignment: AlignmentDirectional.topStart,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontFamily: AppFonts.heading,
              fontFamilyFallback: AppFonts.headingFallback,
              fontSize: 23,
              height: 1.35,
              fontWeight: AppDimens.weightBlack,
            ),
          ),
          const SizedBox(height: 10),
          BoundedText(
            message,
            maxLines: 12,
            minScale: 1,
            reserveFor: AppStrings.across(ForceUpdateScreen.defaultMessageKey),
            alignment: AlignmentDirectional.topStart,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontSize: 14,
              height: 1.85,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

/// سطر النسخ — الحالية والمطلوبة، بلا ادّعاء رقمٍ لا نعرفه.
class _VersionLine extends StatelessWidget {
  const _VersionLine({
    required this.installedVersion,
    required this.requiredVersion,
  });

  final String installedVersion;
  final String requiredVersion;

  @override
  Widget build(BuildContext context) {
    if (installedVersion.isEmpty && requiredVersion.isEmpty) {
      return const SizedBox.shrink();
    }
    final theme = Theme.of(context);
    final parts = <String>[
      if (installedVersion.isNotEmpty) context.strings.p('yourVersion', {'version': installedVersion}),
      if (requiredVersion.isNotEmpty) context.strings.p('requiredVersion', {'version': requiredVersion}),
    ];
    return Text(
      parts.join('  ·  '),
      textAlign: TextAlign.center,
      style: theme.textTheme.bodySmall?.copyWith(
        fontSize: 12.5,
        color: theme.colorScheme.onSurfaceVariant,
      ),
    );
  }
}
