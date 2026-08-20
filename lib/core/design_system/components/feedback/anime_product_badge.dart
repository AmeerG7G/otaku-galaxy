import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import 'anime_order_status_badge.dart';

class AnimeProductBadge extends StatelessWidget {
  const AnimeProductBadge({
    super.key,
    required this.label,
    this.type = BadgeType.info,
    this.icon,
    this.size = BadgeSize.medium,
  });

  final String label;
  final BadgeType type;
  final IconData? icon;
  final BadgeSize size;

  @override
  Widget build(BuildContext context) {
    final config = _getTypeConfig(type);
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
          if (icon != null) ...[
            Icon(icon, size: fontSize + 2, color: Colors.white),
            SizedBox(width: AppDimens.space2),
          ],
          Text(
            label,
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

  _BadgeConfig _getTypeConfig(BadgeType type) {
    switch (type) {
      case BadgeType.offer:
        return _BadgeConfig(
          gradient: LinearGradient(
            colors: [AppColors.error, AppColors.errorLight],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.error,
        );
      case BadgeType.newArrival:
        return _BadgeConfig(
          gradient: LinearGradient(
            colors: [AppColors.accentCyan, AppColors.accent],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.accentCyan,
        );
      case BadgeType.featured:
        return _BadgeConfig(
          gradient: LinearGradient(
            colors: [AppColors.accent, AppColors.accentOrange],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.accent,
        );
      case BadgeType.lowStock:
        return _BadgeConfig(
          gradient: LinearGradient(
            colors: [AppColors.warning, AppColors.warningLight],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.warning,
        );
      case BadgeType.bestSeller:
        return _BadgeConfig(
          gradient: LinearGradient(
            colors: [AppColors.secondary, AppColors.secondaryLight],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.secondary,
        );
      default:
        return _BadgeConfig(
          gradient: LinearGradient(
            colors: [AppColors.primary, AppColors.primaryLight],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          glowColor: AppColors.primary,
        );
    }
  }
}

class _BadgeConfig {
  const _BadgeConfig({required this.gradient, required this.glowColor});

  final LinearGradient gradient;
  final Color glowColor;
}

enum BadgeType { offer, newArrival, featured, lowStock, bestSeller, info }

/// حقل إدخال بتصميم أنمي
