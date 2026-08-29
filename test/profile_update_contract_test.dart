// عقد PATCH /auth/me: الخادم يميّز الحقل الغائب (لا تغيير) عن null الصريحة
// (امسح الصورة). كان التطبيق يُسقط المفتاح عند null فتظهر رسالة «أُزيلت
// الصورة» بينما تبقى الصورة في قاعدة البيانات — هذا الاختبار يحرس ذلك.

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/auth/data/repositories/auth_repository_impl.dart';

/// يلتقط جسم آخر طلب PATCH بدل إرساله فعلاً.
class _CapturingAdapter implements HttpClientAdapter {
  Object? lastBody;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastBody = options.data;
    return ResponseBody.fromString(
      '{"success":true,"data":{"user":{"id":"u1","username":"مدقق",'
      '"phone":"07700000000","avatarUrl":null,"role":"customer",'
      '"createdAt":"2026-01-01T00:00:00.000Z"}},"message":null}',
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late _CapturingAdapter adapter;
  late AuthRepositoryImpl repository;

  setUp(() {
    adapter = _CapturingAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local/api'))
      ..httpClientAdapter = adapter;
    repository = AuthRepositoryImpl(api: ApiClient(dio: dio));
  });

  Map<String, dynamic> body() => adapter.lastBody as Map<String, dynamic>;

  test('clearing the avatar sends an explicit null, not an omitted key', () async {
    await repository.updateProfile(clearAvatar: true);

    expect(body().containsKey('avatarUrl'), isTrue,
        reason: 'المفتاح الغائب يعني «لا تغيير» على الخادم');
    expect(body()['avatarUrl'], isNull);
  });

  test('setting an avatar sends the url', () async {
    await repository.updateProfile(avatarUrl: 'https://cdn.test/a.png');

    expect(body()['avatarUrl'], 'https://cdn.test/a.png');
  });

  test('updating only the username never touches the avatar', () async {
    await repository.updateProfile(username: 'اسم جديد');

    expect(body()['username'], 'اسم جديد');
    expect(body().containsKey('avatarUrl'), isFalse,
        reason: 'إرسال avatarUrl هنا سيمسح صورة المستخدم بلا قصد');
  });
}
