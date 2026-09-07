import 'package:flutter/material.dart';

import '../../../../core/design_system/tokens/app_colors.dart';
import '../../../../core/design_system/tokens/app_dimens.dart';

/// شريط التحميل وشرحته، مثبّتان أسفل الشاشة كما في المرجع
/// (`position:absolute; bottom:64px`).
///
/// يتلقّى قيمة الحركة ([loadFill]) من الوالد: عرض التعبئة يصعد وفق
/// `og-load 2.1s ease forwards`. الألوان ألوان المرجع الثابتة — لا تعتمد
/// على السمة.
///
/// [مخالفتان مقصودتان عن المرجع، بطلبٍ صريح من المستخدم — لا سهواً]
/// ١) اتجاه الامتلاء معكوسٌ عن المصدر — انظر التعليق على `Align.alignment`.
/// ٢) النسبة تبدأ من **صفر بالمئة** لا من ٦٪ كما في `@keyframes og-load`
///    الأصلي — انظر التعليق على `widthFactor` أدناه. كل شيء آخر (المدة،
///    المنحنى، الألوان، الحجم، الموضع) يبقى مطابقاً للمرجع حرفياً.
class SplashLoader extends StatelessWidget {
  const SplashLoader({super.key, required this.loadFill});

  /// شريط تحميل يتمدد بـ `og-load` — قيمته المسترجعة هي `t` من ٠ إلى ١.
  final Animation<double> loadFill;

  /// لون خلفية المسار — `rgba(28,16,58,.10)` في المصدر.
  static const _trackColor = Color(0x1A1C103A);
  static const _captionColor = Color(0xFF9187B0);

  /// `linear-gradient(90deg, var(--pink), var(--violet))` — تدرّجٌ بزاوية
  /// مطلقة في CSS لا يتأثر باتجاه النص، فوردي دائماً في الطرف **الفيزيائي**
  /// الأيسر وبنفسجي في الأيمن.
  ///
  /// [CRITICAL] لا تُستعمل `AppColors.primaryGradient` هنا: ذاك تدرّجٌ
  /// قطريّ (من الزاوية العلوية اليمنى إلى السفلية اليسرى) مُعَدٌّ لأسطح
  /// أخرى (بطاقة الحساب، عنصر التنقّل)، وتطبيقه على شريطٍ رفيع جداً
  /// (١٦٨×٥) كان يقلب توزيع اللونين — الوردي يميل لليمين والبنفسجي لليسار،
  /// عكس ما يُنتجه `90deg` تماماً. هذا تدرّجٌ أفقي بحت مطابقٌ للمصدر حرفياً.
  static const _fillGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [AppColors.secondary, AppColors.primary],
  );

  @override
  Widget build(BuildContext context) {
    return PositionedDirectional(
      start: 0,
      end: 0,
      bottom: 64,
      // يحمي الشرح من الاصطدام بشريط تنقّل النظام السفلي (مؤشّر الإيماءة في
      // iOS، أو شريط التنقّل في أندرويد) على الأجهزة ذات الحواف الكبيرة —
      // بلا أثر على الأجهزة العادية لأن `SafeArea` لا تضيف حشوة إن لم تكن
      // هناك حافة نظام أصلاً. الشاشات المماثلة في المشروع (حاجز الاتصال
      // مثلاً) تتّبع النمط نفسه لمحتواها التفاعلي/النصّي.
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 168,
              height: 5,
              decoration: BoxDecoration(
                color: _trackColor,
                borderRadius: BorderRadius.circular(AppDimens.radiusFull),
              ),
              clipBehavior: Clip.antiAlias,
              child: AnimatedBuilder(
                animation: loadFill,
                builder: (context, _) => Align(
                  // [تعديل مقصود يخالف المرجع صراحةً — ليس خطأً يُصلَح لاحقاً]
                  //
                  // في مصدر التصميم (`Otaku Galaxy v2.dc.html`)، الشريط
                  // صندوق كتلة بلا هوامش يُثبَّت فيزيائياً على اليسار
                  // ويكبر نحو اليمين (`linear-gradient(90deg,pink,violet)`
                  // على صندوقٍ لا يتأثر ثباته بـ`dir="rtl"`). تحقّقتُ من هذا
                  // فعلياً بعرض الودجت ومسح بكسلاته — كان مطابقاً تماماً.
                  //
                  // بطلبٍ صريح من المستخدم، بعد إطلاعه على هذا التطابق
                  // وتأكيده أنه يريد الاتجاه المعاكس رغم مخالفته للمرجع:
                  // الشريط الآن يُثبَّت فيزيائياً على اليمين ويكبر نحو
                  // اليسار. لا تُعِد `Alignment.centerLeft` هنا ظنّاً منك
                  // أنها إصلاحٌ لعطلٍ — هذا الانعكاس مقصود ومُوثَّق.
                  alignment: Alignment.centerRight,
                  child: FractionallySizedBox(
                    // [مخالفة مقصودة للمرجع] `@keyframes og-load` الأصلي
                    // يبدأ من ٦٪ لا صفر — كان `widthFactor` هنا يُعيد صياغة
                    // `loadFill.value` (٠→١ الحقيقية من `_loadController`)
                    // إلى مدى ٠٫٠٦→١ ليطابق ذلك حرفياً. بطلبٍ صريح من
                    // المستخدم — الشريط بدا "سريعاً جداً ويبدأ من نحو ٦٪"
                    // بصرياً — أُزيلت إعادة الصياغة: `widthFactor` الآن
                    // *نفس* قيمة الحركة الحقيقية بلا تحوير، فيبدأ العرض من
                    // صفرٍ فعلي وينتهي عند الواحد الصحيح. المدة والمنحنى
                    // (`SplashTiming.load`، `Curves.ease`) لم يتغيّرا؛
                    // الفرق بصريّ بحت في نقطة البداية لا في زمن الحركة.
                    widthFactor: loadFill.value,
                    // [CRITICAL] `heightFactor: 1` ضروري — بدونه لا يحصل
                    // التعبئة على قيد ارتفاع مُحكَم فيرثه `DecoratedBox`
                    // (بلا ولد) كأصغر حجمٍ ممكن ضمن قيودٍ غير محكَمة، أي
                    // صفراً. النتيجة: الشريط كان يُرسم بارتفاع صفر — غير
                    // مرئي البتّة رغم صحّة كل حساب آخر (الاتجاه، التدرّج،
                    // التوقيت). عُثر عليه بالتقاط الشاشة فعلياً ومسح
                    // بكسلاتها لا بقراءة الشيفرة وحدها.
                    heightFactor: 1,
                    child: const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: _fillGradient,
                        borderRadius: BorderRadius.all(
                          Radius.circular(AppDimens.radiusFull),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'جاري التحميل…',
              style: TextStyle(
                fontSize: 11.5,
                color: _captionColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
