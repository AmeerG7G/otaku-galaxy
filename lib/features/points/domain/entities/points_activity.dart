/// حركة رصيد نقاط المجرّة (إضافة فقط حالياً — لا خصم).
///
/// تأتي من دفتر النقاط على الخادم. المنح تلقائي هناك (استلام طلب،
/// اعتماد تقييم) ولا يستطيع التطبيق منح نقاط لنفسه.
class PointsActivity {
  const PointsActivity({
    required this.id,
    required this.label,
    required this.amount,
    required this.occurredAt,
  });

  final String id;
  final String label;
  final int amount;
  final DateTime occurredAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'label': label,
    'amount': amount,
    'occurredAt': occurredAt.toIso8601String(),
  };

  factory PointsActivity.fromJson(Map<String, dynamic> json) => PointsActivity(
    id: json['id'] as String,
    label: json['label'] as String,
    amount: json['amount'] as int,
    occurredAt: DateTime.parse(json['occurredAt'] as String),
  );
}
