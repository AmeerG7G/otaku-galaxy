import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/utils/formatters.dart';
import '../../domain/entities/order.dart';

/// نتيجة ورقة «هل استلمت طلبك؟».
enum DeliveryConfirmationChoice {
  /// أكّد الاستلام — يُنقل الطلب إلى «تم الاستلام» على الخادم.
  received,

  /// لم يستلمه بعد — يبقى الطلب قيد التوصيل ويُسأل لاحقاً.
  notYet,
}

/// ورقة تأكيد الاستلام، مطابقة لمرجع التصميم.
///
/// تُعرض من مدخلين: فتح التطبيق مع وجود طلب ينتظر تأكيداً، والضغط على
/// إشعار التذكير. كلاهما ينتهي إلى هذه الورقة نفسها فلا يتفرّع التصميم.
///
/// الورقة لا تُقرّر شيئاً بنفسها: تعرض الطلب وتُعيد اختيار العميل، ومن
/// يستدعيها هو من ينادي الخادم.
Future<DeliveryConfirmationChoice?> showDeliveryConfirmationSheet(
  BuildContext context, {
  required Order order,
}) {
  return showOtakuSheet<DeliveryConfirmationChoice>(
    context: context,
    builder: (sheetContext) => _DeliveryConfirmationBody(order: order),
  );
}

class _DeliveryConfirmationBody extends StatelessWidget {
  const _DeliveryConfirmationBody({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return OtakuSheet(
      padding: const EdgeInsets.fromLTRB(18, 14, 18, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // العنوان والرسم جنباً إلى جنب كما في المرجع.
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'هل استلمت طلبك؟',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontFamily: 'Tajawal',
                        fontWeight: AppDimens.weightBlack,
                        fontSize: 20,
                      ),
                    ),
                    const SizedBox(height: 7),
                    Text(
                      'نريد التأكد من وصول طلبك إليك',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 12.5,
                        height: 1.6,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              IgnorePointer(
                child: Image.asset(
                  'assets/art/opt/a-i6.png',
                  width: 74,
                  errorBuilder: (_, _, _) => const SizedBox(width: 74),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // بطاقة الطلب: الحالة على اليمين والإجمالي على اليسار.
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(AppDimens.radiusMd),
              border: Border.all(color: theme.colorScheme.outlineVariant),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'قيد التوصيل',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontSize: 13.5,
                      fontWeight: AppDimens.weightBold,
                      color: theme.colorScheme.onSurface,
                    ),
                  ),
                ),
                Text(
                  formatPrice(order.total),
                  textDirection: TextDirection.ltr,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontFamily: 'Tajawal',
                    fontWeight: AppDimens.weightExtraBold,
                    fontSize: 14.5,
                    color: colors.error,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 18),

          AnimePrimaryButton(
            label: 'نعم، استلمت الطلب',
            height: AppDimens.buttonHeightXl,
            onPressed: () => Navigator.of(
              context,
            ).pop(DeliveryConfirmationChoice.received),
          ),
          const SizedBox(height: 10),
          AnimeOutlinedButton(
            label: 'لم أستلمه بعد',
            onPressed: () => Navigator.of(
              context,
            ).pop(DeliveryConfirmationChoice.notYet),
          ),
        ],
      ),
    );
  }
}
