import 'package:flutter/widgets.dart';

/// نقاط الانكسار المعتمدة — مشتقّة من متطلّبات التخطيط لا من أرقام اعتباطية.
///
/// [medium] هو العرض الذي تبدأ عنده شبكة المنتجات تحتمل عموداً ثالثاً بعرض
/// بطاقةٍ مقروء (انظر [productGridColumns])، وهو نفسه العرض الذي يصير عنده
/// سطر النصّ الممتدّ على كامل الشاشة أطول من مدى القراءة المريح. و[expanded]
/// هو العرض الذي يتّسع فيه لوحان جنباً إلى جنب بلا ضغط.
///
/// [CRITICAL] كل ما دون [medium] يبقى **مطابقاً تماماً** للتصميم المرجعي.
/// الاستجابة هنا إضافةٌ للشاشات العريضة، لا إعادةَ ضبطٍ لتخطيط الهاتف الذي
/// رُسم على مرجع `Otaku Galaxy v2.dc.html` بدقّة البكسل.
abstract final class Breakpoints {
  /// دون هذا: هاتف صغير (SE، وشاشات ٣٢٠).
  static const double compact = 360;

  /// من هنا: لوح صغير أو هاتف كبير بالعرض الأفقي.
  static const double medium = 600;

  /// من هنا: لوح بكامل معناه — تخطيطات أعرض وأعمدة أكثر.
  static const double expanded = 840;

  /// من هنا: لوح كبير أو نافذة سطح مكتب.
  static const double large = 1200;
}

/// صنف الشاشة الحالي.
enum ScreenClass {
  smallPhone,
  phone,
  smallTablet,
  tablet;

  bool get isPhone => this == smallPhone || this == phone;
  bool get isTablet => this == smallTablet || this == tablet;

  static ScreenClass fromWidth(double width) {
    if (width < Breakpoints.compact) return ScreenClass.smallPhone;
    if (width < Breakpoints.medium) return ScreenClass.phone;
    if (width < Breakpoints.expanded) return ScreenClass.smallTablet;
    return ScreenClass.tablet;
  }
}

extension ResponsiveContext on BuildContext {
  /// صنف الشاشة من **العرض القصير** لا العرض الحالي.
  ///
  /// [CRITICAL] الفرق ليس تفصيلاً: هاتف كبير بالعرض الأفقي (٩٢٦ منطقية)
  /// يتجاوز [Breakpoints.expanded] فيُعامَل معاملةَ لوح — بأعمدة لوحٍ وحشوة
  /// لوح على ارتفاع ٤٣٠ بكسل. الضلع القصير ثابتٌ مع الدوران، فهو وحده ما
  /// يميّز جهازاً عن جهاز. أما ما يعتمد على العرض الفعلي (عدد الأعمدة)
  /// فيُحسب من العرض المتاح مباشرةً عبر [productGridColumns].
  ScreenClass get screenClass =>
      ScreenClass.fromWidth(MediaQuery.sizeOf(this).shortestSide);

  bool get isTabletLayout => screenClass.isTablet;

  /// شاشة قصيرة الارتفاع (هاتف بالعرض الأفقي، أو لوحة مفاتيح مفتوحة).
  bool get isShortScreen => MediaQuery.sizeOf(this).height < 560;
}

// ── حدود عرض المحتوى ──────────────────────────────────────────────────
//
// الأرقام من مدى القراءة لا من أحجام الأجهزة: السطر الذي يتجاوز ~٧٠ محرفاً
// يصعب تتبّعه، والحقل الذي يتجاوز ~٤٨٠ يصير مؤشّر الإدخال بعيداً عن تسميته.

/// نماذج الإدخال وبطاقات الإجراء — تبقى بعرض هاتفٍ مريح مهما اتّسعت الشاشة.
const double kFormMaxWidth = 480;

/// النصوص والقوائم الطويلة — حدّ مدى القراءة.
const double kReadingMaxWidth = 720;

/// الشبكات والمعارض — تتّسع أكثر لأن وحدتها بطاقة لا سطر.
const double kGridMaxWidth = 1100;

/// الأوراق السفلية والحوارات — لا تمتدّ بعرض اللوح كاملاً.
const double kSheetMaxWidth = 560;

/// شريط التنقّل السفلي العائم — يبقى في متناول الإبهام لا ممتدّاً بعرض اللوح.
const double kNavBarMaxWidth = 560;

/// يوسّط المحتوى ويحدّ عرضه، وعلى الهاتف لا يفعل شيئاً.
///
/// بلا حدٍّ يصير كل نصٍّ على اللوح سطراً بعرض ألف بكسل، وكل حقلِ إدخال
/// شريطاً ممتدّاً — وهو «تمديد واجهة الهاتف» الذي يجب تفاديه.
class ResponsiveContentFrame extends StatelessWidget {
  const ResponsiveContentFrame({
    super.key,
    required this.child,
    this.maxWidth = kReadingMaxWidth,
    this.alignment = Alignment.topCenter,
    this.heightFactor,
  });

  final Widget child;
  final double maxWidth;
  final Alignment alignment;

  /// `1` يجعل الإطار بارتفاع طفله بدل ملء المتاح.
  ///
  /// تحتاجه الأوراق السفلية: `Align` بلا معامل ارتفاع يتمدّد إلى أقصى
  /// ارتفاعٍ متاح، فتصير الورقة طويلةً بفراغٍ فوق محتواها.
  final double? heightFactor;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: alignment,
      heightFactor: heightFactor,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: child,
      ),
    );
  }
}
