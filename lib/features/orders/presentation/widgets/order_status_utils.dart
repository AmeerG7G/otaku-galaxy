import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../domain/entities/order.dart';

/// مراحل الطلب كما يراها العميل.
///
/// كان «قيد التجهيز» يُعرض على أنه «قيد التوصيل» لأن الخادم كان يفصل بين
/// «تم تأكيده» و«قيد التجهيز»، فبدت الأخيرة مرحلةً داخلية لا تعني العميل.
/// بعد دمج التأكيد في التجهيز صار التجهيز هو مرحلة القبول نفسها، وعرضه
/// «قيد التوصيل» كان سيَعِد العميل بشاحنة لم تتحرك بعد.
String orderStatusLabel(BuildContext context, OrderStatus status) =>
    context.strings(_statusKey(status));

/// [orderStatusLabel] بكل لغات الواجهة — لكبسولةٍ تحجز ما يحتاجه أطولها.
List<String> orderStatusLabels(OrderStatus status) =>
    AppStrings.across(_statusKey(status));

String _statusKey(OrderStatus status) {
  switch (status) {
    case OrderStatus.pending:
    case OrderStatus.waitingAdmin:
      return 'statusWaitingAdmin';
    // حالة موروثة: طلبات قديمة توقّفت عند «تم تأكيده» قبل الدمج.
    case OrderStatus.confirmed:
    case OrderStatus.processing:
      return 'statusProcessing';
    case OrderStatus.delivering:
      return 'statusDelivering';
    case OrderStatus.completed:
      return 'statusCompleted';
    case OrderStatus.rejected:
      return 'statusRejected';
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
