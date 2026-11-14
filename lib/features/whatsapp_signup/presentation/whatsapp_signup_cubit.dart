import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/errors/app_exception.dart';
import '../../auth/domain/entities/auth_session.dart';
import '../data/whatsapp_signup_repository.dart';
import '../data/whatsapp_signup_store.dart';
import '../domain/whatsapp_signup_models.dart';

enum WhatsAppSignupStep { phone, waiting, details, done }

class WhatsAppSignupState {
  const WhatsAppSignupState({
    this.step = WhatsAppSignupStep.phone,
    this.session,
    this.phase,
    this.mismatched = false,
    this.busy = false,
    this.offline = false,
    this.error,
  });

  final WhatsAppSignupStep step;
  final WhatsAppSignupSession? session;

  /// آخر حالة قالها الخادم — `null` قبل أول استعلام.
  final WhatsAppSignupPhase? phase;

  /// آخر رسالة وصلت من رقمٍ غير الرقم المُدخَل.
  final bool mismatched;
  final bool busy;

  /// ثلاثة استعلامات متتالية فشلت بالشبكة — شريطٌ لا خطأ؛ الاستعلام مستمرّ.
  final bool offline;
  final AppException? error;

  WhatsAppSignupState copyWith({
    WhatsAppSignupStep? step,
    WhatsAppSignupSession? session,
    bool clearSession = false,
    WhatsAppSignupPhase? phase,
    bool clearPhase = false,
    bool? mismatched,
    bool? busy,
    bool? offline,
    AppException? error,
    bool clearError = false,
  }) => WhatsAppSignupState(
    step: step ?? this.step,
    session: clearSession ? null : (session ?? this.session),
    phase: clearPhase ? null : (phase ?? this.phase),
    mismatched: mismatched ?? this.mismatched,
    busy: busy ?? this.busy,
    offline: offline ?? this.offline,
    error: clearError ? null : (error ?? this.error),
  );
}

/// آلة حالات التسجيل عبر واتساب.
///
/// الخادم هو الحَكَم: الحالة تُقرأ منه (`status`) لا من ساعة الجهاز، والعدّاد
/// في الشاشة تجميليّ. الاستعلام كل ٣ ثوانٍ في الدقيقة الأولى ثم كل ٦، ويتوقّف
/// حين يغيب التطبيق (`pause`) ويُستأنف فوراً عند العودة من واتساب (`resume`).
class WhatsAppSignupCubit extends Cubit<WhatsAppSignupState> {
  WhatsAppSignupCubit({
    required this.repository,
    required this.store,
    required this.onSession,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now,
       super(const WhatsAppSignupState());

  final WhatsAppSignupRepository repository;
  final WhatsAppSignupStore store;

  /// يسلّم الجلسة الجديدة لمكعّب المصادقة (`AuthCubit.adoptSession`).
  final Future<void> Function(AuthSession session) onSession;
  final DateTime Function() _now;

  static const fastInterval = Duration(seconds: 3);
  static const slowInterval = Duration(seconds: 6);
  static const fastPeriod = Duration(minutes: 1);

  Timer? _timer;
  DateTime? _pollingSince;
  bool _inFlight = false;
  bool _paused = false;
  int _networkFailures = 0;

  /// يستأنف جلسةً محفوظة إن لم تنتهِ — بعد أن أغلق النظامُ التطبيق.
  Future<void> restore() async {
    final saved = await store.read();
    if (saved == null || isClosed) return;
    // أبعد ما يُستأنف: مهلة الجلسة + مهلة الإكمال على الخادم.
    if (_now().isAfter(saved.expiresAt.add(const Duration(minutes: 15)))) {
      await store.clear();
      return;
    }
    emit(
      state.copyWith(
        step: WhatsAppSignupStep.waiting,
        session: saved,
        clearPhase: true,
      ),
    );
    await refresh();
  }

  Future<void> startSession(String phone) async {
    if (state.busy) return;
    emit(state.copyWith(busy: true, clearError: true));
    try {
      final session = await repository.start(phone);
      await store.write(session);
      if (isClosed) return;
      _pollingSince = _now();
      emit(
        WhatsAppSignupState(
          step: WhatsAppSignupStep.waiting,
          session: session,
          phase: WhatsAppSignupPhase.pending,
        ),
      );
      _schedule();
    } on AppException catch (e) {
      if (!isClosed) emit(state.copyWith(busy: false, error: e));
    }
  }

  /// استعلامٌ واحد الآن — عند العودة من واتساب، أو من المؤقّت.
  Future<void> refresh() async {
    final session = state.session;
    if (session == null || _inFlight || isClosed) return;
    if (state.step != WhatsAppSignupStep.waiting) return;
    _inFlight = true;
    try {
      final status = await repository.status(session);
      _networkFailures = 0;
      if (isClosed) return;
      _apply(status);
    } on AppException catch (e) {
      if (isClosed) return;
      if (e.statusCode == 404 || e.statusCode == 410) {
        // الجلسة لم تعد موجودة (أُطفئ المسار، أو نُظّفت) — كأنها انتهت.
        await store.clear();
        emit(
          state.copyWith(phase: WhatsAppSignupPhase.expired, offline: false),
        );
        _cancel();
      } else {
        _networkFailures++;
        emit(state.copyWith(offline: _networkFailures >= 3));
      }
    } finally {
      _inFlight = false;
    }
    if (!isClosed &&
        state.step == WhatsAppSignupStep.waiting &&
        !(state.phase?.isTerminal ?? false)) {
      _schedule();
    }
  }

  void _apply(WhatsAppSignupStatus status) {
    final phase = status.phase;
    if (phase == WhatsAppSignupPhase.verified) {
      _cancel();
      emit(
        state.copyWith(
          step: WhatsAppSignupStep.details,
          phase: phase,
          offline: false,
          mismatched: false,
        ),
      );
      return;
    }
    if (phase.isTerminal) {
      _cancel();
      unawaited(store.clear());
    }
    emit(
      state.copyWith(
        phase: phase,
        mismatched: status.lastAttemptMismatched,
        offline: false,
      ),
    );
  }

  void pause() {
    _paused = true;
    _cancel();
  }

  Future<void> resume() async {
    _paused = false;
    await refresh();
  }

  Future<void> complete({
    required String username,
    required String gender,
    required String password,
  }) async {
    final session = state.session;
    if (session == null || state.busy) return;
    emit(state.copyWith(busy: true, clearError: true));
    try {
      final auth = await repository.complete(
        session,
        username: username,
        gender: gender,
        password: password,
      );
      await store.clear();
      await onSession(auth);
      if (!isClosed)
        emit(
          state.copyWith(
            step: WhatsAppSignupStep.done,
            busy: false,
            phase: WhatsAppSignupPhase.completed,
          ),
        );
    } on AppException catch (e) {
      if (isClosed) return;
      final phase = switch (e.code) {
        'PHONE_TAKEN' => WhatsAppSignupPhase.phoneTaken,
        'SESSION_EXPIRED' => WhatsAppSignupPhase.expired,
        'SESSION_DEAD' ||
        'SESSION_ATTEMPTS_EXCEEDED' ||
        'SESSION_NOT_FOUND' => WhatsAppSignupPhase.dead,
        _ => null,
      };
      if (phase != null) {
        await store.clear();
        emit(
          state.copyWith(
            step: WhatsAppSignupStep.waiting,
            phase: phase,
            busy: false,
            error: e,
          ),
        );
      } else {
        emit(state.copyWith(busy: false, error: e));
      }
    }
  }

  /// يعود إلى إدخال الرقم — بعد انتهاء المهلة أو لتصحيح الرقم.
  Future<void> restart() async {
    _cancel();
    await store.clear();
    if (!isClosed) emit(const WhatsAppSignupState());
  }

  void _schedule() {
    _cancel();
    if (_paused || isClosed) return;
    final since = _pollingSince ??= _now();
    final interval = _now().difference(since) < fastPeriod
        ? fastInterval
        : slowInterval;
    _timer = Timer(interval, () => unawaited(refresh()));
  }

  void _cancel() {
    _timer?.cancel();
    _timer = null;
  }

  @override
  Future<void> close() {
    _cancel();
    return super.close();
  }
}
