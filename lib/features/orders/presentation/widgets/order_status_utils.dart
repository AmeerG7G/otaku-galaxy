import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../domain/entities/order.dart';

/// أربع حالات واضحة للعميل — التجهيز جزء من «قيد التوصيل» بصرياً حتى
/// لا يحتاج العميل تمييز مرحلة داخلية لا تعنيه.
String orderStatusLabel(OrderStatus status) {
  switch (status) {
    case OrderStatus.pending:
    case OrderStatus.waitingAdmin:
      return 'بانتظار تأكيد الإدارة';
    case OrderStatus.confirmed:
      return 'تم تأكيد الطلب';
    case OrderStatus.processing:
    case OrderStatus.delivering:
      return 'قيد التوصيل';
    case OrderStatus.completed:
      return 'مكتمل';
    case OrderStatus.rejected:
      return 'مرفوض';
  }
}

/// ألوان حالات الطلب من رموز Otaku Galaxy v2 — لا ألوان Material الخام.
Color orderStatusColor(OrderStatus status) {
  switch (status) {
    case OrderStatus.waitingAdmin:
    case OrderStatus.pending:
      return AppColors.accent;
    case OrderStatus.rejected:
      return AppColors.error;
    case OrderStatus.completed:
      return AppColors.success;
    case OrderStatus.confirmed:
    case OrderStatus.processing:
    case OrderStatus.delivering:
      return AppColors.accentCyan;
  }
}
