import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/design_system/design_system.dart';
import '../../domain/app_version_config.dart';

/// شاشة إجبار التحديث — حاجزٌ كامل بلا مخرج سوى المتجر.
///
/// [CRITICAL] لا زرّ «تخطّي» ولا «لاحقاً» ولا «متابعة». وجودُ أيٍّ منها يُلغي
/// معنى الإجبار: الحجب يقع لأن النسخة القديمة لم تعد تعمل مع الخادم، فـ
/// «لاحقاً» تعني شاشةً مكسورة لا تجربةً مؤجَّلة.
///
/// التصميم يتبع حاجز الاتصال (`OfflineGate`) نفسه: صفّ الهوية أعلى الشاشة،
/// ثم لوحة تحريرية برسم شخصية يكسر الحافة، ثم زرّ التدرّج — فيقع الحاجزان
/// في لغةٍ بصرية واحدة بدل شاشتَي حجبٍ لا تشبه إحداهما الأخرى.
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

  static const defaultMessage =
      'صدرت نسخة جديدة من مجرة الأوتاكو، ولم تعد هذه النسخة مدعومة. '
      'حدّث التطبيق لمواصلة التسوّق.';

  Future<void> _openStore(BuildContext context) async {
    final url = config.storeUrlFor();
    if (url.isEmpty) {
      // رابط غير مضبوط: نقول ذلك بدل أن نصمت على زرّ لا يفعل شيئاً.
      _notify(
        context,
        'رابط التحديث غير متوفر حالياً — حدّث التطبيق من المتجر.',
      );
      return;
    }
    if (onOpenStore != null) {
      await onOpenStore!(url);
      return;
    }
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && context.mounted) {
      _notify(context, 'تعذّر فتح المتجر — افتحه يدوياً وحدّث التطبيق.');
    }
  }

  void _notify(BuildContext context, String message) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final message = config.updateMessage.isNotEmpty
        ? config.updateMessage
        : defaultMessage;

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
                        Text(
                          'مجرة الأوتاكو',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontFamily: 'Tajawal',
                            fontSize: 15.5,
                            fontWeight: AppDimens.weightExtraBold,
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
                              requiredVersion: config.latestVersion.isNotEmpty
                                  ? config.latestVersion
                                  : config.minimumSupportedVersion,
                            ),
                            const SizedBox(height: 22),
                            AnimePrimaryButton(
                              key: const Key('force_update_button'),
                              label: 'تحديث التطبيق',
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

/// لوحة الرسالة — سطح عائم برسم شخصية يكسر الحافة السفلية.
class _UpdateCard extends StatelessWidget {
  const _UpdateCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(AppDimens.radiusXl),
        border: Border.all(color: theme.colorScheme.outlineVariant),
        boxShadow: colors.shadowFloating,
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          PositionedDirectional(
            bottom: -16,
            end: -14,
            child: IgnorePointer(
              child: Image.asset('assets/art/opt/a-i5.png', width: 126),
            ),
          ),
          Padding(
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
                FractionallySizedBox(
                  widthFactor: 0.78,
                  child: Text(
                    'يلزم تحديث التطبيق',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontFamily: 'Tajawal',
                      fontSize: 23,
                      height: 1.35,
                      fontWeight: AppDimens.weightBlack,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                FractionallySizedBox(
                  widthFactor: 0.82,
                  child: Text(
                    message,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontSize: 14,
                      height: 1.85,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
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
      if (installedVersion.isNotEmpty) 'نسختك $installedVersion',
      if (requiredVersion.isNotEmpty) 'المطلوبة $requiredVersion',
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
