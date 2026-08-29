import '../entities/points_activity.dart';

/// واجهة مستودع نقاط المجرّة (تعريف فقط).
///
/// القراءة فقط: المنح يتم على الخادم حصراً عند استلام الطلب أو اعتماد
/// التقييم، فلا يملك التطبيق أي طريقة لمنح نقاط لنفسه.
abstract class PointsRepository {
  Future<int> fetchBalance();
  Future<List<PointsActivity>> fetchActivity();
}
