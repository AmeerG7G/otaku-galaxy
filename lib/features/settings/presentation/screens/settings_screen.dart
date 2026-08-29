import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/router/app_router.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
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
  final _notifPrefs = sl<NotificationPrefsStorage>();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
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
                    onTap: () => context.router.push(const PersonalizeRoute()),
                  ),
                ),

                const OtakuGroupLabel(
                  label: 'إعدادات الإشعارات',
                  padding: EdgeInsets.fromLTRB(0, 24, 0, 11),
                ),
                for (final pref in NotificationPref.values) ...[
                  if (pref != NotificationPref.values.first)
                    const SizedBox(height: 9),
                  OtakuSettingRow(
                    label: pref.label,
                    compact: true,
                    showChevron: false,
                    trailing: OtakuSwitch(
                      value: _notifPrefs.isEnabled(pref),
                      onChanged: (v) async {
                        await _notifPrefs.setEnabled(pref, v);
                        if (mounted) setState(() {});
                      },
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// تعديل اسم المستخدم — ورقة سفلية بحقل واحد.
  Future<void> _editDisplayName() async {
    final auth = context.read<AuthCubit>();
    final controller = TextEditingController(text: auth.user?.username ?? '');

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
                hint: 'أدخل اسمك الجديد',
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
  }

  /// تغيير كلمة المرور — ورقة سفلية بنموذج مُتحقَّق منه.
  Future<void> _changePassword() async {
    final auth = context.read<AuthCubit>();
    final formKey = GlobalKey<FormState>();
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final confirmCtrl = TextEditingController();

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
                    validator: (v) => (v == null || v.isEmpty) ? 'مطلوب' : null,
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
                    validator: (v) =>
                        v != newCtrl.text ? 'كلمتا المرور غير متطابقتين' : null,
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
