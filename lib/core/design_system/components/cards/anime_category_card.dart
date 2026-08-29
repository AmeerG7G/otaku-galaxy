import 'package:flutter/material.dart';

import '../../../../features/products/domain/entities/category.dart';
import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

/// بطاقة قسم بتصميم Otaku Galaxy v2.
///
/// لافتة عريضة بارتفاع ١١٢ ونصف قطر ٣٠، بخلفية متدرّجة خاصة بكل قسم،
/// وحرف مائي ضخم يخرج من الحافة السفلية — بديل المربّعات الصغيرة القديمة.
class AnimeCategoryCard extends StatelessWidget {
  const AnimeCategoryCard({
    super.key,
    required this.category,
    this.onTap,
    this.index = 0,
    this.height = 112,
  }) : rail = false;

  /// نسخة الشريط الأفقي في الرئيسية — ١٠٤×٩٦ بنصف قطر ٢٢.
  const AnimeCategoryCard.rail({
    super.key,
    required this.category,
    this.onTap,
    this.index = 0,
  }) : rail = true,
       height = 96;

  final Category category;
  final VoidCallback? onTap;

  /// يحدّد التدرّج اللوني من لوحة أقسام v2.
  final int index;
  final double height;

  /// وضع الشريط الأفقي المضغوط.
  final bool rail;

  /// تدرّجات الأقسام كما وردت في مصدر التصميم (زاوية ١٤٠ درجة).
  static const List<List<Color>> gradients = [
    [Color(0xFFFF9A5A), Color(0xFFFF3D8F)],
    [Color(0xFF4EA8FF), Color(0xFF7C5CFF)],
    [Color(0xFF22B07D), Color(0xFF4EA8FF)],
    [Color(0xFFFF3D8F), Color(0xFF7C5CFF)],
    [Color(0xFFFFB02E), Color(0xFFFF6F91)],
  ];

  /// تدرّج القسم حسب ترتيبه في القائمة.
  ///
  /// يُفضَّل [gradientForCategory]: الترتيب يتغيّر متى أضاف المسؤول قسماً أو
  /// أوقفه، فينقلب لون كل قسم بعده، وتختلف الشاشات التي تعرض مجموعة جزئية.
  static List<Color> gradientFor(int index) =>
      gradients[index % gradients.length];

  /// تدرّج القسم مشتقّاً من معرّفه — ثابت لا يتبع الترتيب.
  ///
  /// المعرّف لا يتغيّر، فيتطابق اللون بين شريط الرئيسية وشاشة الأقسام
  /// وترويسة تفاصيل القسم بلا تنسيق بينها، ولا ينقلب عند إعادة الترتيب.
  static List<Color> gradientForCategory(Category category) {
    final id = category.id;
    if (id.isEmpty) return gradients.first;
    // مجموع بايتات المعرّف: ثابت، رخيص، وموزَّع كفايةً على خمسة تدرّجات.
    var sum = 0;
    for (final unit in id.codeUnits) {
      sum = (sum + unit) % gradients.length;
    }
    return gradients[sum];
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final palette = gradientForCategory(category);
    final mark = category.name.trim().isEmpty
        ? '؟'
        : category.name.trim().characters.first;
    // صورة القسم التي يرفعها المسؤول. الحرف المائي يبقى بديلاً حين لا توجد
    // صورة — لا يُستبدل بمربّع فارغ.
    final imageUrl = category.imageUrl?.trim();
    final hasImage = imageUrl != null && imageUrl.isNotEmpty;
    final count = category.subcategories.length;

    final radius = rail ? AppDimens.radiusMd : AppDimens.radiusLg;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(radius),
      child: Container(
        width: rail ? 104 : null,
        height: height,
        padding: EdgeInsets.all(rail ? 12 : 16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: palette,
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
          ),
          borderRadius: BorderRadius.circular(radius),
          boxShadow: rail ? colors.shadowXSoft : colors.shadowSoft,
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // صورة القسم تملأ البطاقة، ويعلوها حجاب متدرّج يحفظ قراءة النص
            // فوق أي صورة مهما كانت فاتحة.
            if (hasImage) ...[
              Image.network(
                imageUrl,
                fit: BoxFit.cover,
                // فشل التحميل يعود للحرف المائي بدل أيقونة كسر.
                errorBuilder: (_, _, _) => const SizedBox.shrink(),
                loadingBuilder: (context, child, progress) =>
                    progress == null ? child : const SizedBox.shrink(),
              ),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      palette.first.withValues(alpha: 0.82),
                      palette.last.withValues(alpha: 0.62),
                    ],
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                  ),
                ),
              ),
            ],
            // الحرف المائي الضخم خلف النص — بديل الصورة حين لا توجد.
            if (!hasImage)
            PositionedDirectional(
              bottom: rail ? null : -30,
              top: rail ? -14 : null,
              end: rail ? 2 : 6,
              child: IgnorePointer(
                child: Text(
                  mark,
                  style: TextStyle(
                    fontFamily: 'Tajawal',
                    fontWeight: AppDimens.weightBlack,
                    fontSize: rail ? 74 : 110,
                    height: 1,
                    color: Colors.white.withValues(alpha: rail ? 0.24 : 0.22),
                  ),
                ),
              ),
            ),
            Align(
              alignment: rail
                  ? AlignmentDirectional.bottomStart
                  : AlignmentDirectional.centerStart,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    category.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontFamily: 'Tajawal',
                      // الشريط الأفقي: ٨٠٠ مع ظل نصّي يفصل الاسم عن التدرّج؛
                      // بطاقة القسم الكاملة: ٩٠٠ بلا ظل، كما في التصميم.
                      fontWeight: rail
                          ? AppDimens.weightExtraBold
                          : AppDimens.weightBlack,
                      fontSize: rail ? 14 : 20,
                      height: 1.25,
                      color: Colors.white,
                      shadows: rail
                          ? const [
                              Shadow(
                                color: Color(0x47000000),
                                blurRadius: 8,
                                offset: Offset(0, 2),
                              ),
                            ]
                          : null,
                    ),
                  ),
                  if (!rail) ...[
                    const SizedBox(height: 4),
                    Text(
                      count > 0 ? '$count قسم فرعي' : 'تصفّح القسم',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 12,
                        color: Colors.white.withValues(alpha: 0.85),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
