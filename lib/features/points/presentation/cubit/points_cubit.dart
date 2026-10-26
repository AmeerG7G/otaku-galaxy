import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/entities/level_reward.dart';
import '../../domain/entities/otaku_level.dart';
import '../../domain/entities/points_activity.dart';
import '../../domain/repositories/points_repository.dart';

class PointsState {
  const PointsState({
    this.balance = 0,
    this.activity = const [],
    this.levels = const [],
    this.level,
    this.nextLevel,
    this.pointsToNextLevel = 0,
    this.levelProgress = 0,
    this.rewards = const [],
    this.loading = false,
    this.error,
    this.claimingLevelKey,
  });

  final int balance;
  final List<PointsActivity> activity;

  /// سلّم المستويات كما أرسله الخادم — لا قيم محلية.
  final List<OtakuLevel> levels;
  final OtakuLevel? level;
  final OtakuLevel? nextLevel;
  final int pointsToNextLevel;
  final double levelProgress;

  /// حالة مزايا المستويات — مفتوحة/مطالَب بها/منتهية، كما يقرّرها الخادم.
  final List<LevelReward> rewards;

  final bool loading;

  /// المستوى الذي تجري المطالبة بمزيّته الآن — لتعطيل زرّه وحده.
  ///
  /// تعطيل الزرّ أثناء الطلب يمنع الضغطة المزدوجة في الحالة الغالبة؛ الحارس
  /// الحقيقي يبقى في القاعدة، فالشبكة البطيئة وإعادة المحاولة تصلان الخادم
  /// مهما فعلت الواجهة.
  final String? claimingLevelKey;

  /// رسالة فشل آخر تحميل — تميّز «لا توجد حركات» عن «تعذّر التحميل».
  final String? error;

  /// هل وصل شيء من الخادم أصلاً؟ يميّز شاشةً فارغة عن شاشة لم تُحمَّل بعد.
  bool get hasData => levels.isNotEmpty || activity.isNotEmpty;

  PointsState copyWith({
    bool? loading,
    String? error,
    bool clearError = false,
    String? claimingLevelKey,
    bool clearClaiming = false,
  }) => PointsState(
    balance: balance,
    activity: activity,
    levels: levels,
    level: level,
    nextLevel: nextLevel,
    pointsToNextLevel: pointsToNextLevel,
    levelProgress: levelProgress,
    rewards: rewards,
    loading: loading ?? this.loading,
    error: clearError ? null : (error ?? this.error),
    claimingLevelKey: clearClaiming
        ? null
        : (claimingLevelKey ?? this.claimingLevelKey),
  );

  factory PointsState.fromSummary(PointsSummary summary) => PointsState(
    balance: summary.balance,
    activity: summary.activity,
    levels: summary.levels,
    level: summary.level,
    nextLevel: summary.nextLevel,
    pointsToNextLevel: summary.pointsToNextLevel,
    levelProgress: summary.levelProgress,
    rewards: summary.rewards,
  );
}

/// يدير رصيد نقاط المجرّة وسلّم المستويات كما يرسلهما الخادم.
///
/// المستوى لم يعد يُشتقّ في طبقة العرض: العتبات والمزايا بيانات يديرها
/// المسؤول، والخادم هو من يضع الزبون على السلّم. المنح كذلك على الخادم
/// حصراً — لا يمنح التطبيق نقاطاً أبداً.
class PointsCubit extends Cubit<PointsState> {
  PointsCubit(this._repository) : super(const PointsState());

  final PointsRepository _repository;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      emit(PointsState.fromSummary(await _repository.fetchSummary()));
    } catch (e) {
      // فشل التحديث يُبقي آخر رصيد معروف، ويميّز الفشل عن «لا حركات».
      emit(state.copyWith(loading: false, error: '$e'));
    }
  }

  /// المطالبة بمزيّة مستوى.
  ///
  /// [CRITICAL] يُرسل مفتاح المستوى فقط. لا يُحسب هنا استحقاق ولا قيمة خصم:
  /// الخادم يقرأ الرصيد من الدفتر ويبتّ، والقيد الفريد في القاعدة يمنع
  /// مزيّةً ثانية مهما تكرّر الطلب أو تزامن.
  ///
  /// يُعاد تحميل الملخّص بعد النجاح بدل تعديل الحالة محلياً: حالةُ المزيّة
  /// قرارُ خادمٍ لا نعيد إنتاجه هنا.
  Future<void> claimReward(String levelKey) async {
    if (state.claimingLevelKey != null) return;
    emit(state.copyWith(claimingLevelKey: levelKey, clearError: true));
    try {
      await _repository.claimReward(levelKey);
      emit(PointsState.fromSummary(await _repository.fetchSummary()));
    } catch (e) {
      emit(state.copyWith(clearClaiming: true, error: '$e'));
      rethrow;
    }
  }

  /// يُعاد ضبط الحالة عند تبديل الحساب حتى لا يظهر رصيد مستخدم لآخر.
  void clear() => emit(const PointsState());
}
