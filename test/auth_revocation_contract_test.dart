// [CRITICAL REGRESSION GUARD]
//
// إيقاف الحساب يجب أن يُنهي الجلسة في التطبيق أيضاً، لا في الخادم وحده.
//
// الخادم صار يرفض التوكن المُصدَر قبل الإيقاف بـ403 ورمز ACCOUNT_SUSPENDED.
// لو ظلّ العميل ينهي الجلسة عند 401 فقط، لبقي المستخدم «مسجّلاً» شكلاً
// بينما يُرفض كل طلب — شاشات فارغة وأخطاء متكررة بلا تفسير ولا مخرج.
//
// وفي المقابل: 403 لأسباب أخرى (نقص صلاحية، رقم غير مفعَّل) ليست نهاية
// جلسة، وإخراج المستخدم عندها خطأٌ مساوٍ في السوء.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/errors/app_exception.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';

/// يردّ استجابة ثابتة لكل طلب — بلا شبكة ولا خادم.
class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.statusCode, this.body);

  final int statusCode;
  final Map<String, dynamic> body;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return ResponseBody.fromString(
      jsonEncode(body),
      statusCode,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

ApiClient _clientReturning(
  int status,
  Map<String, dynamic> body, {
  required void Function() onUnauthorized,
}) {
  // Dio مُحقَّن من الخارج، فلا حاجة لخادم ولا لكشف الحقل الداخلي.
  final dio = Dio(BaseOptions(baseUrl: 'http://stub.invalid/api'))
    ..httpClientAdapter = _StubAdapter(status, body);
  return ApiClient(
    config: AppConfig.development,
    onUnauthorized: onUnauthorized,
    dio: dio,
  );
}

Map<String, dynamic> _failure(String code, String message) => {
  'success': false,
  'data': null,
  'message': message,
  'error': {'code': code},
};

void main() {
  test('403 ACCOUNT_SUSPENDED يُنهي الجلسة', () async {
    var loggedOut = false;
    final client = _clientReturning(
      403,
      _failure('ACCOUNT_SUSPENDED', 'الحساب موقوف — تواصل مع الدعم'),
      onUnauthorized: () => loggedOut = true,
    );

    await expectLater(
      client.get('/cart'),
      throwsA(isA<AppException>()),
    );
    expect(loggedOut, isTrue, reason: 'الحساب الموقوف يجب أن تُنهى جلسته');
  });

  test('401 يُنهي الجلسة (توكن مرفوض أو مُبطل)', () async {
    var loggedOut = false;
    final client = _clientReturning(
      401,
      _failure('SESSION_REVOKED', 'انتهت صلاحية الجلسة'),
      onUnauthorized: () => loggedOut = true,
    );

    await expectLater(client.get('/cart'), throwsA(isA<AppException>()));
    expect(loggedOut, isTrue);
  });

  test('403 لنقص صلاحية لا يُخرج المستخدم', () async {
    var loggedOut = false;
    final client = _clientReturning(
      403,
      _failure('FORBIDDEN', 'لا تملك صلاحية'),
      onUnauthorized: () => loggedOut = true,
    );

    await expectLater(client.get('/admin/users'), throwsA(isA<AppException>()));
    expect(
      loggedOut,
      isFalse,
      reason: 'نقص الصلاحية ليس نهاية جلسة',
    );
  });

  test('403 PHONE_NOT_VERIFIED لا يُخرج المستخدم ويصل رمزه للواجهة', () async {
    var loggedOut = false;
    final client = _clientReturning(
      403,
      _failure('PHONE_NOT_VERIFIED', 'أكمل تفعيل رقمك أولاً'),
      onUnauthorized: () => loggedOut = true,
    );

    try {
      await client.post('/auth/login', body: {'phone': '07701234567'});
      fail('كان يجب أن يرمي');
    } on AppException catch (e) {
      // الرمز يصل للواجهة كي توجّه المستخدم لشاشة التحقق بدل رسالة مبهمة.
      expect(e.code, 'PHONE_NOT_VERIFIED');
      expect(e.statusCode, 403);
    }
    expect(loggedOut, isFalse);
  });
}
