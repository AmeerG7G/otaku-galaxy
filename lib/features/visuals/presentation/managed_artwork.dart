import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/di/injection_container.dart';
import '../data/visuals_repository.dart';

/// رسم شخصية يديره المسؤول، مع أصلٍ مضمَّن يحلّ محلّه عند أي عطل.
///
/// [CRITICAL] `fallbackAsset` **إلزامي**. هذا هو ما يجعل حذف صورة من لوحة
/// التحكم عمليةً آمنة: الشاشة تعود إلى رسمها الأصلي بدل أن تفرغ. جعله
/// اختيارياً كان سيسمح لموضع واحد منسيّ بأن يُظهر فراغاً على هاتف زبون.
///
/// كل مسارات الفشل تنتهي هنا إلى الأصل المضمَّن:
/// الفتحة غير مضبوطة · الرابط فاسد · الشبكة مقطوعة · انتهت المهلة ·
/// الصورة محذوفة من الخادم · الملف تالف · فشل التخزين المؤقت.
///
/// لذلك لا يحتاج أي مستدعٍ أن يكتب `errorBuilder` — ولا يجوز له.
class ManagedArtwork extends StatelessWidget {
  const ManagedArtwork({
    super.key,
    required this.slot,
    required this.fallbackAsset,
    this.width,
    this.height,
    this.fit = BoxFit.contain,
  });

  /// مفتاح الفتحة — من `VisualSlots`.
  final String slot;

  /// الرسم المضمَّن الذي يُعرض متى تعذّر البعيد. إلزامي عمداً.
  ///
  /// (كانت هناك نسخة `orWidget` ببديلٍ من الودجات لأيقونات التواصل؛ صارت
  /// تلك أصولاً ثابتة فحُذفت النسخة — كل موضعٍ مُدارٍ له أصلٌ مضمَّن.)
  final String fallbackAsset;

  final double? width;
  final double? height;
  final BoxFit fit;

  // [PRODUCT] لا شفافية على رسوم الشخصيات المُدارة (قرار 2026-09-15).
  // كان المكوّن يقبل `opacity` فيرسم شخصيةً اختارها المسؤول بـ١٦٪ — فتبدو
  // باهتةً كأن الصورة نفسها معطوبة. الشخصية تُعرض كما صورتها الأصلية؛ ما
  // كان مقصوداً في المرجع «رسمٌ خلفيّ باهت» كان يقصد الأصل المضمَّن لا صورةً
  // يرفعها صاحب المتجر. الهالات والظلال حول الرسم ليست هنا ولم تُمسّ.

  @override
  Widget build(BuildContext context) {
    // القراءة عند البناء لا في المُنشئ: التسجيل في حاوية الاعتماديات قد
    // يتأخّر في الاختبارات، والعنصر يجب أن يعمل قبله وبعده.
    if (!sl.isRegistered<VisualsRepository>()) return _bundled();

    final repository = sl<VisualsRepository>();

    // يُعاد البناء مرة واحدة عند وصول الإعداد، لا باستطلاع دوري ولا بمؤقّت.
    return ValueListenableBuilder<int>(
      valueListenable: repository.revision,
      builder: (context, _, _) {
        final url = repository.urlFor(slot);
        return url == null ? _bundled() : _remote(url);
      },
    );
  }

  Widget _bundled() {
    return Image.asset(
      fallbackAsset,
      width: width,
      height: height,
      fit: fit,
      // حتى الأصل المضمَّن يُحرَس: أصلٌ حُذف من الحزمة سهواً يجب أن يترك
      // فراغاً صامتاً لا أن يُسقط الشاشة باستثناء إطار العمل.
      errorBuilder: (_, _, _) => SizedBox(width: width, height: height),
    );
  }

  Widget _remote(String url) {
    return CachedNetworkImage(
      // [CRITICAL] مفتاحٌ بالفتحة: عنصرُ صورةٍ يُعاد استعماله لفتحةٍ أخرى في
      // الموضع نفسه (شاشة الانتظار تبدّل بين التسجيل والاستعادة، وبطاقات
      // الترويج بين الأولى والثانية) كان سيُبقي إطار الفتحة السابقة معروضاً
      // حتى تُحلّ صورة الجديدة. بالمفتاح لا تحمل فتحةٌ صورةَ غيرها ولو لإطار.
      key: ValueKey<String>('managed-artwork:$slot'),
      imageUrl: url,
      width: width,
      height: height,
      fit: fit,
      // أثناء التحميل الأول يُعرض المضمَّن لا هيكلٌ فارغ: لا قفزة تخطيط،
      // ولا لحظة تكون فيها الشاشة ناقصة رسمها. (صورةٌ في ذاكرة الصور —
      // كما يدفّئها الإقلاع — تُرسم في البناء نفسه فلا يظهر البديل أصلاً.)
      placeholder: (_, _) => _bundled(),
      errorWidget: (_, _, _) => _bundled(),
      // حين يبدّل المسؤول الصورة ويصل الإعداد الجديد تبقى الصورة الحالية
      // معروضةً حتى تُحلّ الجديدة — لا رجوعٌ إلى المضمَّن بينهما.
      useOldImageOnUrlChange: true,
      fadeInDuration: Duration.zero,
      fadeOutDuration: Duration.zero,
    );
  }
}
