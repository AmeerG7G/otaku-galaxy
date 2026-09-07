// حاجز إجبار التحديث — الحكم عبر الشبكة، والصمود عبر إعادة التشغيل.
//
// [CRITICAL] الضمانة ذات وجهين: الحاجز يقوم على من هو دون الحدّ ولو أطفأ
// الشبكة أو أعاد التشغيل، ولا يقوم على أحدٍ لمجرّد أن الخادم لم يُجب.
// الوجه الثاني هو الخطِر: خطأٌ فيه يُقفل التطبيق على كل مستخدميه دفعةً
// واحدة لحظةَ تعطُّل الخادم.

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/app_update/data/app_version_repository.dart';
import 'package:otaku_galaxy/features/app_update/data/installed_version.dart';
import 'package:otaku_galaxy/features/app_update/presentation/force_update_gate.dart';
import 'package:otaku_galaxy/features/app_update/presentation/screens/force_update_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// محوّل يردّ إعداداً مضبوطاً، أو يفشل عند الطلب.
class _ConfigAdapter implements HttpClientAdapter {
  _ConfigAdapter({this.minimum = '', this.latest = ''});

  String minimum;
  String latest;
  bool fail = false;
  int calls = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    calls += 1;
    if (fail) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'الشبكة مقطوعة',
      );
    }
    return ResponseBody.fromString(
      '{"success":true,"data":{"minimumSupportedVersion":"$minimum",'
      '"latestVersion":"$latest","androidStoreUrl":"https://play.example/x",'
      '"iosStoreUrl":"","updateMessage":""},"message":null}',
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Future<AppVersionRepository> _repo(
  _ConfigAdapter adapter, {
  String installed = '1.0.0',
}) async {
  final dio = Dio(BaseOptions(baseUrl: 'https://test.local/api'))
    ..httpClientAdapter = adapter;
  return AppVersionRepository(
    ApiClient(dio: dio),
    StaticInstalledVersion(installed),
    await SharedPreferences.getInstance(),
  );
}

/// يبني الحاجز فوق محتوىً معلوم، فيُعرف من الظاهر أيّهما فاز.
///
/// [runId] يجب أن يختلف بين «تشغيلين» في اختبارٍ واحد: بلا مفتاح مختلف
/// يعيد فلاتر استعمال نفس `State` فلا يُعاد الفحص من أوّله — فيمرّ اختبار
/// «إعادة التشغيل» لأن الحالة لم تُمسح أصلاً، لا لأن الحكم صمد.
Widget _gate(AppVersionRepository repository, {String runId = 'run'}) =>
    MaterialApp(
  theme: AppTheme.light,
  locale: const Locale('ar'),
  home: Directionality(
    textDirection: TextDirection.rtl,
    child: ForceUpdateGate(
      key: ValueKey(runId),
      repository: repository,
      child: const Scaffold(body: Text('محتوى التطبيق')),
    ),
  ),
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('[CRITICAL] نسخة دون الحدّ ← الحاجز يستبدل التطبيق', (
    tester,
  ) async {
    final adapter = _ConfigAdapter(minimum: '1.2.0', latest: '1.3.0');
    await tester.pumpWidget(_gate(await _repo(adapter, installed: '1.1.0')));
    await tester.pumpAndSettle();

    expect(find.byType(ForceUpdateScreen), findsOneWidget);
    // الرواتر/المحتوى لم يعد في الشجرة أصلاً — لا طبقةً فوقه.
    expect(find.text('محتوى التطبيق'), findsNothing);
  });

  testWidgets('نسخة تساوي الحدّ ← التطبيق يعمل', (tester) async {
    final adapter = _ConfigAdapter(minimum: '1.2.0');
    await tester.pumpWidget(_gate(await _repo(adapter, installed: '1.2.0')));
    await tester.pumpAndSettle();

    expect(find.byType(ForceUpdateScreen), findsNothing);
    expect(find.text('محتوى التطبيق'), findsOneWidget);
  });

  testWidgets('نسخة أحدث من الحدّ ← التطبيق يعمل', (tester) async {
    final adapter = _ConfigAdapter(minimum: '1.2.0');
    await tester.pumpWidget(_gate(await _repo(adapter, installed: '1.10.0')));
    await tester.pumpAndSettle();
    expect(find.text('محتوى التطبيق'), findsOneWidget);
  });

  testWidgets('بلا حدّ مضبوط ← التطبيق يعمل', (tester) async {
    final adapter = _ConfigAdapter();
    await tester.pumpWidget(_gate(await _repo(adapter, installed: '0.1.0')));
    await tester.pumpAndSettle();
    expect(find.text('محتوى التطبيق'), findsOneWidget);
  });

  testWidgets('[CRITICAL] فشل الشبكة بلا حكمٍ سابق ← لا حجب', (tester) async {
    // خادمٌ ساقط يجب ألّا يُقفل التطبيق على كل مستخدميه. والخادم نفسه يرفض
    // العمليات المحميّة من النسخ القديمة، فالحاجز الحقيقي لا يسقط بهذا.
    final adapter = _ConfigAdapter()..fail = true;
    await tester.pumpWidget(_gate(await _repo(adapter, installed: '0.0.1')));
    await tester.pumpAndSettle();
    expect(find.text('محتوى التطبيق'), findsOneWidget);
  });

  testWidgets('[CRITICAL] الحكم يصمد بعد إعادة التشغيل وبلا شبكة', (
    tester,
  ) async {
    // بدون ذلك يصير إطفاء الإنترنت وسيلةَ تجاوزٍ من سطرين.
    final adapter = _ConfigAdapter(minimum: '2.0.0');
    final repo = await _repo(adapter, installed: '1.0.0');
    await tester.pumpWidget(_gate(repo));
    await tester.pumpAndSettle();
    expect(find.byType(ForceUpdateScreen), findsOneWidget);

    // «إعادة تشغيل»: مستودع جديد على نفس التخزين، والشبكة مقطوعة الآن.
    adapter.fail = true;
    final restarted = await _repo(adapter, installed: '1.0.0');
    await tester.pumpWidget(_gate(restarted, runId: 'restart'));
    await tester.pumpAndSettle();

    expect(find.byType(ForceUpdateScreen), findsOneWidget);
    expect(find.text('محتوى التطبيق'), findsNothing);
  });

  testWidgets('خفضُ الحدّ من الخادم يفكّ الحجب', (tester) async {
    // الحجب ليس نهائياً: ردٌّ ناجح يقول «هذه النسخة مدعومة» يفكّه.
    final adapter = _ConfigAdapter(minimum: '2.0.0');
    await tester.pumpWidget(_gate(await _repo(adapter, installed: '1.0.0')));
    await tester.pumpAndSettle();
    expect(find.byType(ForceUpdateScreen), findsOneWidget);

    adapter.minimum = '1.0.0';
    await tester.pumpWidget(
      _gate(await _repo(adapter, installed: '1.0.0'), runId: 'restart'),
    );
    await tester.pumpAndSettle();
    expect(find.text('محتوى التطبيق'), findsOneWidget);
  });

  testWidgets('[CRITICAL] نسخة غير مقروءة ← لا حجب', (tester) async {
    // تعذّر قناة المنصّة يعطي نسخةً فارغة؛ «لا أعرف» لا تحجب.
    final adapter = _ConfigAdapter(minimum: '9.9.9');
    await tester.pumpWidget(_gate(await _repo(adapter, installed: '')));
    await tester.pumpAndSettle();
    expect(find.text('محتوى التطبيق'), findsOneWidget);
  });

  // `test` لا `testWidgets`: انتظار مستقبَلٍ حقيقي داخل منطقة الزمن الوهمي
  // لا ينتهي بلا ضخّ إطارات، والاختبار هنا لا شجرةَ فيه أصلاً.
  test('رأس X-App-Version يُرسل مع كل طلب', () async {
    // هو ما يجعل الفرض خادميّاً لا واجهيّاً فقط.
    final captured = <String, dynamic>{};
    final dio = Dio(BaseOptions(baseUrl: 'https://test.local/api'))
      ..httpClientAdapter = _HeaderAdapter(captured);
    final client = ApiClient(dio: dio, appVersionProvider: () => '1.4.2');
    await client.get('/anything');
    expect(captured['X-App-Version'], '1.4.2');
  });

  test('الرأس يُحذف حين تكون النسخة مجهولة', () async {
    // الخادم يمرّر الرأس الغائب عمداً؛ إرسال نصّ فارغ يفسد ذلك العقد.
    final captured = <String, dynamic>{};
    final dio = Dio(BaseOptions(baseUrl: 'https://test.local/api'))
      ..httpClientAdapter = _HeaderAdapter(captured);
    final client = ApiClient(dio: dio, appVersionProvider: () => '');
    await client.get('/anything');
    expect(captured.containsKey('X-App-Version'), isFalse);
  });
}

class _HeaderAdapter implements HttpClientAdapter {
  _HeaderAdapter(this.captured);

  final Map<String, dynamic> captured;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    captured.addAll(options.headers);
    return ResponseBody.fromString(
      '{"success":true,"data":null,"message":null}',
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
