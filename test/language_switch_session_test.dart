// [CRITICAL REGRESSION GUARD] تبديل اللغة لا يُخرج المستخدم.
//
// تبديل اللغة يدفع `PATCH /auth/me {preferredLanguage}` بصمت. الطريق الوحيد
// لإنهاء الجلسة في التطبيق هو `onUnauthorized` الذي يستدعيه عميل الـAPI عند
// كل 401 — فأي 401 «تجاري» (لا يخصّ التوكن) كان يُطيح بجلسةٍ صالحة، ويبتلع
// `_syncPreferredLanguage` السبب. هذا الملف يثبّت العقد: فشل المزامنة بأي
// شكل (تحقق، خادم، شبكة) لا يمسّ الجلسة، ولا يُنهيها إلا 401 يخصّ التوكن.
//
// ويحرس معه عطلين على المسار نفسه في تغيير كلمة المرور: كلمة حالية خاطئة
// كانت تُخرج المستخدم، ونجاحُ التغيير كان يترك توكناً قديماً فيُخرجه الطلب
// التالي (الخادم يرفع `token_version` ويعيد توكناً جديداً يُهمَل).

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/errors/app_exception.dart';
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
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ردّ مسجَّل لمسارٍ واحد.
class _Reply {
  const _Reply(this.status, this.body);
  final int status;
  final Map<String, dynamic> body;
}

/// محوّل يردّ حسب `METHOD /path` ويسجّل كل طلب مرّ به.
class _ScriptedAdapter implements HttpClientAdapter {
  final Map<String, _Reply> replies = {};
  final List<RequestOptions> requests = [];
  bool offline = false;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (offline) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'بلا شبكة',
      );
    }
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

/// تخزين جلسة في الذاكرة يسجّل ما يُكتب فيه.
class _RecordingStorage implements AuthLocalStorage {
  _RecordingStorage(this._token);

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

Map<String, dynamic> _user({String language = 'ar'}) => {
  'id': 'u1',
  'username': 'مدقق',
  'phone': '+9647701234567',
  'role': 'customer',
  'gender': 'male',
  'preferredLanguage': language,
  'isPhoneVerified': true,
};

Map<String, dynamic> _ok(Map<String, dynamic> data) => {
  'success': true,
  'data': data,
  'message': 'ok',
};

Map<String, dynamic> _fail(String code, String message) => {
  'success': false,
  'data': null,
  'message': message,
  'error': {'code': code},
};

class _Harness {
  _Harness._(this.adapter, this.storage, this.locale, this.auth);

  final _ScriptedAdapter adapter;
  final _RecordingStorage storage;
  final LocaleCubit locale;
  final AuthCubit auth;

  static Future<_Harness> start() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final locale = LocaleCubit(prefs);
    final adapter = _ScriptedAdapter()
      ..replies['GET /api/auth/me'] = _Reply(200, _ok({'user': _user()}));
    final storage = _RecordingStorage('t0');
    final dio = Dio(BaseOptions(baseUrl: 'http://stub.invalid/api'))
      ..httpClientAdapter = adapter;
    final api = ApiClient(
      config: AppConfig.development,
      dio: dio,
      tokenProvider: () => storage.token,
      languageProvider: () => locale.state.code,
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
      languageOf: () => locale.state,
    );
    // نفس الربط الذي يقيمه `injection_container.dart`.
    api.onUnauthorized = () => auth.forceLogout();
    locale.onLanguageChanged = (_) => auth.syncPreferredLanguage();

    await auth.loadSession();
    expect(auth.state, isA<AuthAuthenticated>(), reason: 'الجلسة المستعادة');
    return _Harness._(adapter, storage, locale, auth);
  }

  Future<void> close() async {
    await auth.close();
    await locale.close();
  }

  List<RequestOptions> requestsTo(String method, String path) => adapter.requests
      .where((r) => r.method.toUpperCase() == method && r.uri.path == path)
      .toList();
}

void main() {
  group('[CRITICAL] تبديل اللغة يُبقي الجلسة', () {
    test('المزامنة تنجح: اللغة تصل الخادم والجلسة باقية', () async {
      final h = await _Harness.start();
      h.adapter.replies['PATCH /api/auth/me'] =
          _Reply(200, _ok({'user': _user(language: 'ckb')}));

      await h.locale.setLanguage(AppLanguage.kurdish);

      final patches = h.requestsTo('PATCH', '/api/auth/me');
      expect(patches, hasLength(1));
      expect(patches.single.headers['Accept-Language'], 'ckb');
      expect(patches.single.data, {'preferredLanguage': 'ckb'});
      expect(h.auth.state, isA<AuthAuthenticated>());
      expect(h.auth.user?.preferredLanguage, 'ckb');
      expect(h.storage.token, 't0');
      await h.close();
    });

    for (final (label, reply) in <(String, _Reply)>[
      ('رفض تحقق 422', _Reply(422, _fail('VALIDATION_ERROR', 'لغة غير مدعومة'))),
      ('خطأ خادم 500', _Reply(500, _fail('INTERNAL', 'عطل'))),
      ('طلبات كثيرة 429', _Reply(429, _fail('RATE_LIMITED', 'لاحقاً'))),
      ('403 بلا إيقاف', _Reply(403, _fail('FORBIDDEN', 'لا صلاحية'))),
    ]) {
      test('فشل المزامنة ($label) لا يمسّ الجلسة', () async {
        final h = await _Harness.start();
        h.adapter.replies['PATCH /api/auth/me'] = reply;

        await h.locale.setLanguage(AppLanguage.kurdish);

        expect(h.locale.state, AppLanguage.kurdish, reason: 'اللغة تتبدّل محلياً');
        expect(h.auth.state, isA<AuthAuthenticated>());
        expect(h.storage.isLoggedIn, isTrue);
        await h.close();
      });
    }

    test('بلا شبكة: اللغة تتبدّل والجلسة باقية', () async {
      final h = await _Harness.start();
      h.adapter.offline = true;

      await h.locale.setLanguage(AppLanguage.kurdish);

      expect(h.locale.state, AppLanguage.kurdish);
      expect(h.auth.state, isA<AuthAuthenticated>());
      await h.close();
    });

    test('التبديل في الاتجاهين متماثل', () async {
      final h = await _Harness.start();
      h.adapter.replies['PATCH /api/auth/me'] =
          _Reply(200, _ok({'user': _user(language: 'ckb')}));
      await h.locale.setLanguage(AppLanguage.kurdish);
      h.adapter.replies['PATCH /api/auth/me'] =
          _Reply(200, _ok({'user': _user(language: 'ar')}));
      await h.locale.setLanguage(AppLanguage.arabic);

      expect(h.requestsTo('PATCH', '/api/auth/me'), hasLength(2));
      expect(h.auth.state, isA<AuthAuthenticated>());
      expect(h.auth.user?.preferredLanguage, 'ar');
      await h.close();
    });

    test('401 يخصّ التوكن (SESSION_REVOKED) هو وحده ما يُنهي الجلسة', () async {
      final h = await _Harness.start();
      h.adapter.replies['PATCH /api/auth/me'] =
          _Reply(401, _fail('SESSION_REVOKED', 'انتهت الجلسة'));

      await h.locale.setLanguage(AppLanguage.kurdish);

      expect(h.auth.state, isA<AuthUnauthenticated>());
      expect(h.storage.isLoggedIn, isFalse);
      await h.close();
    });
  });

  group('[CRITICAL] تغيير كلمة المرور لا يُخرج صاحبه', () {
    test('كلمة حالية خاطئة: رسالة لا خروج', () async {
      final h = await _Harness.start();
      // الخادم يردّ الآن 400 برمزٍ خاص؛ العميل يجب ألّا يعامل حتى 401 بهذا
      // الرمز على أنه نهاية جلسة — 401 ينهيها فقط برموز التوكن.
      for (final status in [400, 401]) {
        h.adapter.replies['PATCH /api/auth/me/password'] =
            _Reply(status, _fail('INVALID_CURRENT_PASSWORD', 'كلمة المرور الحالية غير صحيحة'));

        await expectLater(
          h.auth.changePassword(currentPassword: 'wrong', newPassword: 'newpass123'),
          throwsA(isA<AppException>().having((e) => e.code, 'code', 'INVALID_CURRENT_PASSWORD')),
        );
        expect(h.auth.state, isA<AuthAuthenticated>(), reason: 'الحالة $status');
        expect(h.storage.token, 't0');
      }
      await h.close();
    });

    test('[CRITICAL] النجاح يحفظ التوكن الجديد ويستعمله الطلب التالي', () async {
      final h = await _Harness.start();
      h.adapter.replies['PATCH /api/auth/me/password'] =
          _Reply(200, _ok({'token': 't1', 'user': _user()}));

      await h.auth.changePassword(currentPassword: 'secret123', newPassword: 'newpass123');

      expect(h.storage.token, 't1', reason: 'التوكن العائد يُحفظ');
      expect(h.auth.state, isA<AuthAuthenticated>());

      // الطلب التالي يحمل التوكن الجديد — وإلا رفضه الخادم بـSESSION_REVOKED.
      h.adapter.replies['PATCH /api/auth/me'] =
          _Reply(200, _ok({'user': _user(language: 'ckb')}));
      await h.locale.setLanguage(AppLanguage.kurdish);
      final next = h.requestsTo('PATCH', '/api/auth/me').single;
      expect(next.headers['Authorization'], 'Bearer t1');
      await h.close();
    });
  });
}
