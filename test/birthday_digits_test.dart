// اليوم والشهر بأرقامٍ شرقية.
//
// لوحة المفاتيح العربية تكتب `١٥` والفارسية `۰۷`، و`int.parse` لا يعرفهما.
// الحقلان يمرّان من `normalizeDigits` — المطبِّع نفسه الذي يستعمله الهاتف —
// فتُحفظ القيمة ذاتها مهما كان خطّ الأرقام، ويُرفض ما هو خارج المدى بالخطّ
// نفسه. ولا يجوز أن يُكتب في الحقل ما ليس رقماً بأحد الخطّين.

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/core/utils/digits.dart';
import 'package:otaku_galaxy/features/birthday/data/birthday_storage.dart';
import 'package:otaku_galaxy/features/birthday/presentation/birthday_prompt.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// يسجّل جسم أول `POST` ويردّ بنجاح.
class _RecordingDio {
  Map<String, dynamic>? savedBody;

  Dio build() {
    final dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          savedBody = Map<String, dynamic>.from(options.data as Map);
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: jsonDecode(
                jsonEncode({
                  'success': true,
                  'data': {
                    'unlocked': true,
                    'day': savedBody!['day'],
                    'month': savedBody!['month'],
                    'discountPercent': 5,
                  },
                }),
              ),
            ),
          );
        },
      ),
    );
    return dio;
  }
}

class _Host extends StatelessWidget {
  const _Host({required this.onResult});

  final ValueChanged<bool> onResult;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Builder(
          builder: (context) => TextButton(
            onPressed: () async => onResult(await showBirthdayPrompt(context)),
            child: const Text('open'),
          ),
        ),
      ),
    );
  }
}

Future<_RecordingDio> _pumpOpen(WidgetTester tester, {required List<bool> results}) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  SharedPreferences.setMockInitialValues({});
  final locale = LocaleCubit(await SharedPreferences.getInstance());
  addTearDown(locale.close);

  final recorder = _RecordingDio();
  await GetIt.I.reset();
  GetIt.I.registerLazySingleton<BirthdayStorage>(
    () => BirthdayStorage(api: ApiClient(dio: recorder.build())),
  );
  addTearDown(() => GetIt.I.reset());

  await tester.pumpWidget(
    BlocProvider<LocaleCubit>.value(
      value: locale,
      child: MaterialApp(
        theme: AppTheme.light,
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: _Host(onResult: results.add),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return recorder;
}

Finder _field(String label) => find.ancestor(
  of: find.text(label),
  matching: find.byType(TextField),
);

void main() {
  test('normalizeDigits مصدرٌ واحد: العربية والفارسية والغربية تتساوى', () {
    expect(normalizeDigits('١٥'), '15');
    expect(normalizeDigits('۰۷'), '07');
    expect(normalizeDigits('15'), '15');
    expect(normalizeDigits('٣۱x'), '31x');
  });

  testWidgets('[CRITICAL] `١٥` و`۰۷` يُحفظان يوماً ١٥ وشهراً ٧', (tester) async {
    final results = <bool>[];
    final recorder = await _pumpOpen(tester, results: results);
    final ar = AppStrings.of(AppLanguage.arabic);

    await tester.enterText(_field(ar('day')), '١٥');
    await tester.enterText(_field(ar('month')), '۰۷');
    await tester.tap(find.widgetWithText(AnimePrimaryButton, ar('save')));
    await tester.pumpAndSettle();

    expect(recorder.savedBody, {'day': 15, 'month': 7});
    expect(results, [true]);
    expect(tester.takeException(), isNull);
  });

  testWidgets('خارج المدى بأرقامٍ شرقية يُرفض بالرسالة نفسها', (tester) async {
    final results = <bool>[];
    final recorder = await _pumpOpen(tester, results: results);
    final ar = AppStrings.of(AppLanguage.arabic);

    await tester.enterText(_field(ar('day')), '٣٢');
    await tester.enterText(_field(ar('month')), '۱۳');
    await tester.tap(find.widgetWithText(AnimePrimaryButton, ar('save')));
    await tester.pumpAndSettle();

    expect(find.text(ar('invalidDay')), findsOneWidget);
    expect(find.text(ar('invalidMonth')), findsOneWidget);
    expect(recorder.savedBody, isNull, reason: 'لا حفظ قبل اجتياز التحقق');
    expect(results, isEmpty);
  });

  testWidgets('الحقل لا يقبل غير الأرقام بخطّيها، ولا أكثر من رقمين', (tester) async {
    await _pumpOpen(tester, results: []);
    final ar = AppStrings.of(AppLanguage.arabic);

    await tester.enterText(_field(ar('day')), 'a١b5');
    expect(tester.widget<TextField>(_field(ar('day'))).controller!.text, '١5');

    await tester.enterText(_field(ar('month')), '۰۷۱');
    expect(tester.widget<TextField>(_field(ar('month'))).controller!.text, '۰۷');
  });
}
