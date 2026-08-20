import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../cubit/theme_cubit.dart';
import '../cubit/theme_state.dart';

@RoutePage()
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _notifications = true;
  String _language = 'العربية';

  @override
  Widget build(BuildContext context) {
    final theme = context.read<ThemeCubit>();
    final colors = context.themeColors;

    return Scaffold(
      appBar: AppBar(title: const Text('الإعدادات'), centerTitle: true),
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: ListView(
          padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
          children: [
            // اللغة
            _buildSectionCard(
              title: 'اللغة',
              icon: Icons.language_outlined,
              children: [_buildLanguageSelector()],
            ),

            SizedBox(height: AppDimens.space5),

            // الإشعارات
            _buildSectionCard(
              title: 'الإشعارات',
              icon: Icons.notifications_outlined,
              children: [
                _buildNotificationToggle(
                  title: 'الإشعارات العامة',
                  subtitle: 'تلقي إشعارات حول العروض والطلبات',
                  value: _notifications,
                  onChanged: (v) => setState(() => _notifications = v),
                ),
              ],
            ),

            SizedBox(height: AppDimens.space5),

            // المظهر
            _buildSectionCard(
              title: 'المظهر',
              icon: Icons.palette_outlined,
              children: [_buildThemeSelector(theme)],
            ),

            SizedBox(height: AppDimens.space10),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionCard({
    required String title,
    required IconData icon,
    required List<Widget> children,
  }) {
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
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    gradient: context.themeColors.primaryGradient,
                    borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  ),
                  child: Icon(
                    icon,
                    color: Colors.white,
                    size: AppDimens.iconMd,
                  ),
                ),
                SizedBox(width: AppDimens.space3),
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
              ],
            ),
            SizedBox(height: AppDimens.space4),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _buildLanguageSelector() {
    return Column(
      children: [
        _buildLanguageOption(
          label: 'العربية',
          icon: Icons.translate,
          selected: _language == 'العربية',
          onTap: () => setState(() => _language = 'العربية'),
        ),
        _buildDivider(),
        _buildLanguageOption(
          label: 'English',
          icon: Icons.language,
          selected: _language == 'English',
          onTap: () => setState(() => _language = 'English'),
        ),
      ],
    );
  }

  Widget _buildLanguageOption({
    required String label,
    required IconData icon,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppDimens.radiusMd),
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: AppDimens.space3),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                gradient: selected ? context.themeColors.primaryGradient : null,
                color: selected
                    ? null
                    : Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                border: Border.all(
                  color: selected
                      ? Colors.transparent
                      : Theme.of(context).colorScheme.outlineVariant,
                  width: AppDimens.cardBorderWidth,
                ),
              ),
              child: Icon(
                icon,
                color: selected
                    ? Colors.white
                    : Theme.of(context).colorScheme.onSurfaceVariant,
                size: AppDimens.iconMd,
              ),
            ),
            SizedBox(width: AppDimens.space3),
            Expanded(
              child: Text(
                label,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: selected
                      ? AppDimens.weightBold
                      : AppDimens.weightMedium,
                ),
              ),
            ),
            if (selected)
              Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  gradient: context.themeColors.primaryGradient,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.check, size: 12, color: Colors.white),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildNotificationToggle({
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: AppDimens.weightMedium,
                ),
              ),
              SizedBox(height: AppDimens.space1),
              Text(
                subtitle,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        Switch(
          value: value,
          onChanged: onChanged,
          activeThumbColor: Theme.of(context).colorScheme.primary,
          activeTrackColor: Theme.of(context).colorScheme.primaryContainer,
          inactiveThumbColor: Theme.of(context).colorScheme.outline,
          inactiveTrackColor: Theme.of(context).colorScheme.outlineVariant,
        ),
      ],
    );
  }

  Widget _buildThemeSelector(ThemeCubit theme) {
    return BlocBuilder<ThemeCubit, ThemeState>(
      builder: (context, state) {
        return Column(
          children: [
            _buildThemeOption(
              title: 'فاتح',
              subtitle: 'مظهر فاتح دائماً',
              icon: Icons.light_mode_outlined,
              selected: !state.isDark,
              onTap: () => theme.setDark(false),
            ),
            _buildDivider(),
            _buildThemeOption(
              title: 'داكن',
              subtitle: 'مظهر داكن دائماً',
              icon: Icons.dark_mode_outlined,
              selected: state.isDark,
              onTap: () => theme.setDark(true),
            ),
          ],
        );
      },
    );
  }

  Widget _buildThemeOption({
    required String title,
    required String subtitle,
    required IconData icon,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppDimens.radiusMd),
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: AppDimens.space3),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                gradient: selected ? context.themeColors.primaryGradient : null,
                color: selected
                    ? null
                    : Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                border: Border.all(
                  color: selected
                      ? Colors.transparent
                      : Theme.of(context).colorScheme.outlineVariant,
                  width: AppDimens.cardBorderWidth,
                ),
              ),
              child: Icon(
                icon,
                color: selected
                    ? Colors.white
                    : Theme.of(context).colorScheme.onSurfaceVariant,
                size: AppDimens.iconMd,
              ),
            ),
            SizedBox(width: AppDimens.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontWeight: selected
                          ? AppDimens.weightBold
                          : AppDimens.weightMedium,
                    ),
                  ),
                  SizedBox(height: AppDimens.space1),
                  Text(
                    subtitle,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            if (selected)
              Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  gradient: context.themeColors.primaryGradient,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.check, size: 12, color: Colors.white),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildDivider() {
    return Divider(
      height: 1,
      color: Theme.of(context).colorScheme.outlineVariant,
    );
  }
}
