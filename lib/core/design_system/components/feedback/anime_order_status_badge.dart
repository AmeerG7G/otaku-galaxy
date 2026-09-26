import 'package:flutter/material.dart';
import '../../themes/app_theme.dart';

import '../../../../features/orders/domain/entities/order.dart';
import '../../../../features/orders/presentation/widgets/order_status_utils.dart';
import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';

/// شارة حالة الطلب — أيقونة وتدرّج ونصّ.
///
/// [CRITICAL] الهوية هنا [OrderStatus]، لا النصّ المعروض. كانت الشارة
/// تُبدّل على نصٍّ عربيٍّ حرفيّ (`case 'قيد التوصيل':`)، أي أنها تستعمل
/// **الترجمة** مُعرِّفاً للحالة. النتيجة في واجهةٍ كردية ليست خطأً صاخباً بل
/// صمتٌ تام: لا حالة تُطابق، فتسقط كلُّ الطلبات إلى الفرع الافتراضي
/// (رمادي + `help_outline`) ويقرأ الزبون الكرديُّ حالةَ طلبه بلا لون ولا
/// معنى. ولأن `default` كان يبتلع كلَّ ما لا يُطابق، ما كان لاختبارٍ ولا
/// لمحلّلٍ أن يصرخ.
///
/// الآن: `switch` على التعداد — شامل، يرفض المترجمُ إضافةَ حالةٍ بلا شارة —
/// والنصُّ وحده يأتي من [orderStatusLabel]. طبقة الترجمة تقدّم عرضاً لا
/// هوية.
class AnimeOrderStatusBadge extends StatelessWidget {
  const AnimeOrderStatusBadge({
    super.key,
    required this.status,
    this.size = BadgeSize.medium,
  });

  final OrderStatus status;
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
            // المصدر الوحيد لنصّ الحالة — لا نسخةٌ ثانية مختصرة هنا.
            orderStatusLabel(context, status),
            style: TextStyle(
              fontFamily: 'Cairo',
              // نصٌّ مترجَم بـTextStyle جديد: لا يرث احتياط الثيم فيُذكر صراحةً.
              fontFamilyFallback: kArabicScriptFallback,
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

  /// الشكل وحده — بلا نصّ. شاملٌ عمداً: لا `default` يبتلع حالةً جديدة.
  _StatusConfig _getStatusConfig(OrderStatus status) => switch (status) {
    OrderStatus.pending => _StatusConfig(
      icon: Icons.receipt_long,
      gradient: LinearGradient(
        colors: [AppColors.info, AppColors.infoLight],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      glowColor: AppColors.info,
    ),
    OrderStatus.waitingAdmin => _StatusConfig(
      icon: Icons.hourglass_top,
      gradient: LinearGradient(
        colors: [AppColors.warning, AppColors.warningLight],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      glowColor: AppColors.warning,
    ),
    OrderStatus.confirmed => _StatusConfig(
      icon: Icons.verified,
      gradient: LinearGradient(
        colors: [AppColors.success, AppColors.successLight],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      glowColor: AppColors.success,
    ),
    OrderStatus.processing => _StatusConfig(
      icon: Icons.build,
      gradient: LinearGradient(
        colors: [AppColors.primary, AppColors.primaryLight],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      glowColor: AppColors.primary,
    ),
    OrderStatus.delivering => _StatusConfig(
      icon: Icons.local_shipping,
      gradient: LinearGradient(
        colors: [AppColors.accentCyan, AppColors.accent],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      glowColor: AppColors.accentCyan,
    ),
    OrderStatus.completed => _StatusConfig(
      icon: Icons.check_circle,
      gradient: LinearGradient(
        colors: [AppColors.success, AppColors.accent],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      glowColor: AppColors.success,
    ),
    OrderStatus.rejected => _StatusConfig(
      icon: Icons.cancel,
      gradient: LinearGradient(
        colors: [AppColors.error, AppColors.errorLight],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      glowColor: AppColors.error,
    ),
  };
}

class _StatusConfig {
  const _StatusConfig({
    required this.icon,
    required this.gradient,
    required this.glowColor,
  });

  final IconData icon;
  final LinearGradient gradient;
  final Color glowColor;
}

enum BadgeSize { small, medium, large }

/// شارة منتج (عرض، جديد، مميز، إلخ)
