// عقد إشارة «عاد الاتصال» بين حاجز الاتصال والشاشات (`ReconnectRefetch`).
//
// [CRITICAL] «إعادة المحاولة» في الحاجز كانت تعيد فحص الاتصال وتُخفي الحاجز
// فقط، فتنكشف الشاشات تحته بما صنعته أثناء الانقطاع. الآن ينتقل الحاجز من
// «غير متصل» إلى «متصل» فيُبلغ الشاشات المشتركة مرةً واحدة لكل عودة — لا
// لكل ضغطة، ولا لكل حدثٍ من النظام، ولا حين تكون الشبكة ما تزال مقطوعة.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/connectivity/presentation/offline_gate.dart';
import 'package:otaku_galaxy/features/connectivity/presentation/reconnect_refetch.dart';

/// شاشةٌ تعدّ ما يصلها من إشارات العودة.
class _Probe extends StatefulWidget {
  const _Probe({required this.onReconnected});

  final VoidCallback onReconnected;

  @override
  State<_Probe> createState() => _ProbeState();
}

class _ProbeState extends State<_Probe> with ReconnectRefetch {
  @override
  void onReconnected() => widget.onReconnected();

  @override
  Widget build(BuildContext context) => const SizedBox.expand();
}

const _method = MethodChannel('dev.fluttercommunity.plus/connectivity');
const _events = EventChannel('dev.fluttercommunity.plus/connectivity_status');

/// قناتا `connectivity_plus` مزيَّفتان — داخل جسم الاختبار (منطقة الزمن
/// المزيَّف)، كما في `home_offline_retry_test.dart`.
class _FakeConnectivity {
  _FakeConnectivity(this.current) {
    final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(_method, (call) async => call.method == 'check' ? current : null);
    messenger.setMockStreamHandler(
      _events,
      MockStreamHandler.inline(
        onListen: (_, events) {
          _sink = events;
        },
        onCancel: (_) {
          _sink = null;
        },
      ),
    );
    addTearDown(() {
      messenger.setMockMethodCallHandler(_method, null);
      messenger.setMockStreamHandler(_events, null);
    });
  }

  List<String> current;
  MockStreamHandlerEventSink? _sink;

  /// حدثٌ من النظام — يعبر دورةً حقيقية واحدة قبل أن يصل إلى القناة.
  Future<void> emit(WidgetTester tester, List<String> results) async {
    current = results;
    _sink!.success(results);
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
    await tester.pump();
  }
}

Future<void> _pumpGate(WidgetTester tester, Widget home) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      builder: (context, child) => OfflineGate(child: child!),
      home: Scaffold(body: home),
    ),
  );
  await tester.pump();
  await tester.pump();
}

Finder get _gateRetry => find.descendant(
  of: find.byType(OfflineGateScreen),
  matching: find.byType(AnimePrimaryButton),
);

Future<void> _tapRetry(WidgetTester tester) async {
  await tester.tap(_gateRetry);
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('إعادة المحاولة والشبكة مقطوعة: الحاجز باقٍ ولا إشارة', (tester) async {
    final net = _FakeConnectivity(['none']);
    var calls = 0;
    await _pumpGate(tester, _Probe(onReconnected: () => calls++));
    expect(find.byType(OfflineGateScreen), findsOneWidget);

    await _tapRetry(tester);
    await _tapRetry(tester);
    expect(find.byType(OfflineGateScreen), findsOneWidget);
    expect(calls, 0);
    expect(net.current, ['none']);
  });

  testWidgets('إعادة المحاولة بعد عودة الشبكة: إشارةٌ واحدة مهما تكرّر الضغط أو وصل حدث النظام', (
    tester,
  ) async {
    final net = _FakeConnectivity(['none']);
    var calls = 0;
    await _pumpGate(tester, _Probe(onReconnected: () => calls++));

    net.current = ['wifi'];
    await tester.tap(_gateRetry);
    await tester.tap(_gateRetry);
    await tester.tap(_gateRetry);
    await tester.pump();
    await tester.pump();
    await net.emit(tester, ['wifi']);
    expect(find.byType(OfflineGateScreen), findsNothing);
    expect(calls, 1);
  });

  testWidgets('حدث النظام وحده: انقطاع ثم عودة = إشارة؛ كل عودةٍ لاحقة إشارةٌ جديدة', (tester) async {
    final net = _FakeConnectivity(['wifi']);
    var calls = 0;
    await _pumpGate(tester, _Probe(onReconnected: () => calls++));
    expect(find.byType(OfflineGateScreen), findsNothing);

    await net.emit(tester, ['mobile']); // متصل ← متصل: لا عودة.
    expect(calls, 0);

    await net.emit(tester, ['none']);
    expect(find.byType(OfflineGateScreen), findsOneWidget);
    expect(calls, 0, reason: 'الانقطاع ليس عودة');

    await net.emit(tester, ['wifi']);
    expect(find.byType(OfflineGateScreen), findsNothing);
    expect(calls, 1);

    await net.emit(tester, ['none']);
    await net.emit(tester, ['mobile']);
    expect(calls, 2);
  });

  testWidgets('بلا حاجزٍ في الشجرة (اختبارٌ معزول): الخلّاط لا يشترك ولا يرمي', (tester) async {
    var calls = 0;
    await tester.pumpWidget(MaterialApp(home: _Probe(onReconnected: () => calls++)));
    expect(find.byType(_Probe), findsOneWidget);
    expect(tester.takeException(), isNull);
    expect(calls, 0);
  });

  testWidgets('شاشةٌ أُزيلت لا تصلها إشارة (الاشتراك يُلغى عند التخلّص)', (tester) async {
    final net = _FakeConnectivity(['none']);
    var calls = 0;
    final show = ValueNotifier<bool>(true);
    addTearDown(show.dispose);
    await _pumpGate(
      tester,
      ValueListenableBuilder<bool>(
        valueListenable: show,
        builder: (_, visible, _) => visible ? _Probe(onReconnected: () => calls++) : const SizedBox(),
      ),
    );
    show.value = false;
    await tester.pump();

    net.current = ['wifi'];
    await _tapRetry(tester);
    expect(find.byType(OfflineGateScreen), findsNothing);
    expect(calls, 0);
    expect(tester.takeException(), isNull);
  });
}
