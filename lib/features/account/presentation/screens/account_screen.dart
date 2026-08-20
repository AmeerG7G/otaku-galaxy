import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/router/app_router.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../auth/presentation/cubit/auth_state.dart';

@RoutePage()
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Scaffold(
      appBar: AppBar(title: const Text('الحساب'), centerTitle: true),
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: BlocBuilder<AuthCubit, AuthState>(
          builder: (context, state) {
            final user = switch (state) {
              AuthAuthenticated(:final user) => user,
              _ => null,
            };
            return CustomScrollView(
              slivers: [
                // رأس الحساب
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
                    child: _buildAccountHeader(context, user),
                  ),
                ),

                // قائمة الخيارات
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: AppDimens.screenHorizontalPadding,
                    ),
                    child: _buildOptionsList(context),
                  ),
                ),

                SliverToBoxAdapter(child: SizedBox(height: AppDimens.space10)),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildAccountHeader(BuildContext context, dynamic user) {
    final colors = context.themeColors;
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
          width: AppDimens.cardBorderWidth,
        ),
      ),
      child: Padding(
        padding: EdgeInsets.all(AppDimens.cardPadding),
        child: Column(
          children: [
            // صورة المستخدم
            Stack(
              alignment: Alignment.bottomRight,
              children: [
                CircleAvatar(
                  radius: AppDimens.avatar2xl / 2,
                  backgroundColor: Theme.of(
                    context,
                  ).colorScheme.primaryContainer,
                  backgroundImage: user?.avatarUrl != null
                      ? NetworkImage(user!.avatarUrl!)
                      : null,
                  child: user?.avatarUrl == null
                      ? Icon(
                          Icons.person,
                          size: AppDimens.iconHero,
                          color: Theme.of(
                            context,
                          ).colorScheme.onPrimaryContainer,
                        )
                      : null,
                ),
                // زر تعديل الصورة
                Container(
                  decoration: BoxDecoration(
                    gradient: colors.primaryGradient,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 3),
                    boxShadow: [
                      BoxShadow(
                        color: colors.glowPrimary,
                        blurRadius: 8,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                  child: IconButton(
                    onPressed: () => _editProfile(context, 'avatar'),
                    icon: Icon(
                      Icons.add,
                      size: AppDimens.iconXs,
                      color: Colors.white,
                    ),
                    padding: EdgeInsets.all(AppDimens.space1),
                    constraints: const BoxConstraints(
                      minWidth: 26,
                      minHeight: 26,
                    ),
                  ),
                ),
              ],
            ),

            SizedBox(height: AppDimens.space4),

            // اسم المستخدم
            Text(
              user?.username ?? 'اسم المستخدم',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: AppDimens.weightBold,
              ),
            ),

            SizedBox(height: AppDimens.space1),

            // رقم الهاتف
            Container(
              padding: EdgeInsets.symmetric(
                horizontal: AppDimens.space3,
                vertical: AppDimens.space1,
              ),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(AppDimens.radiusFull),
              ),
              child: Text(
                user?.phone ?? 'رقم الهاتف',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),

            SizedBox(height: AppDimens.space4),

            // زر تعديل الملف الشخصي
            AnimeOutlinedButton(
              label: 'تعديل الملف الشخصي',
              onPressed: () => _editProfile(context, 'name'),
              icon: Icons.edit_outlined,
              iconPosition: IconPosition.start,
              expanded: false,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOptionsList(BuildContext context) {
    final colors = context.themeColors;

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
          width: AppDimens.cardBorderWidth,
        ),
      ),
      child: Column(
        children: [
          _buildOptionTile(
            context: context,
            icon: Icons.receipt_long_outlined,
            title: 'طلباتي',
            subtitle: 'عرض وتتبع طلباتك',
            onTap: () => context.router.push(const OrdersRoute()),
          ),
          _buildDivider(context),
          _buildOptionTile(
            context: context,
            icon: Icons.settings_outlined,
            title: 'الإعدادات',
            subtitle: 'اللغة، الإشعارات، المظهر',
            onTap: () => context.router.push(const SettingsRoute()),
          ),
          _buildDivider(context),
          _buildOptionTile(
            context: context,
            icon: Icons.info_outline,
            title: 'حول التطبيق',
            subtitle: 'مجرات الاوتاكو - إصدار 1.0.0',
            onTap: () {},
          ),
          _buildDivider(context),
          // تسجيل الخروج
          Padding(
            padding: EdgeInsets.all(AppDimens.cardPadding),
            child: AnimeSecondaryButton(
              label: 'تسجيل الخروج',
              onPressed: () => _confirmLogout(context),
              icon: Icons.logout,
              iconPosition: IconPosition.start,
              expanded: true,
              gradient: LinearGradient(
                colors: [colors.error, colors.errorLight],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOptionTile({
    required BuildContext context,
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      onTap: onTap,
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          gradient: context.themeColors.primaryGradient,
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        ),
        child: Icon(icon, color: Colors.white, size: AppDimens.iconMd),
      ),
      title: Text(
        title,
        style: Theme.of(
          context,
        ).textTheme.titleMedium?.copyWith(fontWeight: AppDimens.weightSemiBold),
      ),
      subtitle: Text(
        subtitle,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
      trailing: Icon(
        Icons.chevron_left,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    );
  }

  Widget _buildDivider(BuildContext context) {
    return Divider(
      height: 1,
      color: Theme.of(context).colorScheme.outlineVariant,
      indent: 56,
      endIndent: AppDimens.screenHorizontalPadding,
    );
  }

  Future<void> _editProfile(BuildContext context, String type) async {
    final auth = context.read<AuthCubit>();

    if (type == 'name') {
      final controller = TextEditingController(text: auth.user?.username ?? '');
      final newName = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimens.radius2xl),
          ),
          title: const Text('تعديل الاسم'),
          content: AnimeTextField(
            controller: controller,
            label: 'اسم المستخدم',
            hint: 'أدخل اسمك الجديد',
            prefixIcon: Icons.person_outline,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(controller.text),
              child: const Text('حفظ'),
            ),
          ],
        ),
      );
      if (newName != null && newName.trim().isNotEmpty) {
        await auth.updateProfile(username: newName.trim());
      }
    } else if (type == 'avatar') {
      // تعديل الصورة عبر رابط صورة (يُقبل من PATCH /auth/me).
      final controller = TextEditingController(
        text: auth.user?.avatarUrl ?? '',
      );
      final avatarFormKey = GlobalKey<FormState>();
      final url = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimens.radius2xl),
          ),
          title: const Text('تغيير الصورة الشخصية'),
          content: Form(
            key: avatarFormKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'أدخل رابط صورة (URL). سيُعرض محلياً ومزامَناً عبر ملفك الشخصي.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
                SizedBox(height: AppDimens.space4),
                AnimeTextField(
                  controller: controller,
                  label: 'رابط الصورة',
                  hint: 'https://example.com/avatar.jpg',
                  prefixIcon: Icons.link,
                  keyboardType: TextInputType.url,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) return null;
                    final uri = Uri.tryParse(value.trim());
                    if (uri == null ||
                        (uri.scheme != 'http' && uri.scheme != 'https')) {
                      return 'أدخل رابطاً صالحاً يبدأ بـ http(s)://';
                    }
                    return null;
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () {
                if (avatarFormKey.currentState!.validate()) {
                  Navigator.of(context).pop(controller.text.trim());
                }
              },
              child: const Text('حفظ'),
            ),
          ],
        ),
      );
      if (url != null) {
        try {
          await auth.updateProfile(avatar: url.isEmpty ? null : url);
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: const Text('تم تحديث الصورة الشخصية'),
                backgroundColor: context.themeColors.success,
                behavior: SnackBarBehavior.floating,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppDimens.radiusLg),
                ),
                margin: EdgeInsets.all(AppDimens.screenHorizontalPadding),
              ),
            );
          }
        } catch (e) {
          if (!context.mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                e is AppException && e.message.trim().isNotEmpty
                    ? e.message
                    : 'تعذر تحديث الصورة، حاول مرة أخرى',
              ),
              backgroundColor: context.themeColors.error,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppDimens.radiusLg),
              ),
              margin: EdgeInsets.all(AppDimens.screenHorizontalPadding),
            ),
          );
        }
      }
    }
  }

  Future<void> _confirmLogout(BuildContext context) async {
    final auth = context.read<AuthCubit>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimens.radius2xl),
        ),
        title: const Text('تسجيل الخروج'),
        content: const Text('هل أنت متأكد من رغبتك في تسجيل الخروج؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
              foregroundColor: Theme.of(context).colorScheme.onError,
            ),
            child: const Text('تسجيل الخروج'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await auth.logout();
    if (context.mounted) {
      context.router.replace(const LoginRoute());
    }
  }
}
