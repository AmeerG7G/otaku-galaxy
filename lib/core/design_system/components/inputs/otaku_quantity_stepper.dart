import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';

/// عدّاد الكمية بتصميم v2 — كبسولة صغيرة بزرّ زيادة وردي ممتلئ.
///
/// الزيادة هي الإجراء البارز (دائرة وردية بيضاء الحبر)، والنقصان هادئ
/// بلا خلفية، والعدد بينهما بخط عريض.
class OtakuQuantityStepper extends StatelessWidget {
  const OtakuQuantityStepper({
    super.key,
    required this.quantity,
    required this.onIncrease,
    required this.onDecrease,
    this.canIncrease = true,
  });

  final int quantity;
  final VoidCallback onIncrease;
  final VoidCallback onDecrease;
  final bool canIncrease;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(AppDimens.radiusFull),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _StepButton(
            icon: Icons.add_rounded,
            filled: true,
            enabled: canIncrease,
            onTap: onIncrease,
          ),
          const SizedBox(width: 4),
          ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 16),
            child: Text(
              '$quantity',
              textAlign: TextAlign.center,
              textDirection: TextDirection.ltr,
              style: theme.textTheme.labelLarge?.copyWith(
                fontSize: 13,
                fontWeight: AppDimens.weightBold,
              ),
            ),
          ),
          const SizedBox(width: 4),
          _StepButton(icon: Icons.remove_rounded, onTap: onDecrease),
        ],
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({
    required this.icon,
    required this.onTap,
    this.filled = false,
    this.enabled = true,
  });

  final IconData icon;
  final VoidCallback onTap;
  final bool filled;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: enabled ? onTap : null,
      customBorder: const CircleBorder(),
      child: Opacity(
        opacity: enabled ? 1 : 0.4,
        child: Container(
          width: 26,
          height: 26,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: filled ? AppColors.secondary : Colors.transparent,
          ),
          child: Icon(
            icon,
            size: 15,
            color: filled ? Colors.white : theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}
