/// حالة مزيّة مستوى بالنسبة لصاحب الحساب.
///
/// الحالات الثلاث متمايزة عمداً ولا تُختصر في علم واحد:
///   • [unlocked] بلغ العتبة — يظهر له زرّ المطالبة.
///   • [claimed] طالب بها فحُجزت له: الخصم ينتظر طلبه القادم، والهدية تنتظر
///     تسليم المتجر.
///   • [consumed] انتهت: خصمٌ طُبِّق على طلب، أو هدية سُلّمت.
///
/// [CRITICAL] كلها من الخادم. التطبيق لا يقرّر أهلية ولا يحسب قيمة خصم؛
/// ضغطةُ «المطالبة» طلبٌ يُبتّ على الخادم بالرصيد المحفوظ في الدفتر.
class LevelReward {
  const LevelReward({
    required this.levelKey,
    required this.requiredPoints,
    required this.kind,
    required this.unlocked,
    required this.claimed,
    required this.consumed,
    required this.claimable,
    this.percent,
    this.capAmount,
    this.giftAmount,
    this.claimedAt,
    this.consumedAt,
    this.fulfilledAt,
  });

  final String levelKey;
  final int requiredPoints;

  /// `discount` أو `gift`.
  final String kind;

  final bool unlocked;
  final bool claimed;
  final bool consumed;

  /// هل يُعرض زرّ المطالبة الآن؟ يحسبه الخادم (مفتوحة وغير مطالَب بها).
  final bool claimable;

  /// نسبة الخصم وسقفه — للخصومات فقط.
  final int? percent;
  final num? capAmount;

  /// قيمة الهدية بالدينار — للهدايا فقط.
  final num? giftAmount;

  final DateTime? claimedAt;
  final DateTime? consumedAt;
  final DateTime? fulfilledAt;

  bool get isGift => kind == 'gift';
  bool get isDiscount => kind == 'discount';

  /// مطالَب بها ولم تُصرف بعد — «جاهزة للاستعمال».
  bool get isReady => claimed && !consumed;

  static DateTime? _date(Object? value) =>
      value == null ? null : DateTime.tryParse(value.toString());

  factory LevelReward.fromJson(Map<String, dynamic> json) => LevelReward(
    levelKey: json['levelKey']?.toString() ?? '',
    requiredPoints: (json['requiredPoints'] as num?)?.toInt() ?? 0,
    kind: json['kind']?.toString() ?? 'gift',
    unlocked: json['unlocked'] as bool? ?? false,
    claimed: json['claimed'] as bool? ?? false,
    consumed: json['consumed'] as bool? ?? false,
    claimable: json['claimable'] as bool? ?? false,
    percent: (json['percent'] as num?)?.toInt(),
    capAmount: json['capAmount'] as num?,
    giftAmount: json['giftAmount'] as num?,
    claimedAt: _date(json['claimedAt']),
    consumedAt: _date(json['consumedAt']),
    fulfilledAt: _date(json['fulfilledAt']),
  );
}
