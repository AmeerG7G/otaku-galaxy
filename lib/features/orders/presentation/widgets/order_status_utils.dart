import 'package:flutter/material.dart';

import '../../domain/entities/order.dart';

String orderStatusLabel(OrderStatus status) {
  switch (status) {
    case OrderStatus.pending:
      return 'طلب جديد';
    case OrderStatus.waitingAdmin:
      return 'بانتظار تأكيد الإدارة';
    case OrderStatus.confirmed:
      return 'تم تأكيد الطلب';
    case OrderStatus.processing:
      return 'قيد التجهيز';
    case OrderStatus.delivering:
      return 'قيد التوصيل';
    case OrderStatus.completed:
      return 'مكتمل';
    case OrderStatus.rejected:
      return 'مرفوض';
  }
}

Color orderStatusColor(OrderStatus status) {
  switch (status) {
    case OrderStatus.waitingAdmin:
    case OrderStatus.pending:
      return Colors.orange;
    case OrderStatus.rejected:
      return Colors.red;
    case OrderStatus.completed:
      return Colors.green;
    default:
      return Colors.blue;
  }
}
