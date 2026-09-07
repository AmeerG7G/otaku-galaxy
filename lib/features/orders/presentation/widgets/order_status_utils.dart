import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../domain/entities/order.dart';

/// مراحل الطلب كما يراها العميل.
///
/// كان «قيد التجهيز» يُعرض على أنه «قيد التوصيل» لأن الخادم كان يفصل بين
/// «تم تأكيده» و«قيد التجهيز»، فبدت الأخيرة مرحلةً داخلية لا تعني العميل.
/// بعد دمج التأكيد في التجهيز صار التجهيز هو مرحلة القبول نفسها، وعرضه
/// «قيد التوصيل» كان سيَعِد العميل بشاحنة لم تتحرك بعد.
String orderStatusLabel(OrderStatus status) {
  switch (status) {
    case OrderStatus.pending:
    case OrderStatus.waitingAdmin:
      return 'بانتظار تأكيد الإدارة';
    // حالة موروثة: طلبات قديمة توقّفت عند «تم تأكيده» قبل الدمج.
    case OrderStatus.confirmed:
    case OrderStatus.processing:
      return 'قيد التجهيز';
    case OrderStatus.delivering:
      return 'قيد التوصيل';
    case OrderStatus.completed:
      return 'تم التسليم';
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
