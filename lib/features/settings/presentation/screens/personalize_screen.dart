import 'package:auto_route/auto_route.dart';
import '../../../../core/l10n/app_strings.dart';
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
import '../../../visuals/domain/visual_slot.dart';
import '../../../visuals/presentation/managed_artwork.dart';

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
                        context.strings('personalizeTitle'),
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontFamily: 'Tajawal',
                          fontSize: 25,
                          letterSpacing: -0.5,
                          fontWeight: AppDimens.weightBlack,
                        ),
                      ),
                      const SizedBox(height: 7),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          // [CRITICAL] `Flexible` لا `FractionallySizedBox`: الصفّ
                          // يعطي أطفاله غير المرنة عرضاً غير محدود، فكان عرض
                          // الوصف `0.84 × ∞` — انهار تخطيط الشاشة كلها فظهرت
                          // بيضاء. الوصف يأخذ معظم ما يتبقّى بعد الرسم، والخطّ
                          // الباقي. (test/personalize_screen_test.dart)
                          Flexible(
                            flex: 5,
                            child: Text(
                              context.strings('personalizeBody'),
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontSize: 13.5,
                                height: 1.75,
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(bottom: 3),
                              child: Container(
                                height: 1.5,
                                color: AppColors.secondary,
                              ),
                            ),
                          ),
                          const ManagedArtwork(
                            slot: VisualSlots.personalize,
                            fallbackAsset: 'assets/art/opt/a-i4.png',
                            width: 126,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                // ── الاختيارات ──
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(22, 16, 22, 8),
                    children: [
                      OtakuGroupLabel(
                        label: context.strings('language'),
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
                                      ? context.strings('defaultLanguage')
                                      : language.nativeName,
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
                      OtakuGroupLabel(
                        label: context.strings('appearance'),
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
                                  label: context.strings('themeLight'),
                                  selected: !state.isDark,
                                  onTap: () => themeCubit.setDark(false),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: ThemePreviewCard(
                                  dark: true,
                                  label: context.strings('themeDark'),
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
                    label: context.strings('continueLabel'),
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
