import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design_system/design_system.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/l10n/gender.dart';
import 'cubit/auth_cubit.dart';
import 'cubit/auth_state.dart';

/// حاجز إكمال الجنس (D5) — تحت حاجزَي التحديث والاتصال، فوق كل الشاشات.
///
/// [CRITICAL] الجنس إلزاميٌّ وفئتان فقط: ذكر وأنثى. لا فئة ثالثة. حسابُ زبونٍ
/// موثَّق بلا جنس (أُنشئ قبل إضافة الحقل) خللُ بياناتٍ لا حالة، يُصحَّح من
/// مصدره — الزبون نفسه — ولا يُخمَّن له شيء. فالحاجز يُعرض بلا «تخطٍّ» ولا
/// «لاحقاً» ولا خيارٍ ثالث، ويُرفع وحده حين يحفظ الخادم الاختيار.
///
/// لمن يعمل:
/// - **زبونٌ مسجَّل** جنسه غير معروف. الحكم من الجلسة وحدها: بيانات
///   `/auth/me` بعد الإقلاع، أو ردّ الدخول.
/// - **لا الزائر**: لا حساب له، فيبقى على الصيغة المحايدة.
/// - **لا حساب المسؤول**: العقد على حسابات الزبائن (المسؤول لا يُنشأ
///   بالتسجيل ولا يدخل في تحليلات الزبائن).
///
/// [CRITICAL] الحاجز **يغطّي** الشجرة ولا **يستبدلها** — بخلاف حاجز التحديث.
/// يُعرض لحظة نجاح الدخول، وشاشة الدخول تنتظر `login()` ثم تنتقل إن بقيت
/// مركّبة (`if (!mounted) return`). استبدالُ الشجرة كان سيفكّها فيضيع الانتقال
/// ويعود المستخدم بعد الاختيار إلى شاشة دخولٍ وهو مسجَّل. لذا تبقى الشجرة
/// مركّبةً تحته لكن: لا تُرسم ولا تُلمس (`Offstage`)، ولا تتحرّك (`TickerMode`)،
/// ولا تأخذ التركيز (`ExcludeFocus` — لا لوحة مفاتيح لحقلٍ مخفي).
class GenderRequiredGate extends StatelessWidget {
  const GenderRequiredGate({super.key, required this.child});

  final Widget child;

  /// هل تحجب هذه الحالة التطبيق؟ عامّةٌ ليختبرها الاختبار مباشرةً.
  static bool blocks(AuthState state) =>
      state is AuthAuthenticated &&
      state.user.role != 'admin' &&
      !AppGender.fromValue(state.user.gender).isKnown;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthCubit, AuthState>(
      buildWhen: (previous, current) => blocks(previous) != blocks(current),
      builder: (context, state) {
        final blocked = blocks(state);
        // [CRITICAL] بنيةٌ ثابتة في الحالتين: الابن في الموضع نفسه دائماً،
        // فلا تضيع حالته حين يُرفع الحاجز أو يُعرض.
        return Stack(
          children: [
            ExcludeFocus(
              excluding: blocked,
              child: TickerMode(
                enabled: !blocked,
                child: Offstage(offstage: blocked, child: child),
              ),
            ),
            if (blocked)
              Positioned.fill(
                // Navigator خاص يمنح الشاشة Overlay ومساراً (للتنبيهات)؛
                // و`HeroControllerScope.none` لأن موجّه التطبيق ما يزال مركّباً
                // تحته، ولا يجوز أن يتشارك Navigatorان متحكّم Hero واحداً.
                child: HeroControllerScope.none(
                  child: Navigator(
                    onGenerateRoute: (settings) => MaterialPageRoute<void>(
                      settings: settings,
                      builder: (_) => const GenderRequiredScreen(),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// شاشة إكمال الجنس — بطاقتان، وزرّ حفظ، ولا مخرج سوى الخروج من الحساب.
///
/// «تسجيل الخروج» ليس تخطّياً: لا يُكمل به أحدٌ استعمال حسابٍ بلا جنس، بل
/// يعود زائراً. وجوده يمنع طريقاً مسدوداً على هاتفٍ ليس لصاحب الحساب.
class GenderRequiredScreen extends StatefulWidget {
  const GenderRequiredScreen({super.key});

  @override
  State<GenderRequiredScreen> createState() => _GenderRequiredScreenState();
}

class _GenderRequiredScreenState extends State<GenderRequiredScreen> {
  AppGender? _picked;
  bool _saving = false;
  bool _showRequired = false;

  Future<void> _save() async {
    final picked = _picked;
    if (picked == null) {
      setState(() => _showRequired = true);
      return;
    }
    setState(() => _saving = true);
    try {
      // نجاح الحفظ يرفع الحاجز من تلقائه: `AuthCubit` يُصدر الجلسة بالجنس
      // الجديد، فلا انتقال ولا إغلاق هنا.
      await context.read<AuthCubit>().updateProfile(gender: picked.value);
    } catch (e) {
      if (!mounted) return;
      final text = e is AppException ? e.localizedMessage(context).trim() : '';
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              text.isNotEmpty ? text : context.strings('unexpectedError'),
            ),
            backgroundColor: context.themeColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return PopScope(
      canPop: false,
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
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 20,
                      ),
                      child: ResponsiveContentFrame(
                        maxWidth: kFormMaxWidth,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Container(
                              key: const Key('gender_gate_card'),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.surface,
                                borderRadius: BorderRadius.circular(
                                  AppDimens.radiusXl,
                                ),
                                border: Border.all(
                                  color: theme.colorScheme.outlineVariant,
                                ),
                                boxShadow: colors.shadowFloating,
                              ),
                              padding: const EdgeInsets.fromLTRB(
                                22,
                                28,
                                22,
                                24,
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  // [CRITICAL] (البوّابة ١٠، 2026-10-12) العنوان
                                  // سطرٌ يُصغَّر أولاً، والرسالة والتنبيه فقرات،
                                  // وكلٌّ يحجز أطول ترجماته: الكردية أطول بسطر
                                  // أو اثنين فكانت البطاقة تطول ٢٣–٦٢ وتُنزل
                                  // البطاقتين والزرّين.
                                  BoundedText(
                                    context.strings('genderGateTitle'),
                                    maxLines: 3,
                                    reserveFor: AppStrings.across(
                                      'genderGateTitle',
                                    ),
                                    alignment: AlignmentDirectional.topStart,
                                    style: theme.textTheme.headlineSmall
                                        ?.copyWith(
                                          fontFamily: AppFonts.heading,
                                          fontFamilyFallback: AppFonts.headingFallback,
                                          fontSize: 22,
                                          height: 1.35,
                                          fontWeight: AppDimens.weightBlack,
                                        ),
                                  ),
                                  const SizedBox(height: 10),
                                  BoundedText(
                                    context.strings('genderGateMessage'),
                                    maxLines: 12,
                                    minScale: 1,
                                    reserveFor: AppStrings.across(
                                      'genderGateMessage',
                                    ),
                                    alignment: AlignmentDirectional.topStart,
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                      fontSize: 14,
                                      height: 1.85,
                                      color: theme.colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                  const SizedBox(height: 22),
                                  GenderSelector(
                                    value: _picked,
                                    label: context.strings('genderPickerNote'),
                                    labelTranslations: AppStrings.across(
                                      'genderPickerNote',
                                    ),
                                    errorText: _showRequired && _picked == null
                                        ? context.strings('genderRequired')
                                        : null,
                                    onChanged: _saving
                                        ? (_) {}
                                        : (value) => setState(() {
                                            _picked = value;
                                            _showRequired = false;
                                          }),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 22),
                            AnimePrimaryButton(
                              key: const Key('gender_gate_save'),
                              label: context.strings('save'),
                              loading: _saving,
                              onPressed: _saving ? null : _save,
                              height: AppDimens.buttonHeightXl,
                            ),
                            const SizedBox(height: 10),
                            TextButton(
                              key: const Key('gender_gate_logout'),
                              onPressed: _saving
                                  ? null
                                  : () => context.read<AuthCubit>().logout(),
                              child: Text(context.strings('logout')),
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
