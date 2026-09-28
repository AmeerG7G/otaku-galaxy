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
import '../../../visuals/presentation/character_artwork.dart';

/// شاشة التخصيص بتصميم Otaku Galaxy v2.
///
/// تظهر مرة واحدة بعد أول دخول/تسجيل: يختار العميل لغته ومظهره قبل دخول
/// المتجر. الاختيار يُطبَّق فوراً (الـCubits تحفظه محلياً)، ويبقى متاحاً
/// لاحقاً من الإعدادات.
@RoutePage()
class PersonalizeScreen extends StatelessWidget {
  const PersonalizeScreen({super.key});

  /// الفاصل تحت العنوان — الرسم ملاصقٌ له من تحته (تحرسه الاختبارات).
  static const Key dividerKey = Key('personalize_divider');

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: Stack(
        children: [
          // المصدر يضع الهالة على اليمين الفيزيائي (right)، أي `start` في
          // واجهة عربية.
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
          // [PRODUCT] التسلسل (2026-09-28): العنوان ← الفاصل ← الشخصية ←
          // «اختر لغتك…» ← الاختيارات. كانت الشخصية تطفو أعلى اليسار فوق
          // الترويسة (`top: 60`) والنصّ الوصفي تحت العنوان فوق الفاصل؛ الآن
          // تقف الشخصية تحت الفاصل ملاصقةً له، والنصّ تحتها. كلّها داخل
          // `SafeArea`، فلا شيء تحت شريط الحالة.
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── الترويسة: الشعار ثم العنوان فوق فاصلٍ بعرض الترويسة ──
                Padding(
                  padding: const EdgeInsets.fromLTRB(22, 26, 22, 0),
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
                      const SizedBox(height: 16),
                      Container(
                        key: dividerKey,
                        height: 1.5,
                        color: AppColors.secondary,
                      ),
                    ],
                  ),
                ),

                // ── الشخصية ثم الوصف ثم الاختيارات ──
                Expanded(
                  // بلا حشوة علوية: أوّل ما في القائمة الشخصيةُ ملاصقةً للفاصل.
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(22, 0, 22, 8),
                    children: [
                      // جهة النهاية (اليسار الفيزيائي) كما كانت، مقابل
                      // الهالة أعلى اليمين. صندوقٌ ثابت لا عرضٌ وحده: الصورة
                      // في مجرى القائمة، وبلا ارتفاعٍ معلوم تبدأ بارتفاع صفر
                      // حتى تُفكّ فيقفز النصّ تحتها. ١٢٦×١٢٩ شكلُ الصورة 34؛
                      // صورةٌ بديلة بشكلٍ آخر تُحتوى داخله ملاصقةً للفاصل
                      // (`topCenter`).
                      const Align(
                        alignment: AlignmentDirectional.centerEnd,
                        child: IgnorePointer(
                          child: CharacterArtwork(
                            slot: VisualSlots.personalize,
                            width: 126,
                            height: 129,
                            alignment: Alignment.topCenter,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        context.strings('personalizeBody'),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 13.5,
                          height: 1.75,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 24),
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
