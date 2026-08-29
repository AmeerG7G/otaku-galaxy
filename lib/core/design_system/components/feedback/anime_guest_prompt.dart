import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';
import '../buttons/anime_primary_button.dart';

/// بطاقة «أنت تتصفح كزائر» بتصميم Otaku Galaxy v2 — لوحة مستديرة موسّطة
/// مع هالة لونية ورسم شخصية يخرج من الحافة، وزر تسجيل دخول واضح.
class AnimeGuestPrompt extends StatelessWidget {
  const AnimeGuestPrompt({
    super.key,
    required this.title,
    required this.body,
    required this.onLogin,
    this.icon = Icons.person_outline,
    this.artwork = 'assets/art/opt/a-i0.png',
  });

  final String title;
  final String body;
  final VoidCallback onLogin;
  final IconData icon;
  final String? artwork;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(18),
        child: Container(
          width: double.infinity,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(AppDimens.radiusXl),
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
            boxShadow: colors.shadowFloating,
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: [
              PositionedDirectional(
                top: -50,
                end: -50,
                child: Container(
                  width: 190,
                  height: 190,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        colors.glowSecondary,
                        colors.glowSecondary.withValues(alpha: 0),
                      ],
                    ),
                  ),
                ),
              ),
              if (artwork != null)
                PositionedDirectional(
                  bottom: -14,
                  start: -26,
                  child: Image.asset(
                    artwork!,
                    height: 132,
                    fit: BoxFit.contain,
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        gradient: colors.primaryGradient,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: colors.glowPrimary,
                            blurRadius: 20,
                            offset: const Offset(0, 6),
                          ),
                        ],
                      ),
                      child: Icon(icon, color: Colors.white, size: 27),
                    ),
                    const SizedBox(height: AppDimens.space5),
                    Text(
                      title,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontSize: 20,
                        fontWeight: AppDimens.weightBlack,
                      ),
                    ),
                    const SizedBox(height: AppDimens.space3),
                    Text(
                      body,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        height: 1.8,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: AppDimens.space6),
                    AnimePrimaryButton(
                      label: 'تسجيل الدخول',
                      onPressed: onLogin,
                      height: AppDimens.buttonHeightXl,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
