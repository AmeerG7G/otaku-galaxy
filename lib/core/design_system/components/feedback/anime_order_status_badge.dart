import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';

class AnimeOrderStatusBadge extends StatelessWidget {
  const AnimeOrderStatusBadge({
    super.key,
    required this.status,
    this.size = BadgeSize.medium,
  });

  final String status;
  final BadgeSize size;

  @override
  Widget build(BuildContext context) {
    final config = _getStatusConfig(status);
    final padding = switch (size) {
      BadgeSize.small => EdgeInsets.symmetric(
        horizontal: AppDimens.space3,
        vertical: AppDimens.space1,
      ),
      BadgeSize.medium => EdgeInsets.symmetric(
        horizontal: AppDimens.space4,
        vertical: AppDimens.space2,
      ),
      BadgeSize.large => EdgeInsets.symmetric(
        horizontal: AppDimens.space5,
        vertical: AppDimens.space3,
      ),
    };
    final fontSize = switch (size) {
      BadgeSize.small => AppDimens.fontSizeLabelSmall,
      BadgeSize.medium => AppDimens.fontSizeLabelMedium,
      BadgeSize.large => AppDimens.fontSizeLabelLarge,
    };

    return Container(
      padding: padding,
      decoration: BoxDecoration(
        gradient: config.gradient,
        borderRadius: BorderRadius.circular(AppDimens.radiusFull),
        boxShadow: [
          BoxShadow(
            color: config.glowColor.withValues(alpha: 0.3),
            blurRadius: 8,
            spreadRadius: 1,
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(config.icon, size: fontSize + 2, color: Colors.white),
          SizedBox(width: AppDimens.space2),
          Text(
            config.label,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: fontSize,
              fontWeight: AppDimens.weightBold,
              color: Colors.white,
              letterSpacing: AppDimens.letterSpacingWide,
            ),
          ),
        ],
      ),
    );
  }

  _StatusConfig _getStatusConfig(String status) {
    switch (status) {
      case 'طلب جديد':
        return _StatusConfig(
          label: 'طلب جديد',
          icon: Icons.receipt_long,
          gradient: LinearGradient(
            colors: [AppColors.info, AppColors.infoLight],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.info,
        );
      case 'بانتظار تأكيد الإدارة':
        return _StatusConfig(
          label: 'بانتظار التأكيد',
          icon: Icons.hourglass_top,
          gradient: LinearGradient(
            colors: [AppColors.warning, AppColors.warningLight],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.warning,
        );
      case 'تم تأكيد الطلب':
        return _StatusConfig(
          label: 'تم التأكيد',
          icon: Icons.verified,
          gradient: LinearGradient(
            colors: [AppColors.success, AppColors.successLight],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.success,
        );
      case 'قيد التجهيز':
        return _StatusConfig(
          label: 'قيد التجهيز',
          icon: Icons.build,
          gradient: LinearGradient(
            colors: [AppColors.primary, AppColors.primaryLight],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.primary,
        );
      case 'قيد التوصيل':
        return _StatusConfig(
          label: 'قيد التوصيل',
          icon: Icons.local_shipping,
          gradient: LinearGradient(
            colors: [AppColors.accentCyan, AppColors.accent],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.accentCyan,
        );
      case 'مكتمل':
        return _StatusConfig(
          label: 'مكتمل',
          icon: Icons.check_circle,
          gradient: LinearGradient(
            colors: [AppColors.success, AppColors.accent],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.success,
        );
      case 'مرفوض':
        return _StatusConfig(
          label: 'مرفوض',
          icon: Icons.cancel,
          gradient: LinearGradient(
            colors: [AppColors.error, AppColors.errorLight],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.error,
        );
      default:
        return _StatusConfig(
          label: status,
          icon: Icons.help_outline,
          gradient: LinearGradient(
            colors: [AppColors.onSurfaceDisabled, AppColors.onSurfaceVariant],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.onSurfaceDisabled,
        );
    }
  }
}

class _StatusConfig {
  const _StatusConfig({
    required this.label,
    required this.icon,
    required this.gradient,
    required this.glowColor,
  });

  final String label;
  final IconData icon;
  final LinearGradient gradient;
  final Color glowColor;
}

enum BadgeSize { small, medium, large }

/// شارة منتج (عرض، جديد، مميز، إلخ)
