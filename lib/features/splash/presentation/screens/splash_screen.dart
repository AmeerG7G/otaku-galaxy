import 'dart:async';
import 'dart:math' as math;

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';

@RoutePage()
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _logoController;
  late final AnimationController _textController;
  late final AnimationController _particleController;

  late final Animation<double> _logoScale;
  late final Animation<double> _logoRotation;
  late final Animation<double> _textOpacity;
  late final Animation<Offset> _textSlide;
  late final Animation<double> _particleProgress;

  @override
  void initState() {
    super.initState();

    _logoController = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    );

    _textController = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    );

    _particleController = AnimationController(
      duration: const Duration(milliseconds: 2000),
      vsync: this,
    )..repeat(reverse: true);

    _logoScale = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _logoController, curve: Curves.elasticOut),
    );

    _logoRotation = Tween<double>(begin: -0.1, end: 0.0).animate(
      CurvedAnimation(parent: _logoController, curve: Curves.easeOutBack),
    );

    _textOpacity = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _textController, curve: Curves.easeOut));

    _textSlide = Tween<Offset>(begin: const Offset(0, 0.3), end: Offset.zero)
        .animate(
          CurvedAnimation(parent: _textController, curve: Curves.easeOutCubic),
        );

    _particleProgress = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _particleController, curve: Curves.easeInOut),
    );

    _startAnimations();
    _checkAuthAndNavigate();
  }

  Future<void> _startAnimations() async {
    await _logoController.forward();
    await _textController.forward();
  }

  Future<void> _checkAuthAndNavigate() async {
    await Future.delayed(
      const Duration(seconds: AppConstants.splashDurationSeconds + 1),
    );
    if (!mounted) return;
    final auth = context.read<AuthCubit>();
    // استعادة الجلسة من التخزين الآمن والتحقق منها لدى الخادم (/me).
    await auth.loadSession();
    if (!mounted) return;
    if (auth.isLoggedIn) {
      context.router.replace(const MainNavigationRoute());
    } else {
      context.router.replace(const LoginRoute());
    }
  }

  @override
  void dispose() {
    _logoController.dispose();
    _textController.dispose();
    _particleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: Stack(
          children: [
            // جزيئات خلفية متحركة
            ...List.generate(8, (index) => _buildParticle(index)),

            // محتوى رئيسي
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // الشعار المتحرك
                  AnimatedBuilder(
                    animation: Listenable.merge([
                      _logoController,
                      _particleController,
                    ]),
                    builder: (context, child) {
                      return Transform.scale(
                        scale: _logoScale.value,
                        child: Transform.rotate(
                          angle: _logoRotation.value * 0.1,
                          child: OtakuStoreLogo(
                            size: AppDimens.iconLogo * 1.5,
                            glowEnabled: true,
                            animationDuration: const Duration(
                              milliseconds: 2000,
                            ),
                          ),
                        ),
                      );
                    },
                  ),

                  SizedBox(height: AppDimens.space7),

                  // نص التحميل
                  SlideTransition(
                    position: _textSlide,
                    child: FadeTransition(
                      opacity: _textOpacity,
                      child: Column(
                        children: [
                          ShaderMask(
                            shaderCallback: (bounds) =>
                                colors.animeHeroGradient.createShader(bounds),
                            child: Text(
                              AppConstants.appName,
                              style: Theme.of(context).textTheme.headlineMedium
                                  ?.copyWith(
                                    fontWeight: AppDimens.weightExtraBold,
                                    letterSpacing: AppDimens.letterSpacingTight,
                                    color: Colors.white,
                                  ),
                            ),
                          ),
                          SizedBox(height: AppDimens.space3),
                          SizedBox(
                            width: 120,
                            child: AnimeLinearProgress(
                              height: 4,
                              valueColor: colors.primaryGradient.colors.first,
                              backgroundColor: colors
                                  .primaryGradient
                                  .colors
                                  .first
                                  .withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(
                                AppDimens.radiusFull,
                              ),
                            ),
                          ),
                          SizedBox(height: AppDimens.space2),
                          Text(
                            'جاري التحميل...',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                ),
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

  Widget _buildParticle(int index) {
    final random = (index * 37) % 100 / 100.0;
    final size = 4.0 + random * 8;
    final startX = (index % 5) / 4.0;
    final startY = 0.2 + (index / 5) * 0.6;

    return AnimatedBuilder(
      animation: _particleController,
      builder: (context, child) {
        final particleColors = context.themeColors;
        final progress = (_particleProgress.value + random * 0.3) % 1.0;
        final x = startX + math.sin(progress * 2 * 3.14159 + index) * 0.15;
        final y = startY - progress * 0.8;

        return Positioned(
          left: MediaQuery.of(context).size.width * x - size / 2,
          top: MediaQuery.of(context).size.height * y - size / 2,
          child: Opacity(
            opacity: (1 - progress) * 0.6 * (0.5 + random * 0.5),
            child: Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                gradient: particleColors.primaryGradient,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: particleColors.glowPrimary,
                    blurRadius: size * 2,
                    spreadRadius: 1,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
