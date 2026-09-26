import 'package:auto_route/auto_route.dart';
import '../../../../core/l10n/app_strings.dart';
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
import '../../../../core/constants/validation_rules.dart';
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
      title: context.gNow(GenderedStrings.loginFirst),
      body: context.strings('loginRequiredForPrefs'),
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
              title: context.strings('settings'),
              onBack: () => context.router.maybePop(),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 26),
                children: [
                  OtakuGroupLabel(label: context.strings('account')),
                  OtakuSettingRow(
                    icon: Icons.person_outline,
                    iconColor: AppColors.accentCyan,
                    label: context.strings('editDisplayName'),
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
                        label: context.strings('gender'),
                        value: switch (gender) {
                          AppGender.male => context.strings('genderMale'),
                          AppGender.female => context.strings('genderFemale'),
                          AppGender.unknown => context.strings('genderNotSet'),
                        },
                        onTap: _editGender,
                      );
                    },
                  ),
                  const SizedBox(height: 9),
                  OtakuSettingRow(
                    icon: Icons.lock_outline,
                    iconColor: AppColors.accent,
                    label: context.strings('resetPassword'),
                    onTap: _changePassword,
                  ),
                  const SizedBox(height: 9),
                  // اللغة والمظهر صفّ واحد يفتح شاشة التخصيص، ويعرض المظهر
                  // الحالي كقيمة — لا تُكرَّر بطاقات المعاينة هنا.
                  BlocBuilder<ThemeCubit, ThemeState>(
                    builder: (context, state) => OtakuSettingRow(
                      icon: Icons.brightness_6_outlined,
                      iconColor: AppColors.primary,
                      label: context.strings('languageAndTheme'),
                      value: state.isDark ? context.strings('themeDark') : context.strings('themeLight'),
                      onTap: () =>
                          context.router.push(const PersonalizeRoute()),
                    ),
                  ),

                  OtakuGroupLabel(
                    label: context.strings('notificationSettings'),
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
                      label: context.strings(pref.labelKey),
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
  ///
  /// الورقة المشتركة تملك متحكّمها وتحرّره بعد زوالها من الشجرة — لا
  /// `finally` هنا (انظر `OtakuTextPromptSheet`).
  Future<void> _editDisplayName() async {
    final auth = context.read<AuthCubit>();
    final newName = await showOtakuTextPrompt(
      context: context,
      title: context.strings('editDisplayName'),
      saveLabel: context.strings('save'),
      label: context.strings('username'),
      hint: context.gNow(GenderedStrings.enterNewName),
      initialValue: auth.user?.username ?? '',
      prefixIcon: Icons.person_outline,
    );

    if (newName == null || newName.trim().isEmpty || !mounted) return;
    try {
      await auth.updateProfile(username: newName.trim());
      if (!mounted) return;
      _showSnack(context.strings('nameUpdated'), success: true);
    } catch (e) {
      if (!mounted) return;
      _showSnack(_messageOf(e), success: false);
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
        title: context.strings('gender'),
        titleSize: 19,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            GenderSelector(
              value: current.isKnown ? current : null,
              label: context.strings('genderPickerNote'),
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
      _showSnack(context.strings('choiceUpdated'), success: true);
    } catch (e) {
      if (!mounted) return;
      _showSnack(_messageOf(e), success: false);
    }
  }

  /// تغيير كلمة المرور — ورقة سفلية بنموذج مُتحقَّق منه.
  ///
  /// النموذج ([_ChangePasswordForm]) يملك حقوله ويحرّرها بعد زوال الورقة،
  /// ويعيد الكلمتين فقط. الكلمة الحالية تُتحقَّق على الخادم؛ خطؤها يعود
  /// رسالةً (400 `INVALID_CURRENT_PASSWORD`) لا خروجاً من التطبيق، والنجاح
  /// يحفظ التوكن الجديد داخل `AuthCubit.changePassword`.
  Future<void> _changePassword() async {
    final auth = context.read<AuthCubit>();
    final entered = await showOtakuSheet<({String current, String next})>(
      context: context,
      builder: (_) => const _ChangePasswordForm(),
    );
    if (entered == null || !mounted) return;

    try {
      await auth.changePassword(
        currentPassword: entered.current,
        newPassword: entered.next,
      );
      if (!mounted) return;
      _showSnack(context.strings('passwordChanged'), success: true);
    } catch (e) {
      if (!mounted) return;
      _showSnack(_messageOf(e), success: false);
    }
  }

  String _messageOf(Object e) {
    if (e is AppException) {
      final text = e.localizedMessage(context);
      if (text.trim().isNotEmpty) return text;
    }
    return context.strings('unexpectedError');
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
              context.strings('prefsLoadFailed'),
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(fontSize: 12),
            ),
          ),
          TextButton(onPressed: onRetry, child: Text(context.strings('retryShort'))),
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

/// نموذج تغيير كلمة المرور داخل الورقة.
///
/// [CRITICAL] المتحكّمات الثلاثة تحمل كلمات مرور بنصّها الصريح، وتُحرَّر في
/// `dispose` — أي حين تزول الورقة من الشجرة — فلا تبقى حيّة في الذاكرة
/// بعدها. تحريرها قبل ذلك (كما كان في `finally` عند المستدعي) كان يكسر
/// الحقول أثناء حركة الخروج (انظر `OtakuTextPromptSheet`).
///
/// كل حقل له زرّ عين مستقل: المستخدم يرى **نصّه هو** في الحقلين (الحالية
/// والجديدة) ليتأكّد مما كتب. الحدّ الأدنى [kPasswordMinLength] كما يفرضه
/// الخادم؛ كان التطبيق يقبل ٦ فيردّ الخادم برسالةٍ بعد الإرسال.
class _ChangePasswordForm extends StatefulWidget {
  const _ChangePasswordForm();

  @override
  State<_ChangePasswordForm> createState() => _ChangePasswordFormState();
}

class _ChangePasswordFormState extends State<_ChangePasswordForm> {
  final _formKey = GlobalKey<FormState>();
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureConfirm = true;

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.of(context).pop(
      (current: _currentCtrl.text, next: _newCtrl.text),
    );
  }

  /// زرّ إظهار/إخفاء بوصفٍ للقارئ الصوتي — نفس أيقونتي شاشتي الدخول والتسجيل.
  Widget _eye(bool obscured, VoidCallback toggle) {
    return IconButton(
      tooltip: context.strings(obscured ? 'showPassword' : 'hidePassword'),
      icon: Icon(
        obscured ? Icons.visibility_outlined : Icons.visibility_off_outlined,
        size: AppDimens.iconMd,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
      onPressed: toggle,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: OtakuSheet(
        title: context.strings('resetPassword'),
        titleSize: 19,
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimeTextField(
                  controller: _currentCtrl,
                  label: context.strings('currentPassword'),
                  obscureText: _obscureCurrent,
                  prefixIcon: Icons.lock_outline,
                  textInputAction: TextInputAction.next,
                  suffixIcon: _eye(
                    _obscureCurrent,
                    () => setState(() => _obscureCurrent = !_obscureCurrent),
                  ),
                  validator: (v) => (v == null || v.isEmpty)
                      ? context.strings('required')
                      : null,
                ),
                const SizedBox(height: 12),
                AnimeTextField(
                  controller: _newCtrl,
                  label: context.strings('newPassword'),
                  obscureText: _obscureNew,
                  prefixIcon: Icons.lock_outline,
                  textInputAction: TextInputAction.next,
                  suffixIcon: _eye(
                    _obscureNew,
                    () => setState(() => _obscureNew = !_obscureNew),
                  ),
                  validator: (v) => (v == null || v.length < kPasswordMinLength)
                      ? context.strings('passwordMinLength')
                      : null,
                ),
                const SizedBox(height: 12),
                AnimeTextField(
                  controller: _confirmCtrl,
                  label: context.strings('confirmNewPassword'),
                  obscureText: _obscureConfirm,
                  prefixIcon: Icons.lock_outline,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                  suffixIcon: _eye(
                    _obscureConfirm,
                    () => setState(() => _obscureConfirm = !_obscureConfirm),
                  ),
                  validator: (v) => v != _newCtrl.text
                      ? context.strings('passwordsDoNotMatch')
                      : null,
                ),
                const SizedBox(height: 20),
                AnimePrimaryButton(
                  label: context.strings('save'),
                  onPressed: _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
