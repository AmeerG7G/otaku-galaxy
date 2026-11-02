import 'package:flutter/material.dart';

import '../domain/visual_slot.dart';

/// رسم شخصيةٍ في موضعٍ بعينه — أصلٌ ثابت في الحزمة يحدّده الكود.
///
/// [PRODUCT] كان هذا المكوّن (`CharacterArtwork`) يجلب صورة الموضع من لوحة
/// التحكم عبر الشبكة ويعرض الأصل المضمَّن حتى تصل. أُزيلت ميزة «رسوم
/// الشخصيات» من اللوحة (2026-09-27)، ولكل موضعٍ الآن ملفٌّ مرقَّم ثابت في
/// [CharacterArt] (`assets/art/characters/N.png`): لا شبكة ولا ذاكرة قرص ولا
/// وميض استبدال. استبدالُ الملف بصورةٍ أخرى بالاسم نفسه يغيّر الموضع.
///
/// الصورة: [CharacterArt.forSlot] للموضع — المصدر الوحيد. لا «أصل شاشة»
/// احتياطي بعد اليوم: كان لازماً حين تُجلب الصورة من الشبكة، وصار مساراً ثانياً
/// لا يُعرض أبداً ويشير إلى ملفّاتٍ حُذفت. كل مفاتيح `VisualSlots` في الجدول
/// (يحرسه `test/character_art_test.dart`).
///
/// [PRODUCT] لا شفافية على رسوم الشخصيات (قرار 2026-09-15): تُعرض كما هي.
class CharacterArtwork extends StatelessWidget {
  const CharacterArtwork({
    super.key,
    required this.slot,
    this.width,
    this.height,
    this.fit = BoxFit.contain,
    this.alignment = Alignment.center,
  });

  /// مفتاح الموضع — من `VisualSlots`.
  final String slot;

  final double? width;
  final double? height;
  final BoxFit fit;

  /// موضع الصورة داخل صندوقها حين يختلف شكلها عن شكله.
  final AlignmentGeometry alignment;

  /// الأصل الذي سيُرسم لهذا الموضع.
  String? get asset => CharacterArt.forSlot(slot);

  @override
  Widget build(BuildContext context) {
    final asset = this.asset;
    assert(asset != null, 'CharacterArt has no image for slot $slot');
    if (asset == null) return SizedBox(width: width, height: height);
    return Image.asset(
      asset,
      width: width,
      height: height,
      fit: fit,
      alignment: alignment,
      // أصلٌ حُذف من الحزمة سهواً يترك فراغاً صامتاً لا استثناءَ إطار العمل.
      errorBuilder: (_, _, _) => SizedBox(width: width, height: height),
    );
  }
}
