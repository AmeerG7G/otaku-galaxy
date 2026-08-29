import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/router/app_router.dart';
import '../../data/personalize_storage.dart';
import '../cubit/locale_cubit.dart';
import '../cubit/theme_cubit.dart';
import '../cubit/theme_state.dart';
import '../widgets/personalize_cards.dart';

/// شاشة التخصيص بتصميم Otaku Galaxy v2.
///
/// تظهر مرة واحدة بعد أول دخول/تسجيل: يختار العميل لغته ومظهره قبل دخول
/// المتجر. الاختيار يُطبَّق فوراً (الـCubits تحفظه محلياً)، ويبقى متاحاً
/// لاحقاً من الإعدادات.
@RoutePage()
class PersonalizeScreen extends StatelessWidget {
  const PersonalizeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: Stack(
        children: [
          // المصدر يضع الهالة على اليمين الفيزيائي (right) والرسم على اليسار
          // (left)، أي `start` و`end` على الترتيب في واجهة عربية.
          PositionedDirectional(
            top: -90,
            start: -70,
            child: IgnorePointer(
              child: Container(
                width: 250,
                height: 250,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      AppColors.secondary.withValues(alpha: 0.16),
                      AppColors.secondary.withValues(alpha: 0),
                    ],
                    stops: const [0, 0.68],
                  ),
                ),
              ),
            ),
          ),
          PositionedDirectional(
            top: 44,
            end: -30,
            child: IgnorePointer(
              child: Opacity(
                opacity: 0.22,
                child: Image.asset('assets/art/opt/a-i4.png', width: 126),
              ),
            ),
          ),

          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── الترويسة ──
                Padding(
                  padding: const EdgeInsets.fromLTRB(22, 26, 22, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const OtakuStoreLogoSimple(size: 42),
                      const SizedBox(height: 14),
                      Text(
                        'خلّينا نضبط تجربتك',
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontFamily: 'Tajawal',
                          fontSize: 25,
                          letterSpacing: -0.5,
                          fontWeight: AppDimens.weightBlack,
                        ),
                      ),
                      const SizedBox(height: 7),
                      FractionallySizedBox(
                        widthFactor: 0.84,
                        child: Text(
                          'اختر لغتك والمظهر اللي يناسبك. تقدر تغيّرهم بأي وقت '
                          'من الإعدادات.',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontSize: 13.5,
                            height: 1.75,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                // ── الاختيارات ──
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(22, 16, 22, 8),
                    children: [
                      const OtakuGroupLabel(
                        label: 'اللغة',
                        padding: EdgeInsets.only(bottom: 11),
                      ),
                      BlocBuilder<LocaleCubit, AppLanguage>(
                        builder: (context, current) => Row(
                          children: [
                            for (final language in AppLanguage.values) ...[
                              if (language != AppLanguage.values.first)
                                const SizedBox(width: 11),
                              Expanded(
                                child: LanguageCard(
                                  name: language.label,
                                  subtitle: language == AppLanguage.arabic
                                      ? 'اللغة الافتراضية'
                                      : 'زمانی کوردی',
                                  selected: current == language,
                                  onTap: () => context
                                      .read<LocaleCubit>()
                                      .setLanguage(language),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const OtakuGroupLabel(
                        label: 'المظهر',
                        padding: EdgeInsets.fromLTRB(0, 24, 0, 11),
                      ),
                      BlocBuilder<ThemeCubit, ThemeState>(
                        builder: (context, state) {
                          final themeCubit = context.read<ThemeCubit>();
                          return Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: ThemePreviewCard(
                                  dark: false,
                                  label: 'فاتح',
                                  selected: !state.isDark,
                                  onTap: () => themeCubit.setDark(false),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: ThemePreviewCard(
                                  dark: true,
                                  label: 'داكن',
                                  selected: state.isDark,
                                  onTap: () => themeCubit.setDark(true),
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                    ],
                  ),
                ),

                // ── المتابعة ──
                Padding(
                  padding: const EdgeInsets.fromLTRB(22, 12, 22, 26),
                  child: AnimePrimaryButton(
                    label: 'متابعة',
                    height: AppDimens.buttonHeightXl,
                    borderRadius: AppDimens.radiusMd,
                    gradient: AppColors.ctaGradient,
                    onPressed: () async {
                      // تُعرض مرة واحدة فقط؛ الإعدادات تبقى مدخلاً دائماً.
                      await sl<PersonalizeStorage>().markDone();
                      if (!context.mounted) return;
                      // قادمة من الإعدادات: نرجع لها. أول تشغيل: لا يوجد ما
                      // نرجع إليه، فندخل التطبيق الرئيسي.
                      if (context.router.canPop()) {
                        await context.router.maybePop();
                      } else {
                        await context.router.replace(
                          const MainNavigationRoute(),
                        );
                      }
                    },
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
