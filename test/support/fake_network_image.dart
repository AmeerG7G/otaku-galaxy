// صورٌ شبكية حقيقية البايتات في الاختبارات — بلا شبكة.
//
// `Image.network` في `flutter_test` يتلقّى ٤٠٠ من كل طلب، فتسقط صورة بنر
// المسؤول إلى `errorBuilder` ولا يُقاس شيء. منذ إزالة البطل المضمَّن
// (2026-10-26) لا شخصية بديلة تُقاس مكانها، فالاختبارات تقدّم بايتات صورةٍ
// حقيقية لكل رابط عبر خطّاف Flutter نفسه (`debugNetworkImageHttpClientProvider`).

import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/painting.dart';

/// كل `NetworkImage` يُحمَّل داخل [body] يتلقّى [bytes] (يُستدعى داخل
/// `tester.runAsync`، ويُحمَّل مسبقاً بـ`precacheImage`). الخطّاف يُلغى قبل
/// انتهاء الاختبار — `flutter_test` يفشل إن بقي متغيّر رسمٍ تصحيحيٌّ مضبوطاً.
Future<T> withServedNetworkImages<T>(
  Uint8List bytes,
  Future<T> Function() body,
) async {
  debugNetworkImageHttpClientProvider = () => _FakeHttpClient(bytes);
  try {
    return await body();
  } finally {
    debugNetworkImageHttpClientProvider = null;
  }
}

/// يحمّل [url] ببايتات [bytes] في ذاكرة الصور **قبل** بناء الشجرة — صورةٌ
/// تبدأ التحميل أثناء البناء تطلب الشبكة الحقيقية (٤٠٠) فيُخبَّأ الخطأ.
/// يُستدعى داخل `tester.runAsync`.
Future<void> cacheNetworkImage(String url, Uint8List bytes) =>
    withServedNetworkImages(bytes, () {
      final done = Completer<void>();
      final stream = NetworkImage(url).resolve(ImageConfiguration.empty);
      late final ImageStreamListener listener;
      listener = ImageStreamListener(
        (_, _) {
          if (!done.isCompleted) done.complete();
          stream.removeListener(listener);
        },
        onError: (error, stack) {
          if (!done.isCompleted) done.completeError(error, stack);
          stream.removeListener(listener);
        },
      );
      stream.addListener(listener);
      return done.future;
    });

/// بايتات أصلٍ من المشروع (مثل `assets/art/characters/29.png`).
Uint8List projectAssetBytes(String path) => File(path).readAsBytesSync();

class _FakeHttpClient implements HttpClient {
  _FakeHttpClient(this._bytes);

  final Uint8List _bytes;

  @override
  bool autoUncompress = true;

  @override
  Future<HttpClientRequest> getUrl(Uri url) async => _FakeRequest(_bytes);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeRequest implements HttpClientRequest {
  _FakeRequest(this._bytes);

  final Uint8List _bytes;

  @override
  final HttpHeaders headers = _FakeHeaders();

  @override
  Future<HttpClientResponse> close() async => _FakeResponse(_bytes);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeResponse extends Stream<List<int>> implements HttpClientResponse {
  _FakeResponse(this._bytes);

  final Uint8List _bytes;

  @override
  int get statusCode => HttpStatus.ok;

  @override
  int get contentLength => _bytes.length;

  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;

  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int> event)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) => Stream<List<int>>.value(_bytes).listen(
    onData,
    onError: onError,
    onDone: onDone,
    cancelOnError: cancelOnError,
  );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHeaders implements HttpHeaders {
  @override
  void add(String name, Object value, {bool preserveHeaderCase = false}) {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
