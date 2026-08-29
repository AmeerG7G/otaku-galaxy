/// مستوى الأوتاكو — يُشتق حسابياً من رصيد نقاط المجرّة الحالي.
///
/// [NOTE] ليس نظاماً منفصلاً على الخادم: لا جدول مستويات ولا مكافآت فعلية.
/// هو تمثيل تقدّمي فوق الرصيد نفسه، فلا يحتاج أي مصدر بيانات إضافي. عند
/// بناء نظام ولاء حقيقي لاحقاً يُستبدل هذا الاشتقاق بقيم من الخادم.
enum OtakuLevel {
  newcomer(1, 'أوتاكو جديد', 'بداية الرحلة', 0),
  active(2, 'أوتاكو فعّال', 'خصم على الطلبات', 30),
  golden(3, 'أوتاكو ذهبي', 'هدية مع الطلب', 80),
  legend(4, 'أسطورة المجرّة', 'وصول مبكر للتشكيلات', 160);

  const OtakuLevel(this.number, this.title, this.reward, this.threshold);

  /// رقم المستوى (١..٤).
  final int number;

  /// اسم المستوى المعروض.
  final String title;

  /// وصف المزية المرتبطة بالمستوى (تحددها الإدارة لاحقاً).
  final String reward;

  /// أقل رصيد نقاط يفتح هذا المستوى.
  final int threshold;

  /// المستوى الحالي حسب الرصيد.
  static OtakuLevel forPoints(int points) {
    var current = OtakuLevel.newcomer;
    for (final level in OtakuLevel.values) {
      if (points >= level.threshold) current = level;
    }
    return current;
  }

  /// المستوى التالي، أو null إذا كان أعلى مستوى.
  OtakuLevel? get next {
    final index = OtakuLevel.values.indexOf(this);
    return index + 1 < OtakuLevel.values.length
        ? OtakuLevel.values[index + 1]
        : null;
  }

  bool get isMax => next == null;

  /// النقاط المتبقية للوصول للمستوى التالي (صفر عند أعلى مستوى).
  int pointsToNext(int points) {
    final upcoming = next;
    if (upcoming == null) return 0;
    final remaining = upcoming.threshold - points;
    return remaining > 0 ? remaining : 0;
  }

  /// نسبة التقدّم داخل المستوى الحالي (٠..١).
  double progress(int points) {
    final upcoming = next;
    if (upcoming == null) return 1;
    final span = upcoming.threshold - threshold;
    if (span <= 0) return 1;
    final done = (points - threshold) / span;
    return done.clamp(0.0, 1.0);
  }
}
