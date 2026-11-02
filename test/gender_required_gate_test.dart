// حاجز إكمال الجنس (D5): حسابُ زبونٍ بلا جنس يُحجب حتى يختار ذكراً أو أنثى.
//
// [CRITICAL] الجنس إلزاميٌّ وفئتان فقط. هذا الملفّ يثبت أن الحاجز:
// - يظهر للزبون المسجَّل بلا جنس، ولا يظهر للزائر ولا لمن اختار ولا للمسؤول؛
// - لا يعرض إلا خيارين، ولا «تخطٍّ» ولا تسمية لجنسٍ غير محدَّد؛
// - يرسل المفتاح (`male`/`female`) في `PATCH /auth/me` ويُرفع من ردّ الخادم؛
// - يُبقي فشلَ الحفظ محجوباً؛
// - **يغطّي ولا يستبدل**: الشجرة تحته تبقى مركّبة فلا يضيع انتقال شاشة الدخول.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/auth/data/datasources/auth_local_storage.dart';
import 'package:otaku_galaxy/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/user.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/change_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/forgot_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/get_me_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/login_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/register_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/update_profile_usecase.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_state.dart';
import 'package:otaku_galaxy/features/auth/presentation/gender_required_gate.dart';

class _Reply {
  const _Reply(this.status, this.body);
  final int status;
  final Map<String, dynamic> body;
}

class _ScriptedAdapter implements HttpClientAdapter {
  final Map<String, _Reply> replies = {};
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final key = '${options.method.toUpperCase()} ${options.uri.path}';
    final reply = replies[key];
    if (reply == null) throw StateError('لا ردّ مسجَّل لـ $key');
    return ResponseBody.fromString(
      jsonEncode(reply.body),
      reply.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _Storage implements AuthLocalStorage {
  _Storage({required bool loggedIn}) : _token = loggedIn ? 't0' : null;

  String? _token;
  String? _userJson;

  @override
  bool get isLoggedIn => _token != null && _token!.isNotEmpty;
  @override
  String? get token => _token;
  @override
  String? getUserJson() => _userJson;
  @override
  Future<void> load() async {}
  @override
  Future<void> saveSession(String token, String userJson) async {
    _token = token;
    _userJson = userJson;
  }

  @override
  Future<void> updateUser(String userJson) async => _userJson = userJson;
  @override
  Future<void> logout() async {
    _token = null;
    _userJson = null;
  }
}

Map<String, dynamic> _user({String? gender, String role = 'customer'}) => {
  'id': 'u1',
  'username': 'زبون قديم',
  'phone': '+9647701234567',
  'role': role,
  'gender': gender,
  'preferredLanguage': 'ar',
  'isPhoneVerified': true,
};

Map<String, dynamic> _ok(Map<String, dynamic> data) => {
  'success': true,
  'data': data,
  'message': 'ok',
};

class _Harness {
  _Harness(this.adapter, this.auth);
  final _ScriptedAdapter adapter;
  final AuthCubit auth;

  /// جلسةٌ مستعادة من `/auth/me` — أو زائر حين `loggedIn: false`.
  static Future<_Harness> start({
    String? gender,
    String role = 'customer',
    bool loggedIn = true,
  }) async {
    final adapter = _ScriptedAdapter()
      ..replies['GET /api/auth/me'] =
          _Reply(200, _ok({'user': _user(gender: gender, role: role)}));
    final storage = _Storage(loggedIn: loggedIn);
    final dio = Dio(BaseOptions(baseUrl: 'http://stub.invalid/api'))
      ..httpClientAdapter = adapter;
    final api = ApiClient(
      config: AppConfig.development,
      dio: dio,
      tokenProvider: () => storage.token,
    );
    final repo = AuthRepositoryImpl(api: api);
    final auth = AuthCubit(
      localStorage: storage,
      loginUsecase: LoginUsecase(repo),
      registerUsecase: RegisterUsecase(repo),
      forgotPasswordUsecase: ForgotPasswordUsecase(repo),
      getMeUsecase: GetMeUsecase(repo),
      updateProfileUsecase: UpdateProfileUsecase(repo),
      changePasswordUsecase: ChangePasswordUsecase(repo),
    );
    await auth.loadSession();
    return _Harness(adapter, auth);
  }

  List<RequestOptions> patches() => adapter.requests
      .where((r) => r.method.toUpperCase() == 'PATCH' && r.uri.path == '/api/auth/me')
      .toList();
}

/// شاشةٌ تحت الحاجز تعدّ مرّات تركيبها — لإثبات أنها لا تُفكّ.
int _probeMounts = 0;

class _Probe extends StatefulWidget {
  const _Probe();

  @override
  State<_Probe> createState() => _ProbeState();
}

class _ProbeState extends State<_Probe> {
  @override
  void initState() {
    super.initState();
    _probeMounts += 1;
  }

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: Text('محتوى التطبيق')));
}

Widget _app(AuthCubit auth) => BlocProvider<AuthCubit>.value(
  value: auth,
  child: MaterialApp(
    theme: AppTheme.light,
    builder: (context, child) => GenderRequiredGate(child: child!),
    home: const _Probe(),
  ),
);

final _gate = find.byKey(const Key('gender_gate_card'));
final _content = find.text('محتوى التطبيق');

void main() {
  setUp(() => _probeMounts = 0);

  group('من يُحجب', () {
    User user({String? gender, String? role = 'customer'}) =>
        User(id: 'u1', username: 'x', phone: '+9647701234567', role: role, gender: gender);

    test('[CRITICAL] زبون مسجَّل بلا جنس يُحجب؛ ذكر وأنثى لا يُحجبان', () {
      expect(GenderRequiredGate.blocks(AuthAuthenticated(user: user())), isTrue);
      expect(GenderRequiredGate.blocks(AuthAuthenticated(user: user(gender: 'male'))), isFalse);
      expect(GenderRequiredGate.blocks(AuthAuthenticated(user: user(gender: 'female'))), isFalse);
      // قيمةٌ لا نعرفها ليست جنساً: لا تُفسَّر، فيُطلب الاختيار.
      expect(GenderRequiredGate.blocks(AuthAuthenticated(user: user(gender: 'other'))), isTrue);
    });

    test('الزائر والإقلاع والمسؤول لا يُحجبون', () {
      expect(GenderRequiredGate.blocks(const AuthUnauthenticated()), isFalse);
      expect(GenderRequiredGate.blocks(const AuthInitializing()), isFalse);
      expect(GenderRequiredGate.blocks(AuthAuthenticated(user: user(role: 'admin'))), isFalse);
    });
  });

  testWidgets('[CRITICAL] زبون بلا جنس: الحاجز وحده ظاهر، بخيارين فقط، ولا تخطٍّ', (tester) async {
    final h = (await tester.runAsync(() => _Harness.start()))!;
    await tester.pumpWidget(_app(h.auth));
    await tester.pumpAndSettle();

    expect(_gate, findsOneWidget);
    expect(_content, findsNothing, reason: 'المحتوى تحت الحاجز لا يُرسم');
    expect(find.text('ذكر'), findsOneWidget);
    expect(find.text('أنثى'), findsOneWidget);
    expect(find.text('خطوة أخيرة قبل المتابعة'), findsOneWidget);
    // لا فئة ثالثة ولا تسمية لغير المحدَّد ولا طريق تخطٍّ.
    for (final banned in ['لم يُحدَّد', 'غير محدد', 'مجهول', 'تخطي', 'تخطّي', 'لاحقاً']) {
      expect(find.textContaining(banned), findsNothing, reason: banned);
    }

    // زرّ الرجوع لا يرفع الحاجز — الحكم من الجلسة لا من المسار.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(_gate, findsOneWidget);
    await h.auth.close();
  });

  testWidgets('الحفظ بلا اختيار يطلب الاختيار ولا يرسل شيئاً', (tester) async {
    final h = (await tester.runAsync(() => _Harness.start()))!;
    await tester.pumpWidget(_app(h.auth));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('gender_gate_save')));
    await tester.pumpAndSettle();
    expect(find.text('يرجى اختيار الجنس'), findsOneWidget);
    expect(h.patches(), isEmpty);
    expect(_gate, findsOneWidget);
    await h.auth.close();
  });

  testWidgets('[CRITICAL] اختيار «أنثى» يرسل المفتاح، ويرفع الحاجز من ردّ الخادم، والمحتوى لم يُفكّ', (tester) async {
    final h = (await tester.runAsync(() => _Harness.start()))!;
    h.adapter.replies['PATCH /api/auth/me'] = _Reply(200, _ok({'user': _user(gender: 'female')}));
    await tester.pumpWidget(_app(h.auth));
    await tester.pumpAndSettle();
    expect(_probeMounts, 1, reason: 'الشجرة تحت الحاجز مركّبة من البداية');

    await tester.tap(find.text('أنثى'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('gender_gate_save')));
    await tester.pumpAndSettle();

    expect(h.patches(), hasLength(1));
    expect(h.patches().single.data, {'gender': 'female'});
    expect(h.auth.user?.gender, 'female');
    expect(_gate, findsNothing);
    expect(_content, findsOneWidget);
    // [CRITICAL] تغطيةٌ لا استبدال: لو فُكّت الشجرة لضاع انتقال شاشة الدخول.
    expect(_probeMounts, 1, reason: 'المحتوى أُعيد تركيبه — الحاجز استبدل الشجرة');
    await h.auth.close();
  });

  testWidgets('رفض الخادم يُبقي الحاجز ويعرض السبب', (tester) async {
    final h = (await tester.runAsync(() => _Harness.start()))!;
    h.adapter.replies['PATCH /api/auth/me'] = _Reply(400, {
      'success': false,
      'data': null,
      'message': 'اختر ذكراً أو أنثى',
      'error': {'code': 'VALIDATION_ERROR'},
    });
    await tester.pumpWidget(_app(h.auth));
    await tester.pumpAndSettle();

    await tester.tap(find.text('ذكر'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('gender_gate_save')));
    await tester.pumpAndSettle();

    expect(find.byType(SnackBar), findsOneWidget);
    expect(_gate, findsOneWidget);
    expect(h.auth.user?.gender, isNull);
    await h.auth.close();
  });

  testWidgets('«تسجيل الخروج» يعيد زائراً — والحاجز يُرفع بلا جنسٍ مُخمَّن', (tester) async {
    final h = (await tester.runAsync(() => _Harness.start()))!;
    await tester.pumpWidget(_app(h.auth));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('gender_gate_logout')));
    await tester.pumpAndSettle();

    expect(h.auth.state, isA<AuthUnauthenticated>());
    expect(h.patches(), isEmpty, reason: 'الخروج لا يكتب جنساً');
    expect(_gate, findsNothing);
    expect(_content, findsOneWidget);
    await h.auth.close();
  });

  for (final (label, gender, role, loggedIn) in [
    ('زائر', null, 'customer', false),
    ('زبون ذكر', 'male', 'customer', true),
    ('زبونة أنثى', 'female', 'customer', true),
    ('مسؤول بلا جنس', null, 'admin', true),
  ]) {
    testWidgets('لا حاجز: $label', (tester) async {
      final h = (await tester.runAsync(
        () => _Harness.start(gender: gender, role: role, loggedIn: loggedIn),
      ))!;
      await tester.pumpWidget(_app(h.auth));
      await tester.pumpAndSettle();
      expect(_gate, findsNothing);
      expect(_content, findsOneWidget);
      await h.auth.close();
    });
  }
}
