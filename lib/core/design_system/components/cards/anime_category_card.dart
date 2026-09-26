import 'package:flutter/material.dart';
import '../../../l10n/app_strings.dart';
import '../../themes/app_theme.dart';

import '../../../../features/products/domain/entities/category.dart';
import '../../../../features/products/domain/entities/category_order.dart';
import '../../tokens/app_colors.dart';
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

  /// لوحة تدرّجات الأقسام — ستة أزواج بالترتيب نفسه.
  ///
  /// [STAGE 12] كانت تُكتب حرفياً هنا فتتجاوز طبقة الرموز كلّها. انتقلت إلى
  /// [AppColors.categoryGradients] فصارت تتبع اللوحة المعتمدة تلقائياً.
  ///
  /// الخمسة الأولى من مرجع التصميم (`CATS[].grad`) والسادس مضاف لأن المتجر
  /// فيه ستة أقسام والمرجع يعرف خمسة. الزوجان ٢ و٥ كانا يستعملان الأخضر
  /// `#22B07D` — وهو لون **وظيفي** (نجاح) لا لون علامة — فأُبدلا بالنيلي
  /// والبنفسجي الداكن ضمن الألوان الستّة المعتمدة.
  static const List<List<Color>> gradients = AppColors.categoryGradients;

  /// تدرّج ثابت لكل قسم رئيسي، مفتاحه هويةُ القسم لا موضعُه.
  ///
  /// [CRITICAL] هذا ما يجعل اللون لا يتحرّك: إعادةُ ترتيب الأقسام من اللوحة،
  /// أو إضافةُ قسمٍ قبلها، أو إعادةُ تشغيل التطبيق — لا شيء منها يمسّ
  /// المفتاح، فلا يمسّ اللون.
  ///
  /// والتوزيع يتبع المرجع حيث يعرفه (أربعة من الخمسة)، فيبقى لون القسم في
  /// التطبيق هو لونه في التصميم.
  /// تُكتب بالإملاء الطبيعي وتُطبَّع مرة واحدة في [_gradientByKey] — لا
  /// مفاتيح مطبَّعة يدوياً تنفصل بصمت عن [canonicalCategoryKey].
  static const Map<String, int> _mainCategoryGradient = {
    'قرطاسية': 0,
    'ملابس': 1,
    'الحقائب': 2,
    'إكسسوارات': 3,
    'منتجات أنمي متنوعة': 4,
    'مجسمات وهدايا': 5,
  };

  static final Map<String, int> _gradientByKey = {
    for (final entry in _mainCategoryGradient.entries)
      canonicalCategoryKey(entry.key): entry.value,
  };

  /// تدرّج القسم حسب ترتيبه في القائمة.
  ///
  /// يُفضَّل [gradientForCategory]: الترتيب يتغيّر متى أضاف المسؤول قسماً أو
  /// أوقفه، فينقلب لون كل قسم بعده، وتختلف الشاشات التي تعرض مجموعة جزئية.
  static List<Color> gradientFor(int index) =>
      gradients[index % gradients.length];

  /// تدرّج القسم — ثابت، لا يتبع الترتيب، ولا يتصادم بين الأقسام الستة.
  ///
  /// [CRITICAL] الأقسام الرئيسية تُقرأ من جدول ثابت مفتاحه الاسمُ المطبَّع
  /// ([canonicalCategoryKey])، لا من تجزئة المعرّف.
  ///
  /// التجزئة وحدها كانت **تضمن** التصادم: ستة أقسام على خمسة تدرّجات لا
  /// يمكن أن تتوزّع بلا تكرار (مبدأ الحمام). وأيُّ قسمين يتصادمان يتوقّف
  /// على قيم الـUUID، أي على البيئة — ففي قاعدة التطوير اصطدمت «قرطاسية»
  /// بـ«ملابس»، وعلى جهاز صاحب المتجر اصطدمت «الحقائب» بـ«ملابس». العطب
  /// واحد وإن اختلف الزوج الظاهر.
  ///
  /// ولماذا الاسم لا المعرّف: الـUUID يولَّد لكل بيئة على حدة، فجدولٌ مبنيّ
  /// عليه يصحّ في التطوير ويخطئ في الإنتاج. الاسم `UNIQUE` في الجدول
  /// وثابتٌ بين البيئات.
  ///
  /// [NOTE] الأقسام خارج الستة تعود إلى تجزئة المعرّف: ثابتة لكل قسم، وقد
  /// تشارك أحدَ الستة لونَه. المطلوب أن تتمايز الستة فيما بينها، وهو مضمون.
  static List<Color> gradientForCategory(Category category) {
    // `stableKey` لا `name`: الاسم المعروض قد يكون كردياً، والهوية عربية دائماً.
    final slot = _gradientByKey[canonicalCategoryKey(category.stableKey)];
    if (slot != null) return gradients[slot];

    final id = category.id;
    if (id.isEmpty) return gradients.first;
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
        child: rail ? _railBody(theme, mark) : _wideBody(context, theme, count),
      ),
    );
  }

  /// البطاقة العريضة: نصٌّ وحده، موسَّطٌ أفقياً وعمودياً على التدرّج.
  ///
  /// [PRODUCT] قرار 2026-09-15: لا صورةَ قسمٍ ولا حرفاً مائياً ولا مساحةً
  /// محجوزة لرسم — بطاقة القسم الرئيسي نظيفةٌ نصّية: الاسم ثم عدد الأقسام
  /// الفرعية في المنتصف. الصورة التي كان يرفعها المسؤول (`imageUrl`) لم تعد
  /// تُقرأ في أي شاشة، ولوحة التحكم لم تعد تعرضها أو تطلبها.
  Widget _wideBody(BuildContext context, ThemeData theme, int count) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(
            category.name,
            maxLines: 2,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleLarge?.copyWith(
              fontFamily: 'Tajawal',
              fontWeight: AppDimens.weightBlack,
              fontSize: 20,
              height: 1.25,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            count > 0
                ? context.strings.p('subcategoriesCount', {'count': '$count'})
                : context.strings('browseCategory'),
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 12,
              color: Colors.white.withValues(alpha: 0.85),
            ),
          ),
        ],
      ),
    );
  }

  /// نسخة الشريط الأفقي — الحرف المائي خلف الاسم كما في التصميم (بلا صورة).
  Widget _railBody(ThemeData theme, String mark) {
    return Stack(
      fit: StackFit.expand,
      children: [
        PositionedDirectional(
          top: -6,
          end: -4,
          width: 56,
          height: 56,
          child: IgnorePointer(child: _watermark(mark, 54)),
        ),
        Align(
          alignment: AlignmentDirectional.bottomStart,
          child: Text(
            category.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleLarge?.copyWith(
              fontFamily: 'Tajawal',
              fontWeight: AppDimens.weightExtraBold,
              fontSize: 14,
              height: 1.25,
              color: Colors.white,
              shadows: const [
                Shadow(
                  color: Color(0x47000000),
                  blurRadius: 8,
                  offset: Offset(0, 2),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _watermark(String mark, double size) => FittedBox(
    fit: BoxFit.scaleDown,
    alignment: Alignment.bottomCenter,
    child: Text(
      mark,
      style: TextStyle(
        fontFamily: 'Tajawal',
        // نصٌّ مترجَم بـTextStyle جديد: لا يرث احتياط الثيم فيُذكر صراحةً.
        fontFamilyFallback: kArabicScriptFallback,
        fontWeight: AppDimens.weightBlack,
        fontSize: size,
        height: 1,
        color: Colors.white.withValues(alpha: 0.22),
      ),
    ),
  );
}
