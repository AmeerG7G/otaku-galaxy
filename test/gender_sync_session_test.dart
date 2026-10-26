// تزامن الجنس من جهة التطبيق: ما يُرسَل إلى الخادم، وما يُحفظ محلياً، وما
// يبقى بعد الخروج والدخول.
//
// الجنس صفةٌ مخزَّنة بمفتاحٍ ثابت (`male` / `female`) في `users.gender`؛
// التطبيق يرسل المفتاح لا التسمية المعروضة («ذكر» / «أنثى»)، ويحدّث جلسته
// المحلية من ردّ الخادم فوراً، وبعد الدخول من جديد يقرأ من الخادم لا من نسخةٍ
// قديمة. اللوحة تقرأ العمود نفسه (`gender-sync-admin.test.ts` في الخادم).

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/l10n/gender.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/auth/data/datasources/auth_local_storage.dart';
import 'package:otaku_galaxy/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/change_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/forgot_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/get_me_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/login_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/register_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/update_profile_usecase.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_state.dart';

class _Reply {
  const _Reply(this.status, this.body);
  final int status;
  final Map<String, dynamic> body;
}

/// محوّل يردّ حسب `METHOD /path` ويسجّل كل طلب مرّ به.
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

class _RecordingStorage implements AuthLocalStorage {
  String? _token = 't0';
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

  String? get storedGender => _userJson == null
      ? null
      : (jsonDecode(_userJson!) as Map<String, dynamic>)['gender'] as String?;
}

Map<String, dynamic> _user(String gender) => {
  'id': 'u1',
  'username': 'مدقق',
  'phone': '+9647701234567',
  'role': 'customer',
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
  _Harness(this.adapter, this.storage, this.auth);
  final _ScriptedAdapter adapter;
  final _RecordingStorage storage;
  final AuthCubit auth;

  static Future<_Harness> start({String gender = 'male'}) async {
    final adapter = _ScriptedAdapter()
      ..replies['GET /api/auth/me'] = _Reply(200, _ok({'user': _user(gender)}));
    final storage = _RecordingStorage();
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
    api.onUnauthorized = () => auth.forceLogout();
    await auth.loadSession();
    expect(auth.user?.gender, gender);
    return _Harness(adapter, storage, auth);
  }

  List<RequestOptions> requestsTo(String method, String path) => adapter.requests
      .where((r) => r.method.toUpperCase() == method && r.uri.path == path)
      .toList();
}

void main() {
  test('AppGender.value مفاتيحٌ ثابتة لا تسميات — ما يُرسَل هو ما تخزّنه القاعدة', () {
    expect(AppGender.male.value, 'male');
    expect(AppGender.female.value, 'female');
    expect(AppGender.fromValue('female'), AppGender.female);
    expect(AppGender.fromValue('أنثى'), AppGender.unknown);
    expect(AppGender.fromValue(null), AppGender.unknown);
  });

  for (final (from, to) in [('male', 'female'), ('female', 'male')]) {
    test('[CRITICAL] $from → $to: يُرسَل المفتاح، وتتحدّث الحالة والتخزين من ردّ الخادم', () async {
      final h = await _Harness.start(gender: from);
      h.adapter.replies['PATCH /api/auth/me'] = _Reply(200, _ok({'user': _user(to)}));

      await h.auth.updateProfile(gender: AppGender.fromValue(to).value);

      final patches = h.requestsTo('PATCH', '/api/auth/me');
      expect(patches, hasLength(1));
      // الحمولة المفتاح وحده — لا معرّف مستخدم، ولا تسمية معروضة.
      expect(patches.single.data, {'gender': to});
      expect(h.auth.state, isA<AuthAuthenticated>());
      expect(h.auth.user?.gender, to);
      expect(h.storage.storedGender, to, reason: 'النسخة المحلية من ردّ الخادم');
      await h.auth.close();
    });
  }

  test('[CRITICAL] الخروج ثم الدخول يقرأ الجنس من الخادم لا من نسخةٍ قديمة', () async {
    final h = await _Harness.start(gender: 'male');
    h.adapter.replies['PATCH /api/auth/me'] = _Reply(200, _ok({'user': _user('female')}));
    await h.auth.updateProfile(gender: 'female');

    await h.auth.logout();
    expect(h.auth.state, isA<AuthUnauthenticated>());
    expect(h.storage.getUserJson(), isNull, reason: 'لا نسخة محلية بعد الخروج');

    // الخادم — مصدر الحقيقة — يعيد القيمة الجديدة عند الدخول.
    h.adapter.replies['POST /api/auth/login'] =
        _Reply(200, _ok({'token': 't1', 'user': _user('female')}));
    await h.auth.login('07701234567', 'secret123');
    expect(h.auth.user?.gender, 'female');
    expect(h.storage.storedGender, 'female');
    await h.auth.close();
  });

  test('رفض الخادم لقيمةٍ غير صالحة يُبقي الحالة والتخزين كما كانا', () async {
    final h = await _Harness.start(gender: 'male');
    h.adapter.replies['PATCH /api/auth/me'] = _Reply(400, {
      'success': false,
      'data': null,
      'message': 'اختر ذكراً أو أنثى',
      'error': {'code': 'VALIDATION_ERROR'},
    });
    await expectLater(h.auth.updateProfile(gender: 'أنثى'), throwsA(anything));
    expect(h.auth.state, isA<AuthAuthenticated>(), reason: 'خطأ تحقق لا يُخرج المستخدم');
    expect(h.auth.user?.gender, 'male');
    expect(h.storage.storedGender, 'male');
    await h.auth.close();
  });
}
