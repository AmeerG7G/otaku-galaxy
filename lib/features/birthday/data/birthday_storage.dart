import 'package:flutter/foundation.dart';

import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';

/// حالة عيد الميلاد — مصدرها الآن الخادم بدل التخزين المحلي.
///
/// الواجهة المتزامنة (getters) بقيت كما هي حتى لا تتغير الشاشات؛ القيم
/// تُقرأ من نسخة مخبّأة تُحدَّث عبر [refresh].
///
/// قواعد العمل صار يفرضها الخادم لا الواجهة:
/// - خيار إضافة تاريخ الميلاد لا يظهر إلا بعد استلام أول طلب.
/// - التاريخ يُحفظ مرة واحدة ولا يُعدَّل بعدها.
/// - الخصم متاح في يوم الميلاد فقط ومرة واحدة في السنة، بنسبة يرسلها
///   الخادم في [discountPercent] — يفرضه قيد فريد في قاعدة البيانات عند
///   إنشاء الطلب، لا شرط في التطبيق.
class BirthdayStorage {
  BirthdayStorage({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  int? _day;
  int? _month;
  bool _unlocked = false;
  bool _isBirthdayToday = false;
  bool _rewardAvailable = false;
  int _discountPercent = 5;

  /// يتغيّر كلما وصلت حالة جديدة من الخادم — تستمع له الشاشات لتُعيد البناء
  /// بلا تحويل الحالة إلى Cubit جديد.
  final ValueNotifier<int> revision = ValueNotifier(0);

  /// يصبح `true` بعد استلام العميل أول طلب — يشتقّه الخادم من الطلبات المكتملة.
  bool get isUnlocked => _unlocked;

  int? get day => _day;
  int? get month => _month;

  bool get hasBirthday => _day != null && _month != null;

  bool get isBirthdayToday => _isBirthdayToday;

  /// الخصم متاح: يوم الميلاد + لم يُستهلك هذه السنة.
  bool get isRewardAvailable => _rewardAvailable;

  int get discountPercent => _discountPercent;

  /// يحدّث النسخة المخبّأة من الخادم. يُستدعى بعد تسجيل الدخول وعند فتح
  /// الشاشات التي تعتمد عليها.
  Future<void> refresh() async {
    try {
      final data = await _api.get(ApiEndpoints.birthday);
      _apply((data as Map<String, dynamic>?) ?? const {});
    } catch (_) {
      // فشل التحديث لا يجب أن يكسر الشاشة — تبقى آخر نسخة معروفة.
    }
  }

  Future<void> save({required int day, required int month}) async {
    final data = await _api.post(
      ApiEndpoints.birthday,
      body: {'day': day, 'month': month},
    );
    _apply((data as Map<String, dynamic>?) ?? const {});
  }

  void _apply(Map<String, dynamic> data) {
    _unlocked = data['unlocked'] as bool? ?? false;
    _day = (data['day'] as num?)?.toInt();
    _month = (data['month'] as num?)?.toInt();
    _isBirthdayToday = data['isBirthdayToday'] as bool? ?? false;
    _rewardAvailable = data['rewardAvailable'] as bool? ?? false;
    _discountPercent = (data['discountPercent'] as num?)?.toInt() ?? 5;
    revision.value++;
  }

  /// يُعاد ضبطها عند تسجيل الخروج حتى لا تتسرّب حالة حساب لحساب آخر.
  void clear() {
    _day = null;
    _month = null;
    _unlocked = false;
    _isBirthdayToday = false;
    _rewardAvailable = false;
    revision.value++;
  }

  /// الفتح صار مشتقاً من الطلبات المكتملة على الخادم؛ يبقى الاستدعاء
  /// موجوداً لتحديث النسخة المخبّأة فور تأكيد الاستلام.
  Future<void> unlockAfterFirstOrder() => refresh();

  /// الاستهلاك يُسجَّل على الخادم داخل معاملة إنشاء الطلب؛ هنا نكتفي
  /// بتحديث النسخة المخبّأة.
  Future<void> markRewardUsed() => refresh();
}
