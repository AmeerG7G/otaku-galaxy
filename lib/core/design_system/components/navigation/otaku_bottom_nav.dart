import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

/// عنصر في شريط التنقل السفلي.
class OtakuNavItem {
  const OtakuNavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    this.badgeCount = 0,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final int badgeCount;
}

/// شريط التنقل السفلي العائم بتصميم Otaku Galaxy v2.
///
/// سطح عائم مستدير (نصف قطر ٢٦) فوق المحتوى، مع عنصر مركزي مرفوع
/// (المجتمع) بتدرّج وردي‑بنفسجي. الاتجاه RTL يتكفّل به Flutter تلقائياً
/// لأن الصف يستخدم ترتيباً منطقياً (start → end).
class OtakuBottomNav extends StatelessWidget {
  const OtakuBottomNav({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onSelected,
    required this.raisedIndex,
  });

  final List<OtakuNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onSelected;

  /// فهرس العنصر المركزي المرفوع (المجتمع).
  final int raisedIndex;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 0, 14, 16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(26),
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
            boxShadow: colors.shadowFloating,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (var i = 0; i < items.length; i++)
                if (i == raisedIndex)
                  _RaisedNavItem(
                    item: items[i],
                    active: currentIndex == i,
                    onTap: () => onSelected(i),
                  )
                else
                  Expanded(
                    child: _NavItem(
                      item: items[i],
                      active: currentIndex == i,
                      onTap: () => onSelected(i),
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.item,
    required this.active,
    required this.onTap,
  });

  final OtakuNavItem item;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active
        ? AppColors.secondary
        : Theme.of(context).colorScheme.onSurfaceVariant;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 7),
        decoration: BoxDecoration(
          color: active
              ? AppColors.secondary.withValues(alpha: 0.13)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              height: 21,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Icon(
                    active ? item.activeIcon : item.icon,
                    size: 21,
                    color: color,
                  ),
                  if (item.badgeCount > 0)
                    PositionedDirectional(
                      top: -5,
                      end: -9,
                      child: Container(
                        constraints: const BoxConstraints(
                          minWidth: 16,
                          minHeight: 16,
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.secondary,
                          borderRadius: BorderRadius.circular(
                            AppDimens.radiusFull,
                          ),
                        ),
                        child: Text(
                          item.badgeCount > 9 ? '9+' : '${item.badgeCount}',
                          textDirection: TextDirection.ltr,
                          style: Theme.of(context).textTheme.labelSmall
                              ?.copyWith(
                                color: Colors.white,
                                fontSize: 10,
                                height: 1,
                                fontWeight: AppDimens.weightExtraBold,
                              ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 5),
            Text(
              item.label,
              maxLines: 1,
              overflow: TextOverflow.visible,
              softWrap: false,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                fontSize: 10,
                height: 1,
                color: color,
                fontWeight: active
                    ? AppDimens.weightBold
                    : AppDimens.weightMedium,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// العنصر المركزي المرفوع — دائرة متدرّجة تكسر حدّ الشريط لأعلى.
class _RaisedNavItem extends StatelessWidget {
  const _RaisedNavItem({
    required this.item,
    required this.active,
    required this.onTap,
  });

  final OtakuNavItem item;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SizedBox(
      width: 60,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Transform.translate(
          offset: const Offset(0, -26),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  gradient: colors.primaryGradient,
                  borderRadius: BorderRadius.circular(19),
                  border: Border.all(
                    color: Theme.of(context).colorScheme.surface,
                    width: 3,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.secondary.withValues(alpha: 0.36),
                      blurRadius: 22,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Icon(
                  active ? item.activeIcon : item.icon,
                  color: Colors.white,
                  size: 22,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                item.label,
                maxLines: 1,
                softWrap: false,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  fontSize: 9.5,
                  height: 1,
                  color: active
                      ? AppColors.secondary
                      : Theme.of(context).colorScheme.onSurfaceVariant,
                  fontWeight: active
                      ? AppDimens.weightBold
                      : AppDimens.weightMedium,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
