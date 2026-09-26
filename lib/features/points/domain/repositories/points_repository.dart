import '../entities/level_reward.dart';
import '../entities/otaku_level.dart';
import '../entities/points_activity.dart';

/// ملخّص نقاط المجرّة كما يرسله الخادم.
///
/// الرصيد والحركات والسلّم وموضع الزبون عليه وحالة كل مزيّة — من نداء واحد.
/// الموضع والأهلية محسوبان على الخادم لا في التطبيق.
///
/// [NOTE] `earnRates` حُذف. كان يحمل قيم المنح القابلة للضبط لتشرحها الشاشة
/// بأرقامها الحقيقية — حلٌّ صحيح لمشكلةٍ لم تعد قائمة. القواعد ثابتة الآن،
/// وشرحُها نصٌّ ثابت في الشاشة لا حمولةٌ تُرسل مع كل نداء.
class PointsSummary {
  const PointsSummary({
    this.balance = 0,
    this.activity = const [],
    this.levels = const [],
    this.level,
    this.nextLevel,
    this.pointsToNextLevel = 0,
    this.levelProgress = 0,
    this.rewards = const [],
  });

  final int balance;
  final List<PointsActivity> activity;

  /// سلّم المستويات النشطة مرتّباً تصاعدياً بالعتبة.
  final List<OtakuLevel> levels;

  /// مستوى الزبون الحالي (null إن لم يصل السلّم بعد).
  final OtakuLevel? level;

  /// المستوى التالي، أو null عند القمة.
  final OtakuLevel? nextLevel;

  /// النقاط المتبقية للمستوى التالي (صفر عند القمة).
  final int pointsToNextLevel;

  /// نسبة التقدّم داخل المستوى الحالي (٠..١).
  final double levelProgress;

  /// حالة مزايا المستويات لهذا الزبون — مفتوحة/مطالَب بها/منتهية.
  final List<LevelReward> rewards;

  factory PointsSummary.fromJson(Map<String, dynamic> json) {
    final level = json['level'];
    final nextLevel = json['nextLevel'];
    return PointsSummary(
      balance: (json['balance'] as num?)?.toInt() ?? 0,
      activity: (json['activity'] as List? ?? const [])
          .map((e) => PointsActivity.fromJson(e as Map<String, dynamic>))
          .toList(),
      levels: (json['levels'] as List? ?? const [])
          .map((e) => OtakuLevel.fromJson(e as Map<String, dynamic>))
          .toList(),
      level: level is Map<String, dynamic> ? OtakuLevel.fromJson(level) : null,
      nextLevel: nextLevel is Map<String, dynamic>
          ? OtakuLevel.fromJson(nextLevel)
          : null,
      pointsToNextLevel: (json['pointsToNextLevel'] as num?)?.toInt() ?? 0,
      levelProgress: (json['levelProgress'] as num?)?.toDouble() ?? 0,
      rewards: (json['rewards'] as List? ?? const [])
          .map((e) => LevelReward.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// واجهة مستودع نقاط المجرّة (تعريف فقط).
///
/// المنح على الخادم حصراً عند استلام الطلب أو اعتماد التقييم، فلا يملك
/// التطبيق أي طريقة لمنح نقاط لنفسه.
///
/// [claimReward] الفعل الوحيد المتاح، وهو **طلب** لا قرار: يُرسل مفتاح
/// المستوى ولا شيء غيره — لا رصيد ولا نسبة ولا قيمة. الخادم يقرأ الدفتر
/// ويقرّر، وتكرار الطلب يعيد نفس المزيّة بلا إنشاء ثانية.
abstract class PointsRepository {
  Future<PointsSummary> fetchSummary();

  Future<LevelReward> claimReward(String levelKey);

  /// السلّم وحده — عامّ بلا جلسة. تستعمله استمارة نسيان كلمة المرور
  /// ليختار الزبون مستواه من قائمةٍ لا يكتبه.
  Future<List<OtakuLevel>> fetchLevels();
}
