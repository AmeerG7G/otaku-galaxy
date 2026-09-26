import 'dart:async';
import '../../../core/l10n/app_strings.dart';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';

import '../../../core/design_system/design_system.dart';
import '../../visuals/domain/visual_slot.dart';
import '../../visuals/presentation/managed_artwork.dart';

/// يغلّف التطبيق كاملاً؛ عند انقطاع الاتصال يُعرض حاجز بلا وصول لأي محتوى
/// — للزائر والمسجّل والعائد على حدٍّ سواء (لا شاشة رئيسية فارغة أوفلاين).
class OfflineGate extends StatefulWidget {
  const OfflineGate({super.key, required this.child});

  final Widget child;

  @override
  State<OfflineGate> createState() => _OfflineGateState();
}

class _OfflineGateState extends State<OfflineGate> {
  bool _offline = false;
  StreamSubscription<List<ConnectivityResult>>? _sub;

  @override
  void initState() {
    super.initState();
    _check();
    _sub = Connectivity().onConnectivityChanged.listen((results) {
      final offline = results.every((r) => r == ConnectivityResult.none);
      if (mounted) setState(() => _offline = offline);
    });
  }

  Future<void> _check() async {
    final results = await Connectivity().checkConnectivity();
    final offline = results.every((r) => r == ConnectivityResult.none);
    if (mounted) setState(() => _offline = offline);
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        if (_offline) OfflineGateScreen(onRetry: _check),
      ],
    );
  }
}

/// حاجز انقطاع الاتصال بتصميم Otaku Galaxy v2.
///
/// صفّ هوية أعلى الشاشة، ثم لوحة بيضاء موسَّطة: رسم الشخصية، فأيقونة انقطاع
/// الاتصال، فالعنوان والنصّ — كلٌّ في وسط اللوحة (قرار 2026-09-20)؛ ثم مؤشّر
/// حالة نابض موسَّط وزرّ إعادة محاولة متدرّج.
///
/// الرسم **أصلٌ مضمَّن لا فتحة**: هذه الشاشة تُعرض حين لا شبكة، فربطها
/// بالخادم يعني رسماً غائباً في أسوأ لحظة (انظر `VisualSlots`). منطق الكشف
/// وإعادة المحاولة في [OfflineGate] لم يُمسّ. عامّةٌ لتُختبر مباشرةً.
class OfflineGateScreen extends StatefulWidget {
  const OfflineGateScreen({super.key, required this.onRetry});

  final VoidCallback onRetry;

  @override
  State<OfflineGateScreen> createState() => _OfflineGateScreenState();
}

class _OfflineGateScreenState extends State<OfflineGateScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Positioned.fill(
      child: Material(
        color: theme.scaffoldBackgroundColor,
        child: Stack(
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
                  // صفّ الهوية أعلى الشاشة.
                  Padding(
                    padding: const EdgeInsets.fromLTRB(22, 22, 22, 0),
                    child: Row(
                      children: [
                        // [STAGE 12] كان JPEG مقصوصاً بـ ClipRRect + cover.
                        // صار يمرّ بمكوّن الشعار الوحيد فلا يمكن أن ينحرف عنه.
                        const OtakuStoreLogoSimple(size: 38),
                        const SizedBox(width: 11),
                        Text(
                          context.strings('brandName'),
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
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const _OfflineCard(),
                          const SizedBox(height: 20),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              FadeTransition(
                                opacity: _pulse,
                                child: Container(
                                  width: 8,
                                  height: 8,
                                  decoration: const BoxDecoration(
                                    color: AppColors.error,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 9),
                              Text(
                                context.strings('offlineShort'),
                                style: theme.textTheme.bodySmall?.copyWith(
                                  fontSize: 12.5,
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 22),
                          AnimePrimaryButton(
                            label: context.strings('retry'),
                            onPressed: widget.onRetry,
                            height: AppDimens.buttonHeightXl,
                          ),
                        ],
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

/// لوحة الرسالة — سطح عائم كبير، محتواه كلّه على محور اللوحة.
///
/// الرسم فوق، ثم أيقونة انقطاع الاتصال، ثم العنوان والنصّ موسَّطَين. كان
/// الرسم يكسر الزاوية السفلية والنصّ ملتصقاً بجهة البداية، وكان النصّ يقول
/// «يحتاج المتجر إلى اتصال» — وهو ما يعرفه القارئ من العنوان.
class _OfflineCard extends StatelessWidget {
  const _OfflineCard();

  /// الأصل المضمَّن — بديلُ الفتحة حين لا صورة على القرص (أول تشغيلٍ على
  /// الإطلاق، أو صورةٌ بدّلها المسؤول ولم تُنزَّل بعد).
  ///
  /// [PRODUCT] كانت الشاشة مستبعَدة من الفتحات («تُعرض حين لا شبكة»).
  /// صارت فتحةً (الهجرة ٠٥٥) لأن `ManagedArtwork` لا يحتاج الشبكة ليعرض
  /// صورةً نزّلها الإقلاع إلى القرص، وكل مسار فشلٍ ينتهي إلى هذا الأصل —
  /// فالشاشة لا تفرغ في أي حال.
  static const String artwork = 'assets/art/opt/a-i17.png';

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
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 26, 22, 26),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const ManagedArtwork(
              slot: VisualSlots.offlineGate,
              fallbackAsset: artwork,
              height: 132,
            ),
            const SizedBox(height: 18),
            Icon(
              Icons.wifi_off_rounded,
              size: 54,
              color: theme.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: 18),
            Text(
              context.strings('offlineTitle'),
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontFamily: 'Tajawal',
                fontSize: 23,
                height: 1.35,
                fontWeight: AppDimens.weightBlack,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              context.strings('offlineBody'),
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontSize: 14,
                height: 1.85,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
