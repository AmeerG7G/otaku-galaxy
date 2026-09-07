import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/gender.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/router/app_router.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../auth/presentation/cubit/auth_state.dart';
import '../../../../core/auth/require_auth.dart';
import '../../data/notification_prefs_repository.dart';
import '../../data/notification_prefs_storage.dart';
import '../cubit/theme_cubit.dart';
import '../cubit/theme_state.dart';

/// الإعدادات بتصميم Otaku Galaxy v2.
///
/// ترويسة مضغوطة، ثم مجموعتان معنونتان بأحرف متباعدة: «الحساب» و«إعدادات
/// الإشعارات». اللغة والمظهر صفّ واحد يفتح شاشة التخصيص ويعرض المظهر
/// الحالي — كما في المصدر — وكل نموذج يظهر في ورقة سفلية بدل حوار مادي.
@RoutePage()
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _prefsRepo = sl<NotificationPrefsRepository>();

  /// ما يُرسم الآن. يبدأ من الذاكرة المؤقّتة كي لا تومض الشاشة فارغة، ثم
  /// يُستبدل بما يقوله الخادم.
  late Map<NotificationPref, bool> _prefs = _prefsRepo.cached();

  /// تحميل أول من الخادم — يخصّ المسجّلين وحدهم.
  bool _loadingPrefs = false;

  /// تعذّر جلب الحالة من الخادم: نقولها بدل أن نعرض الذاكرة المؤقّتة كأنها
  /// الحقيقة.
  bool _prefsFailed = false;

  /// المفاتيح التي يجري حفظها الآن — الزرّ يُعطَّل ريثما يردّ الخادم.
  final Set<NotificationPref> _saving = {};

  @override
  void initState() {
    super.initState();
    _loadPrefs();
  }

  /// الزائر لا يملك تفضيلات على الخادم أصلاً، فلا نطلبها منه.
  bool get _isLoggedIn => context.read<AuthCubit>().isLoggedIn;

  Future<void> _loadPrefs() async {
    if (!_isLoggedIn) return;
    setState(() {
      _loadingPrefs = true;
      _prefsFailed = false;
    });
    try {
      final prefs = await _prefsRepo.fetch();
      if (!mounted) return;
      setState(() => _prefs = prefs);
    } catch (_) {
      if (!mounted) return;
      setState(() => _prefsFailed = true);
    } finally {
      if (mounted) setState(() => _loadingPrefs = false);
    }
  }

  /// تبديل مفتاح واحد.
  ///
  /// [CRITICAL] لا يُغيَّر الزرّ قبل أن يؤكّد الخادم. التفاؤل هنا يعني أن
  /// مستخدماً أطفأ إشعارات العروض ورأى الزرّ منطفئاً بينما بقي الخادم يرسلها
  /// — عطلٌ لا يكتشفه إلا حين تصله رسالة ظنّ أنه أوقفها.
  Future<void> _togglePref(NotificationPref pref, bool value) async {
    final authenticated = await requireAuthentication(
      context,
      title: context.g(GenderedStrings.loginFirst),
      body: 'تُحفظ تفضيلات الإشعارات في حسابك وتُطبَّق على كل أجهزتك.',
    );
    if (!authenticated || !mounted) return;

    setState(() => _saving.add(pref));
    try {
      final prefs = await _prefsRepo.setEnabled(pref, value);
      if (!mounted) return;
      setState(() => _prefs = prefs);
    } catch (e) {
      if (!mounted) return;
      // الزرّ يبقى على حاله الأول لأننا لم نغيّره أصلاً.
      _showSnack(_messageOf(e), success: false);
    } finally {
      if (mounted) setState(() => _saving.remove(pref));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // عمودٌ موسَّط بعرض القراءة على اللوح — القائمة الممتدّة بعرض
      // ١٣٦٦ بكسل تصير صفوفاً فارغة الوسط. لا أثر له على الهاتف.
      body: ResponsiveContentFrame(
        maxWidth: kReadingMaxWidth,
        child: Column(
          children: [
            OtakuScreenHeader.compact(
              title: 'الإعدادات',
              onBack: () => context.router.maybePop(),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 26),
                children: [
                  const OtakuGroupLabel(label: 'الحساب'),
                  OtakuSettingRow(
                    icon: Icons.person_outline,
                    iconColor: AppColors.accentCyan,
                    label: 'تعديل اسم الحساب',
                    onTap: _editDisplayName,
                  ),
                  const SizedBox(height: 9),
                  // الجنس — يُستعمل لتصريف الخطاب العربي في التطبيق. تُعرض
                  // القيمة الحالية، و«لم يُحدَّد» لمن أنشأ حسابه قبل الحقل.
                  BlocBuilder<AuthCubit, AuthState>(
                    builder: (context, _) {
                      final gender = AppGender.fromValue(
                        context.read<AuthCubit>().user?.gender,
                      );
                      return OtakuSettingRow(
                        icon: gender == AppGender.female
                            ? Icons.female_rounded
                            : Icons.male_rounded,
                        iconColor: AppColors.secondary,
                        label: GenderedStrings.genderLabel,
                        value: switch (gender) {
                          AppGender.male => GenderedStrings.male,
                          AppGender.female => GenderedStrings.female,
                          AppGender.unknown => GenderedStrings.genderNotSet,
                        },
                        onTap: _editGender,
                      );
                    },
                  ),
                  const SizedBox(height: 9),
                  OtakuSettingRow(
                    icon: Icons.lock_outline,
                    iconColor: AppColors.accent,
                    label: 'إعادة تعيين كلمة المرور',
                    onTap: _changePassword,
                  ),
                  const SizedBox(height: 9),
                  // اللغة والمظهر صفّ واحد يفتح شاشة التخصيص، ويعرض المظهر
                  // الحالي كقيمة — لا تُكرَّر بطاقات المعاينة هنا.
                  BlocBuilder<ThemeCubit, ThemeState>(
                    builder: (context, state) => OtakuSettingRow(
                      icon: Icons.brightness_6_outlined,
                      iconColor: AppColors.primary,
                      label: 'اللغة والمظهر',
                      value: state.isDark ? 'داكن' : 'فاتح',
                      onTap: () =>
                          context.router.push(const PersonalizeRoute()),
                    ),
                  ),

                  const OtakuGroupLabel(
                    label: 'إعدادات الإشعارات',
                    padding: EdgeInsets.fromLTRB(0, 24, 0, 11),
                  ),
                  if (_prefsFailed) ...[
                    _PrefsUnavailableNote(onRetry: _loadPrefs),
                    const SizedBox(height: 9),
                  ],
                  for (final pref in NotificationPref.values) ...[
                    if (pref != NotificationPref.values.first)
                      const SizedBox(height: 9),
                    OtakuSettingRow(
                      label: pref.label,
                      compact: true,
                      showChevron: false,
                      // يُعطَّل أثناء الجلب الأول وأثناء حفظ هذا المفتاح:
                      // نقرتان متتاليتان قبل ردّ الخادم تتركان الواجهة على
                      // حالة لا تطابق ما حُفظ. `OtakuSwitch` لا يعرف حالة
                      // «معطَّل»، فنمنع اللمس حوله بدل تعديل نظام التصميم.
                      trailing: _PrefSwitch(
                        value: _prefs[pref] ?? pref.defaultValue,
                        busy: _loadingPrefs || _saving.contains(pref),
                        onChanged: (v) => _togglePref(pref, v),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// تعديل اسم المستخدم — ورقة سفلية بحقل واحد.
  Future<void> _editDisplayName() async {
    final auth = context.read<AuthCubit>();
    final controller = TextEditingController(text: auth.user?.username ?? '');

    // تُغلق الورقة بحفظ أو بسحب أو بزر الرجوع — و`finally` يغطّي الثلاثة.
    try {
      final newName = await showOtakuSheet<String>(
        context: context,
        builder: (sheetContext) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
          ),
          child: OtakuSheet(
            title: 'تعديل اسم الحساب',
            titleSize: 19,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimeTextField(
                  controller: controller,
                  label: 'اسم المستخدم',
                  hint: context.g(GenderedStrings.enterNewName),
                  prefixIcon: Icons.person_outline,
                ),
                const SizedBox(height: 20),
                AnimePrimaryButton(
                  label: 'حفظ',
                  onPressed: () =>
                      Navigator.of(sheetContext).pop(controller.text),
                ),
              ],
            ),
          ),
        ),
      );

      if (newName == null || newName.trim().isEmpty) return;
      try {
        await auth.updateProfile(username: newName.trim());
        if (!mounted) return;
        _showSnack('تم تحديث الاسم', success: true);
      } catch (e) {
        if (!mounted) return;
        _showSnack(_messageOf(e), success: false);
      }
    } finally {
      controller.dispose();
    }
  }

  /// تعديل الجنس — نفس البطاقتين المرئيتين المستعملتين في التسجيل.
  ///
  /// [CRITICAL] لا حقل نصّي هنا كما لا حقل هناك: ودجة واحدة لاختيارٍ واحد،
  /// فلا تتباعد التسمية ولا السلوك بين الشاشتين. والاختيار يُحفظ خادمياً
  /// ويُتحقَّق منه هناك — التطبيق لا يقرّر ما يُقبل.
  ///
  /// لا خيار «مجهول» في الورقة: المجهول حالةُ من لم يُسأل بعد، لا اختيارٌ
  /// يُعرض على من فُتحت له الشاشة ليختار.
  Future<void> _editGender() async {
    final auth = context.read<AuthCubit>();
    final current = AppGender.fromValue(auth.user?.gender);

    final picked = await showOtakuSheet<AppGender>(
      context: context,
      builder: (sheetContext) => OtakuSheet(
        title: GenderedStrings.genderLabel,
        titleSize: 19,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            GenderSelector(
              value: current.isKnown ? current : null,
              label: 'اختيارك يُستخدم لمخاطبتك بالصيغة الصحيحة.',
              onChanged: (value) => Navigator.of(sheetContext).pop(value),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );

    if (picked == null || picked == current) return;
    try {
      await auth.updateProfile(gender: picked.value);
      if (!mounted) return;
      _showSnack('تم تحديث الاختيار', success: true);
    } catch (e) {
      if (!mounted) return;
      _showSnack(_messageOf(e), success: false);
    }
  }

  /// تغيير كلمة المرور — ورقة سفلية بنموذج مُتحقَّق منه.
  Future<void> _changePassword() async {
    final auth = context.read<AuthCubit>();
    final formKey = GlobalKey<FormState>();
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final confirmCtrl = TextEditingController();

    // [CRITICAL] هذه الحقول تحمل كلمات مرور بنصّها الصريح. تركها بلا
    // تحرير يبقي النصّ حيّاً في الذاكرة طوال عمر العملية بعد إغلاق
    // الورقة — لا لدقائق بل إلى أن يُقتل التطبيق. التحرير هنا يُنهي
    // ذلك عند الإغلاق مهما كان سببه.
    try {
      final confirmed = await showOtakuSheet<bool>(
        context: context,
        builder: (sheetContext) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
          ),
          child: OtakuSheet(
            title: 'إعادة تعيين كلمة المرور',
            titleSize: 19,
            child: SingleChildScrollView(
              child: Form(
                key: formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AnimeTextField(
                      controller: currentCtrl,
                      label: 'كلمة المرور الحالية',
                      obscureText: true,
                      prefixIcon: Icons.lock_outline,
                      validator: (v) =>
                          (v == null || v.isEmpty) ? 'مطلوب' : null,
                    ),
                    const SizedBox(height: 12),
                    AnimeTextField(
                      controller: newCtrl,
                      label: 'كلمة المرور الجديدة',
                      obscureText: true,
                      prefixIcon: Icons.lock_outline,
                      validator: (v) => (v == null || v.length < 6)
                          ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
                          : null,
                    ),
                    const SizedBox(height: 12),
                    AnimeTextField(
                      controller: confirmCtrl,
                      label: 'تأكيد كلمة المرور الجديدة',
                      obscureText: true,
                      prefixIcon: Icons.lock_outline,
                      validator: (v) => v != newCtrl.text
                          ? 'كلمتا المرور غير متطابقتين'
                          : null,
                    ),
                    const SizedBox(height: 20),
                    AnimePrimaryButton(
                      label: 'حفظ',
                      onPressed: () {
                        if (formKey.currentState!.validate()) {
                          Navigator.of(sheetContext).pop(true);
                        }
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );

      if (confirmed != true) return;
      try {
        await auth.changePassword(
          currentPassword: currentCtrl.text,
          newPassword: newCtrl.text,
        );
        if (!mounted) return;
        _showSnack('تم تغيير كلمة المرور بنجاح', success: true);
      } catch (e) {
        if (!mounted) return;
        _showSnack(_messageOf(e), success: false);
      }
    } finally {
      currentCtrl.dispose();
      newCtrl.dispose();
      confirmCtrl.dispose();
    }
  }

  String _messageOf(Object e) {
    if (e is AppException && e.message.trim().isNotEmpty) return e.message;
    return 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى';
  }

  void _showSnack(String message, {required bool success}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: success
              ? context.themeColors.success
              : context.themeColors.error,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          ),
          margin: const EdgeInsets.all(18),
        ),
      );
  }
}

/// تعذّر جلب التفضيلات من الخادم.
///
/// تُقال صراحةً بدل عرض الذاكرة المؤقّتة كأنها الحقيقة: المستخدم يرى أزراراً
/// قد لا تطابق ما يطبّقه الخادم، ومن حقّه أن يعرف ذلك ويعيد المحاولة.
class _PrefsUnavailableNote extends StatelessWidget {
  const _PrefsUnavailableNote({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return OtakuPanel(
      elevated: false,
      color: colors.error.withValues(alpha: 0.08),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Icon(
            Icons.cloud_off_outlined,
            size: AppDimens.iconSm,
            color: colors.error,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'تعذّر تحميل تفضيلاتك، أعد المحاولة.',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(fontSize: 12),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('إعادة')),
        ],
      ),
    );
  }
}

/// زرّ تفضيل واحد مع حالة انشغال.
class _PrefSwitch extends StatelessWidget {
  const _PrefSwitch({
    required this.value,
    required this.busy,
    required this.onChanged,
  });

  final bool value;
  final bool busy;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      ignoring: busy,
      child: Opacity(
        opacity: busy ? 0.5 : 1,
        child: OtakuSwitch(value: value, onChanged: onChanged),
      ),
    );
  }
}
