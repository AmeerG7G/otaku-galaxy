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
    this.opacity,
  }) : fallbackWidget = null;

  /// نسخة يكون فيها البديل عنصر واجهة لا أصلاً مضمَّناً.
  ///
  /// لبعض المواضع لا يوجد أصل في الحزمة أصلاً — أيقونات التواصل مثلاً،
  /// حيث البديل أيقونة Material. الضمانة نفسها لا تتغيّر: مسار فشل واحد
  /// ينتهي دائماً إلى شيء مرئي.
  const ManagedArtwork.orWidget({
    super.key,
    required this.slot,
    required Widget fallback,
    this.width,
    this.height,
    this.fit = BoxFit.contain,
    this.opacity,
  }) : fallbackAsset = null,
       fallbackWidget = fallback;

  /// مفتاح الفتحة — من `VisualSlots`.
  final String slot;

  /// الرسم المضمَّن الذي يُعرض متى تعذّر البعيد. إلزامي عمداً في المُنشئ
  /// الأساسي — أحد البديلين موجود دائماً.
  final String? fallbackAsset;

  /// بديل كعنصر واجهة (انظر [ManagedArtwork.orWidget]).
  final Widget? fallbackWidget;

  final double? width;
  final double? height;
  final BoxFit fit;

  /// شفافية اختيارية — بعض المواضع تعرض الرسم خلفيةً خافتة.
  final double? opacity;

  @override
  Widget build(BuildContext context) {
    // القراءة عند البناء لا في المُنشئ: التسجيل في حاوية الاعتماديات قد
    // يتأخّر في الاختبارات، والعنصر يجب أن يعمل قبله وبعده.
    if (!sl.isRegistered<VisualsRepository>()) return _wrap(_bundled());

    final repository = sl<VisualsRepository>();

    // يُعاد البناء مرة واحدة عند وصول الإعداد، لا باستطلاع دوري ولا بمؤقّت.
    return ValueListenableBuilder<int>(
      valueListenable: repository.revision,
      builder: (context, _, _) {
        final url = repository.urlFor(slot);
        return _wrap(url == null ? _bundled() : _remote(url));
      },
    );
  }

  Widget _wrap(Widget child) =>
      opacity == null ? child : Opacity(opacity: opacity!, child: child);

  Widget _bundled() {
    final widgetFallback = fallbackWidget;
    if (widgetFallback != null) {
      return SizedBox(width: width, height: height, child: widgetFallback);
    }
    return Image.asset(
      fallbackAsset!,
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
      imageUrl: url,
      width: width,
      height: height,
      fit: fit,
      // أثناء التحميل يُعرض المضمَّن لا هيكلٌ فارغ: لا وميض، ولا قفزة
      // تخطيط، ولا لحظة تكون فيها الشاشة ناقصة رسمها.
      placeholder: (_, _) => _bundled(),
      errorWidget: (_, _, _) => _bundled(),
      fadeInDuration: Duration.zero,
      fadeOutDuration: Duration.zero,
    );
  }
}
