import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/entities/points_activity.dart';
import '../../domain/repositories/points_repository.dart';

class PointsState {
  const PointsState({
    this.balance = 0,
    this.activity = const [],
    this.loading = false,
    this.error,
  });

  final int balance;
  final List<PointsActivity> activity;
  final bool loading;

  /// رسالة فشل آخر تحميل — تميّز «لا توجد حركات» عن «تعذّر التحميل».
  final String? error;

  PointsState copyWith({
    int? balance,
    List<PointsActivity>? activity,
    bool? loading,
    String? error,
    bool clearError = false,
  }) => PointsState(
    balance: balance ?? this.balance,
    activity: activity ?? this.activity,
    loading: loading ?? this.loading,
    error: clearError ? null : (error ?? this.error),
  );
}

/// يدير رصيد نقاط المجرّة وسجل حركاتها كما يرسلهما الخادم.
///
/// مستوى الأوتاكو مشتقّ من الرصيد في طبقة العرض ([OtakuLevel.forPoints])،
/// والمنح يتم على الخادم حصراً — لا يمنح التطبيق نقاطاً أبداً.
class PointsCubit extends Cubit<PointsState> {
  PointsCubit(this._repository) : super(const PointsState());

  final PointsRepository _repository;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      // النداءان يقرآن نفس الاستجابة المخبّأة — طلب شبكة واحد فعلياً.
      final balance = await _repository.fetchBalance();
      final activity = await _repository.fetchActivity();
      emit(PointsState(balance: balance, activity: activity, loading: false));
    } catch (e) {
      // فشل التحديث يُبقي آخر رصيد معروف، ويميّز الفشل عن «لا حركات».
      emit(state.copyWith(loading: false, error: '$e'));
    }
  }

  /// يُعاد ضبط الحالة عند تبديل الحساب حتى لا يظهر رصيد مستخدم لآخر.
  void clear() => emit(const PointsState());
}
