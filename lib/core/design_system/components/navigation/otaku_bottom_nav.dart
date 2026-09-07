import 'package:flutter/material.dart';

import '../../tokens/app_breakpoints.dart';
import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

/// عنصر في شريط التنقل السفلي.
///
/// حقل [icon]/[activeIcon] محفوظان للتوافق مع الواجهة العامة، لكن الرسم
/// الفعلي لا يستخدمهما: كل شكل يُرسم من مرجع `Otaku Galaxy v2.dc.html`
/// كأشكال CSS تُعاد إنتاجها عبر `Container` + `BoxDecoration`.
class OtakuNavItem {
  const OtakuNavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    this.badgeCount = 0,
    this.gridIconCount,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final int badgeCount;

  /// عندما تكون القيمة ٤، يُعرض عنصر «الأقسام» كشبكة 2×2 من الأيقونات
  /// بدلاً من أيقونة واحدة، بما يطابق مرجع التصميم.
  final int? gridIconCount;
}

/// نوع الشكل الهندسي لكل عنصر — مطابق تماماً لمرجع التصميم.
enum _NavShape { home, categories, cart, account }

// ── ثوابت تخطيط الشريط (مطابقة لمرجع Otaku Galaxy v2.dc.html) ──────────
//
// `line-height` للخط Cairo في المتصفح (~1.8) يُساوي ارتفاع صندوق السطر
// 18px لخط 10px (تُقاس فعلياً: line = fontSize × height).
const double _navLabelLineHeight = 1.8;

// ارتفاع محتوى العمود المركزي المرفوع = الزر(50) + الفاصل(4) + سطر النص.
const double _raisedContentHeight = 50 + 4 + 9.5 * _navLabelLineHeight;

// الحجم المحجوز للعنصر المرفوع داخل الصف = المحتوى − 26، ليحاكي
// `margin-top:-26px` في المرجع (يُقلّص مساهمته الرأسية دون رفع ارتفاع الصف)،
// ثم يُرسم أعلى بمقدار 26px بترجمة صرفة.
const double _raisedFootprintHeight = _raisedContentHeight - 26;

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
        // [CRITICAL] المعمارية لا تتغيّر: الوجهات الخمس نفسها، والشريط نفسه،
        // بتصميم المرجع نفسه. ما يتغيّر أن الشريط لا يتمدّد بعرض اللوح
        // كاملاً — عناصرُ خمسةٌ موزّعة على ١٢٠٠ بكسل تصير أيقوناتٍ ضائعة
        // بفراغاتٍ شاسعة بينها، وأبعدَ ما تكون عن الإبهام. الحدّ يُبقيه
        // شريطاً عائماً موسَّطاً؛ وعلى الهاتف (أضيق من الحدّ) لا أثر له.
        child: ResponsiveContentFrame(
          maxWidth: kNavBarMaxWidth,
          heightFactor: 1,
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
              crossAxisAlignment: CrossAxisAlignment.center,
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
                        shape: _resolveShape(i, items[i]),
                      ),
                    ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// يحدّد شكل العنصر حسب موقعه في الشريط المرجعي الثابت.
  /// (0=رئيسية، 3=سلة، 4=حساب)، والأقسام تُعرَف عبر [gridIconCount].
  static _NavShape _resolveShape(int index, OtakuNavItem item) {
    if (item.gridIconCount == 4) return _NavShape.categories;
    switch (index) {
      case 0:
        return _NavShape.home;
      case 3:
        return _NavShape.cart;
      case 4:
        return _NavShape.account;
    }
    return _NavShape.home;
  }
}

// ---------------------------------------------------------------------------
// لون النص الثانوي (--txt3) للشكل غير النشط:
//   فاتح #9c94b8  /  داكن #7d739e
// ---------------------------------------------------------------------------
Color _inactiveIconColor(BuildContext context) {
  return Theme.of(context).brightness == Brightness.dark
      ? const Color(0xFF7D739E)
      : AppColors.onSurfaceDisabled;
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.item,
    required this.active,
    required this.onTap,
    required this.shape,
  });

  final OtakuNavItem item;
  final bool active;
  final VoidCallback onTap;
  final _NavShape shape;

  @override
  Widget build(BuildContext context) {
    final labelColor = active
        ? AppColors.secondary
        : Theme.of(context).colorScheme.onSurfaceVariant;

    final iconColor = active
        ? AppColors.secondary
        : _inactiveIconColor(context);

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
            _IconSlot(
              shape: shape,
              active: active,
              color: iconColor,
              badgeCount: item.badgeCount,
            ),
            const SizedBox(height: 5),
            Text(
              item.label,
              maxLines: 1,
              overflow: TextOverflow.visible,
              softWrap: false,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                fontSize: 10,
                height: _navLabelLineHeight,
                color: labelColor,
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

/// يعرض الشكل الهندسي المناسب لكل عنصر، مع دعم شارة السلة.
class _IconSlot extends StatelessWidget {
  const _IconSlot({
    required this.shape,
    required this.active,
    required this.color,
    required this.badgeCount,
  });

  final _NavShape shape;
  final bool active;
  final Color color;
  final int badgeCount;

  @override
  Widget build(BuildContext context) {
    switch (shape) {
      case _NavShape.categories:
        return _CategoriesIconGrid(active: active);
      case _NavShape.cart:
        return _CartIcon(active: active, color: color, badgeCount: badgeCount);
      case _NavShape.account:
        return _AccountIcon(active: active, color: color);
      case _NavShape.home:
        return _HomeIcon(active: active, color: color);
    }
  }
}

/// HOME — CSS: `width:19px;height:19px;border-radius:7px;`
/// `border:2.2px solid;background:pink/transparent`.
class _HomeIcon extends StatelessWidget {
  const _HomeIcon({required this.active, required this.color});

  final bool active;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('nav_shape_home'),
      width: 19,
      height: 19,
      decoration: BoxDecoration(
        color: active ? AppColors.secondary : Colors.transparent,
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: color, width: 2.2),
      ),
    );
  }
}

/// ACCOUNT — CSS: `width:19px;height:19px;border-radius:50%;`
/// `border:2.2px solid;background:pink/transparent`.
class _AccountIcon extends StatelessWidget {
  const _AccountIcon({required this.active, required this.color});

  final bool active;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('nav_shape_account'),
      width: 19,
      height: 19,
      decoration: BoxDecoration(
        color: active ? AppColors.secondary : Colors.transparent,
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 2.2),
      ),
    );
  }
}

/// CART — CSS: `width:19px;height:17px;margin-top:2px;`
/// `border-radius:4px 4px 8px 8px;border:2.2px solid;`
/// `background:pink@32%/transparent`. مع شارة سلة منفصلة.
class _CartIcon extends StatelessWidget {
  const _CartIcon({
    required this.active,
    required this.color,
    required this.badgeCount,
  });

  final bool active;
  final Color color;
  final int badgeCount;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 19,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            key: const Key('nav_shape_cart'),
            width: 19,
            height: 17,
            margin: const EdgeInsets.only(top: 2),
            decoration: BoxDecoration(
              color: active
                  ? AppColors.secondary.withValues(alpha: 0.32)
                  : Colors.transparent,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(4),
                bottom: Radius.circular(8),
              ),
              border: Border.all(color: color, width: 2.2),
            ),
          ),
          if (badgeCount > 0)
            PositionedDirectional(
              top: -5,
              end: -9,
              child: Container(
                constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                padding: const EdgeInsets.symmetric(horizontal: 4),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.secondary,
                  borderRadius: BorderRadius.circular(AppDimens.radiusFull),
                ),
                child: Text(
                  badgeCount > 9 ? '9+' : '$badgeCount',
                  textDirection: TextDirection.ltr,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
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
    );
  }
}

/// CATEGORIES — شبكة 2×2 من أربع مربّعات 7.5×7.5 (نصف قطر 2.5).
/// CSS: `display:grid;grid-template-columns:1fr 1fr;gap:3px;height:19px`.
/// اللون: وردي (--pink) عند التفعيل، أو --txt3 عند عدم التفعيل.
class _CategoriesIconGrid extends StatelessWidget {
  const _CategoriesIconGrid({required this.active});

  final bool active;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 19,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          _CategoriesRow(active: active),
          const SizedBox(height: 3),
          _CategoriesRow(active: active),
        ],
      ),
    );
  }
}

class _CategoriesRow extends StatelessWidget {
  const _CategoriesRow({required this.active});

  final bool active;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.secondary : _inactiveIconColor(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _CategoriesCell(color: color),
        const SizedBox(width: 3),
        _CategoriesCell(color: color),
      ],
    );
  }
}

class _CategoriesCell extends StatelessWidget {
  const _CategoriesCell({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('nav_shape_categories_cell'),
      width: 7.5,
      height: 7.5,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(2.5),
      ),
    );
  }
}

/// العنصر المركزي المرفوع — مجتمع Otaku Galaxy v2.
///
/// CSS: `width:50px;height:50px;border-radius:19px;`
/// `background:linear-gradient(135deg,pink,violet);border:3px solid surface;`
/// `box-shadow:0 10px 22px rgba(255,61,143,.36)`. مرتفع `margin-top:-26px`.
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
    // محتوى العمود: الزر + فاصل 4px + النص. الارتفاع الطبيعي للمحتوى يُخفَّض
    // بمقدار 26px ليحاكي `margin-top:-26px` في المرجع، ثم يُرسم أعلى بمقدار 26px
    // بترجمة صرفة دون أن يرفع ارتفاع الصف (بعكس الترجمة الناقصة سابقاً).
    final labelStyle =
        Theme.of(context).textTheme.labelSmall?.copyWith(
          fontSize: 9.5,
          height: _navLabelLineHeight,
          color: active
              ? AppColors.secondary
              : Theme.of(context).colorScheme.onSurfaceVariant,
          fontWeight: active ? AppDimens.weightBold : AppDimens.weightMedium,
        ) ??
        const TextStyle(fontSize: 9.5);

    final icon = Container(
      key: const Key('nav_shape_community'),
      width: 50,
      height: 50,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: AppColors.ctaGradient,
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
      child: const _CommunityIconGrid(),
    );

    return SizedBox(
      width: 60,
      height: _raisedFootprintHeight,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: OverflowBox(
          alignment: Alignment.topCenter,
          maxHeight: double.infinity,
          child: Transform.translate(
            offset: const Offset(0, -26),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                icon,
                const SizedBox(height: 4),
                Text(
                  item.label,
                  maxLines: 1,
                  softWrap: false,
                  style: labelStyle,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// الشبكة الداخلية للزر المرفوع — 2×2 من مستطيلات بيضاء.
/// `gap:2.5px`؛ مستطيلان 7×9 `#fff`، ومستطيلان 7×6 `rgba(255,255,255,.72)`.
class _CommunityIconGrid extends StatelessWidget {
  const _CommunityIconGrid();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _CommunityCell(width: 7, height: 9, color: Colors.white),
            SizedBox(width: 2.5),
            _CommunityCell(width: 7, height: 6, color: Color(0xB8FFFFFF)),
          ],
        ),
        const SizedBox(height: 2.5),
        const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _CommunityCell(width: 7, height: 6, color: Color(0xB8FFFFFF)),
            SizedBox(width: 2.5),
            _CommunityCell(width: 7, height: 9, color: Colors.white),
          ],
        ),
      ],
    );
  }
}

class _CommunityCell extends StatelessWidget {
  const _CommunityCell({
    required this.width,
    required this.height,
    required this.color,
  });

  final double width;
  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('nav_shape_community_cell'),
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(2),
      ),
    );
  }
}
