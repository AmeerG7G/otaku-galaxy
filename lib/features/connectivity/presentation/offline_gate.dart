import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';

import '../../../core/design_system/design_system.dart';

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
        if (_offline) _OfflineGateScreen(onRetry: _check),
      ],
    );
  }
}

/// حاجز انقطاع الاتصال بتصميم Otaku Galaxy v2.
///
/// صفّ هوية أعلى الشاشة، ثم لوحة تحريرية بيضاء برسم شخصية يخرج من حافتها،
/// ثم مؤشّر حالة نابض وزرّ إعادة محاولة متدرّج — بلا أيقونة دائرية وسط الشاشة.
class _OfflineGateScreen extends StatefulWidget {
  const _OfflineGateScreen({required this.onRetry});

  final VoidCallback onRetry;

  @override
  State<_OfflineGateScreen> createState() => _OfflineGateScreenState();
}

class _OfflineGateScreenState extends State<_OfflineGateScreen>
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
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Image.asset(
                            'assets/branding/otaku-galaxy-logo.jpg',
                            width: 38,
                            height: 38,
                            fit: BoxFit.cover,
                            alignment: Alignment.topCenter,
                          ),
                        ),
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
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _OfflineCard(pulse: _pulse),
                          const SizedBox(height: 20),
                          Row(
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
                                'غير متصل بالإنترنت',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  fontSize: 12.5,
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 22),
                          AnimePrimaryButton(
                            label: 'إعادة المحاولة',
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

/// لوحة الرسالة — سطح عائم كبير مع رسم شخصية يكسر الحافة السفلية.
class _OfflineCard extends StatelessWidget {
  const _OfflineCard({required this.pulse});

  final Animation<double> pulse;

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
              child: Image.asset('assets/art/opt/a-i3.png', width: 126),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 30, 22, 26),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.wifi_off_rounded,
                  size: 54,
                  color: theme.colorScheme.outline,
                ),
                const SizedBox(height: 20),
                FractionallySizedBox(
                  widthFactor: 0.78,
                  child: Text(
                    'ما بيه اتصال بالإنترنت',
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
                    'تحقّق من اتصالك وحاول مرة أخرى — كل شي بالمتجر '
                    'يحتاج إنترنت.',
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
