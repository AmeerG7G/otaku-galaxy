import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/di/injection_container.dart';
import '../../data/birthday_storage.dart';

/// بطاقة خصم عيد الميلاد في الدفع — لا تظهر إطلاقاً إلا في يوم الميلاد
/// نفسه وبشرط عدم استهلاك المكافأة اليوم. لا تُعرض حالة «مستخدم» أو
/// «منتهٍ» في الأيام العادية.
class BirthdayDiscountCard extends StatelessWidget {
  const BirthdayDiscountCard({super.key});

  @override
  Widget build(BuildContext context) {
    final birthday = sl<BirthdayStorage>();
    return ValueListenableBuilder<int>(
      valueListenable: birthday.revision,
      builder: (context, _, _) => _card(context, birthday),
    );
  }

  Widget _card(BuildContext context, BirthdayStorage birthday) {
    if (!birthday.isRewardAvailable) return const SizedBox.shrink();

    final colors = context.themeColors;
    return Container(
      width: double.infinity,
      margin: EdgeInsets.only(bottom: AppDimens.space5),
      padding: EdgeInsets.all(AppDimens.space4),
      decoration: BoxDecoration(
        color: colors.successPale,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: colors.success, width: 1.5),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: colors.success.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(AppDimens.radiusMd),
            ),
            child: const Center(
              child: Text('🎂', style: TextStyle(fontSize: 20)),
            ),
          ),
          SizedBox(width: AppDimens.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '🎂 عيد ميلاد سعيد!',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
                SizedBox(height: AppDimens.space1),
                Text(
                  'لديك خصم ${birthday.discountPercent}٪ على طلبك اليوم — '
                  'صالح حتى ١١:٥٩ مساءً.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    height: AppDimens.lineHeightRelaxed,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
