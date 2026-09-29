// حاجز إجبار التحديث — الحكم عبر الشبكة، والصمود عبر إعادة التشغيل.
//
// [CRITICAL] الضمانة ذات وجهين: الحاجز يقوم على من هو دون الحدّ ولو أطفأ
// الشبكة أو أعاد التشغيل، ولا يقوم على أحدٍ لمجرّد أن الخادم لم يُجب.
// الوجه الثاني هو الخطِر: خطأٌ فيه يُقفل التطبيق على كل مستخدميه دفعةً
// واحدة لحظةَ تعطُّل الخادم.

import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/errors/app_exception.dart';
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

  /// الخادم يرفض كل طلبٍ غير إعداد النسخة بـ426 — كما يفعل وسيط النسخة.
  bool rejectOthers = false;

  /// يحبس ردّ إعداد النسخة حتى يكتمل: فحصٌ «في الطريق». الإعداد يُقرأ لحظةَ
  /// وصول الطلب كما يفعل الخادم، فالردّ المحبوس يحمل ما كان قبل أي تغيير.
  Completer<void>? holdVersionReply;

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
    if (rejectOthers && !options.path.endsWith('/app-version')) {
      return ResponseBody.fromString(
        '{"success":false,"error":{"code":"APP_UPDATE_REQUIRED"},'
        '"message":"يلزم تحديث التطبيق للمتابعة"}',
        426,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    final minimum = this.minimum;
    final latest = this.latest;
    final hold = holdVersionReply;
    if (hold != null) await hold.future;
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

/// العميل الذي بُني عليه آخر مستودع — تطلب منه الاختبارات طلباً عادياً.
late ApiClient _lastClient;

Future<AppVersionRepository> _repo(
  _ConfigAdapter adapter, {
  String installed = '1.0.0',
}) async {
  final dio = Dio(BaseOptions(baseUrl: 'https://test.local/api'))
    ..httpClientAdapter = adapter;
  _lastClient = ApiClient(dio: dio);
  return AppVersionRepository(
    _lastClient,
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

/// يرسل طلباً عادياً يرفضه الخادم بـ426، ثم يضخّ حتى يستقرّ حكم الحاجز.
///
/// [CRITICAL] الطلب يُرسَل على ساعة الاختبار الوهمية لا داخل `runAsync`.
/// المستمع يطلق إعادة الفحص متزامناً من داخل معالج الخطأ، فترث منطقةَ الطلب.
/// كانت منطقةً حقيقية، وقفزات Dio بين المعترِضات `Future(() …)` هي مؤقّتات
/// حقيقية، ولم ينتظرها الاختبار إلا بـ50ms من الزمن الفعلي. تحت حمل المجموعة
/// الكاملة كانت المهلة تنقضي قبل وصول الحكم فيفشل التأكيد. على الساعة
/// الوهمية تُطلَق تلك المؤقّتات ضمن `pumpAndSettle` نفسه، فتكتمل السلسلة
/// (426 ← `serverRejections` ← إعادة الفحص ← `setState`) قبل الإطار الذي
/// يُبنى فيه الحكم، أيّاً كان حمل المعالج.
///
/// التوقّع يُعلَّق قبل الضخّ: خطأٌ يكتمل بلا مستمع يُبلَّغ خطأً غير ملتقَط.
Future<void> _rejectAndSettle(WidgetTester tester) async {
  final rejected = expectLater(
    _lastClient.get('/cart'),
    throwsA(isA<AppException>()),
  );
  await tester.pumpAndSettle();
  await rejected;
}

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

  testWidgets('[CRITICAL] رفعُ الحدّ والتطبيق مفتوح: أول 426 يحجب فوراً — بلا انتظار استئناف', (
    tester,
  ) async {
    // كان ردّ 426 يصل رسالةَ خطأٍ عادية لكل طلب ولا يعلم به الحاجز حتى
    // الاستئناف التالي. الآن يعيد الحاجز فحصه من الخادم عند أول رفض.
    final adapter = _ConfigAdapter();
    await tester.pumpWidget(_gate(await _repo(adapter, installed: '1.1.0')));
    await tester.pumpAndSettle();
    expect(find.text('محتوى التطبيق'), findsOneWidget);

    // المسؤول يرفع الحدّ؛ الخادم يرفض الطلبات من الآن.
    adapter
      ..minimum = '1.2.0'
      ..rejectOthers = true;
    await _rejectAndSettle(tester);

    expect(find.byType(ForceUpdateScreen), findsOneWidget);
    expect(find.text('محتوى التطبيق'), findsNothing);
  });

  testWidgets('[CRITICAL] 426 يصل وفحصٌ أقدم في الطريق: لا يضيع — يُعاد الفحص بعده', (
    tester,
  ) async {
    // فحص الإقلاع قرأ الإعداد قبل رفع الحدّ وردّه لم يصل بعد. كان الرفض يُسقَط
    // لأن فحصاً جارياً، ثم يقول الردّ القديم «مدعومة» فلا حجب حتى 426 التالي
    // أو الاستئناف — أي أن أول 426 لم يحجب.
    final adapter = _ConfigAdapter();
    final staleReply = Completer<void>();
    adapter.holdVersionReply = staleReply;
    await tester.pumpWidget(_gate(await _repo(adapter, installed: '1.1.0')));
    // صفرٌ من الزمن الوهمي يُطلق قفزة Dio فيصل فحص الإقلاع إلى الخادم ويُحبس.
    await tester.pump(Duration.zero);
    expect(adapter.calls, 1);

    adapter
      ..minimum = '1.2.0'
      ..rejectOthers = true
      ..holdVersionReply = null;
    await _rejectAndSettle(tester);
    staleReply.complete();
    await tester.pumpAndSettle();

    expect(find.byType(ForceUpdateScreen), findsOneWidget);
    expect(find.text('محتوى التطبيق'), findsNothing);
  });

  testWidgets('426 لسببٍ غير النسخة لا يحجب — الحكم لإعداد الخادم لا للإشارة', (tester) async {
    // الإشارة تُطلق فحصاً فقط؛ إن قال الإعداد إن النسخة مدعومة فلا حجب.
    final adapter = _ConfigAdapter(minimum: '1.0.0')..rejectOthers = true;
    await tester.pumpWidget(_gate(await _repo(adapter, installed: '1.1.0')));
    await tester.pumpAndSettle();
    final callsBefore = adapter.calls;
    await _rejectAndSettle(tester);
    // طلب السلة المرفوض + إعادة الفحص التي أطلقها: بدونها يمرّ هذا الاختبار
    // السلبيّ دون أن يكون الفحص قد جرى أصلاً.
    expect(adapter.calls - callsBefore, 2);
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
