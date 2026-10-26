import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/errors/app_exception.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';

// [CRITICAL REGRESSION GUARD] رفع الصور من التطبيق — ما يصل الخادم فعلاً.
//
// ١. كان الرفع يبني الجزء من **مسار ملف** (`MultipartFile.fromFile`) — وهو
//    `dart:io` وحده: على الويب يرمي `UnsupportedError` دائماً، فلا صورة شخصية
//    ولا صورة تقييم تُرفع من نسخة الويب إطلاقاً. الرفع الآن من **البايتات**.
// ٢. النوع كان يُستنتج من امتداد الملف. `image_picker` على أندرويد يعيد ترميز
//    الصورة JPEG ويُبقي امتداد الأصل (`scaled_….heic`)، فيُعلَن `image/heic`
//    لبايتاتٍ هي JPEG ويرفضها الخادم. النوع الآن من **توقيع البايتات**.
// ٣. مهلة الإرسال ١٥ ثانية كانت تشمل **الجسم كلّه** (`addStream(...).timeout`)
//    فتقطع رفعاً سليماً على خطٍّ بطيء. للرفع مهلته.
// ٤. ردٌّ ناجح بلا `url` كان يمرّ `null` إلى حفظ الصورة الشخصية — فيمسحها.

final _jpeg = Uint8List.fromList([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
final _png = Uint8List.fromList([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
final _webp = Uint8List.fromList([...ascii.encode('RIFF'), 0x1a, 0, 0, 0, ...ascii.encode('WEBPVP8 ')]);
final _html = Uint8List.fromList(utf8.encode('<html><script>alert(1)</script></html>'));

class _Captured {
  _Captured(this.options, this.body);
  final RequestOptions options;
  final String body;
}

/// يلتقط الطلب وجسمه كاملاً ويردّ بما يُضبط.
class _UploadAdapter implements HttpClientAdapter {
  _UploadAdapter({this.status = 201, Object? body, this.contentType})
    : body =
          body ??
          {
            'success': true,
            'data': {'id': 'm1', 'url': '/uploads/review/2026/09/abc.jpg'},
            'message': 'تم رفع الصورة',
          };

  final int status;
  final Object body;
  final String? contentType;
  final captured = <_Captured>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final bytes = <int>[];
    if (requestStream != null) {
      await for (final chunk in requestStream) {
        bytes.addAll(chunk);
      }
    }
    captured.add(_Captured(options, latin1.decode(bytes)));
    return ResponseBody.fromString(
      body is String ? body as String : jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [contentType ?? Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// العميل بخيارات الإنتاج نفسها — وفيها `Content-Type: application/json`
/// الافتراضي الذي يجب أن يُستبدَل بـmultipart عند الرفع.
ApiClient _client(_UploadAdapter adapter) {
  final dio = Dio(
    BaseOptions(
      baseUrl: 'https://staging-api.example/api',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
    ),
  )..httpClientAdapter = adapter;
  return ApiClient(dio: dio, tokenProvider: () => 'JWT-UPLOAD');
}

void main() {
  group('ما يُرسَل', () {
    test('POST multipart إلى /uploads: الملف من البايتات بنوعه الحقيقي + الغرض + التوكن', () async {
      final adapter = _UploadAdapter();
      final url = await _client(adapter).uploadImage(
        '/uploads',
        bytes: _jpeg,
        purpose: 'review',
      );

      expect(url, '/uploads/review/2026/09/abc.jpg');
      final request = adapter.captured.single;
      expect(request.options.method, 'POST');
      expect(request.options.uri.toString(), 'https://staging-api.example/api/uploads');
      expect(request.options.headers['Authorization'], 'Bearer JWT-UPLOAD');
      expect(
        request.options.headers[Headers.contentTypeHeader].toString(),
        startsWith('multipart/form-data; boundary='),
      );
      final body = request.body.toLowerCase();
      expect(body, contains('name="file"; filename="image.jpg"'));
      expect(body, contains('content-type: image/jpeg'));
      expect(body, contains('name="purpose"'));
      expect(request.body, contains('review'));
    });

    test('النوع والامتداد من توقيع البايتات: PNG وWebP', () async {
      final adapter = _UploadAdapter();
      final api = _client(adapter);
      await api.uploadImage('/uploads', bytes: _png, purpose: 'avatar');
      await api.uploadImage('/uploads', bytes: _webp, purpose: 'review');

      expect(adapter.captured[0].body.toLowerCase(), contains('filename="image.png"'));
      expect(adapter.captured[0].body.toLowerCase(), contains('content-type: image/png'));
      expect(adapter.captured[1].body.toLowerCase(), contains('filename="image.webp"'));
      expect(adapter.captured[1].body.toLowerCase(), contains('content-type: image/webp'));
    });

    test('بايتاتٌ ليست صورة تُرسَل بلا نوعٍ مُدَّعى — والحكم للخادم', () async {
      final adapter = _UploadAdapter();
      await _client(adapter).uploadImage('/uploads', bytes: _html, purpose: 'review');

      final body = adapter.captured.single.body.toLowerCase();
      expect(body, contains('content-type: application/octet-stream'));
      expect(body, isNot(contains('content-type: image/')));
    });

    test('للرفع مهلته: الإرسال والاستقبال ≥ ٦٠ ثانية لا ١٥', () async {
      final adapter = _UploadAdapter();
      await _client(adapter).uploadImage('/uploads', bytes: _jpeg, purpose: 'review');

      final options = adapter.captured.single.options;
      expect(options.sendTimeout, ApiClient.uploadTimeout);
      expect(options.receiveTimeout, ApiClient.uploadTimeout);
      expect(ApiClient.uploadTimeout, greaterThanOrEqualTo(const Duration(seconds: 60)));
    });
  });

  group('ما يُستقبَل', () {
    for (final entry in <String, Object?>{
      'بلا data': null,
      'بلا url': {'id': 'm1'},
      'url فارغ': {'id': 'm1', 'url': ''},
      'url ليس مرجعاً': {'id': 'm1', 'url': 'file:///etc/passwd'},
    }.entries) {
      test('ردٌّ ناجح ${entry.key} يرمي «استجابة غير متوقعة» — لا قيمة فارغة تُحفظ', () async {
        final adapter = _UploadAdapter(
          body: {'success': true, 'data': entry.value, 'message': null},
        );
        await expectLater(
          _client(adapter).uploadImage('/uploads', bytes: _jpeg, purpose: 'avatar'),
          throwsA(
            isA<AppException>().having((e) => e.messageKey, 'messageKey', 'errUnexpectedResponse'),
          ),
        );
      });
    }

    test('رفض الخادم يصل برسالته ورمزه', () async {
      final adapter = _UploadAdapter(
        status: 400,
        body: {
          'success': false,
          'data': null,
          'message': 'نوع الصورة غير مدعوم (JPG/PNG/WebP فقط)',
          'error': {'code': 'UNSUPPORTED_MEDIA'},
        },
      );
      await expectLater(
        _client(adapter).uploadImage('/uploads', bytes: _html, purpose: 'review'),
        throwsA(
          isA<AppException>()
              .having((e) => e.message, 'message', 'نوع الصورة غير مدعوم (JPG/PNG/WebP فقط)')
              .having((e) => e.code, 'code', 'UNSUPPORTED_MEDIA')
              .having((e) => e.statusCode, 'statusCode', 400),
        ),
      );
    });

    test('٤١٣ من الوسيط (صفحة HTML) يصل خطأً بحالته لا انهياراً', () async {
      final adapter = _UploadAdapter(
        status: 413,
        body: '<html><body>413 Request Entity Too Large</body></html>',
        contentType: 'text/html',
      );
      await expectLater(
        _client(adapter).uploadImage('/uploads', bytes: _jpeg, purpose: 'review'),
        throwsA(isA<AppException>().having((e) => e.statusCode, 'statusCode', 413)),
      );
    });
  });

  // [CRITICAL] لا واجهة رفعٍ تعتمد `dart:io` في شيفرة التطبيق — تنكسر على الويب.
  test('لا MultipartFile.fromFile ولا fromFileSync في lib/', () {
    final offenders = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'))
        .where((f) => RegExp(r'MultipartFile\.fromFile(Sync)?\(').hasMatch(f.readAsStringSync()))
        .map((f) => f.path)
        .toList();
    expect(offenders, isEmpty);
  });
}
