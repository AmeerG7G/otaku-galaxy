// انحدار: رسالة «تمت إضافة المنتج إلى السلة» كانت تبقى على الشاشة للأبد.
//
// السبب لم يكن غياب مؤقّت، بل `SnackBar.persist` الذي صار منذ Flutter 3.29
// يساوي `action != null` افتراضياً. الشريط يحمل زرّ «عرض السلة»، فكان
// المؤقّت ينتهي ثم يعود دون إخفاء. الاختبارات هنا تقيس السلوك الظاهر
// (هل تختفي؟) لا وجود العلم، فتبقى صالحة لو تغيّرت آلية الإطار لاحقاً.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/cart/presentation/cart_actions.dart';

const _message = 'تمت إضافة المنتج إلى السلة';

Widget _host(ThemeData theme) => MaterialApp(
  theme: theme,
  home: Scaffold(
    body: Builder(
      builder: (ctx) => Center(
        child: ElevatedButton(
          onPressed: () => showAddedToCartSnack(ctx),
          child: const Text('add'),
        ),
      ),
    ),
  ),
);

/// يضغط الزرّ ثم ينتظر اكتمال حركة الدخول — عندها فقط يُنشئ
/// `ScaffoldMessenger` مؤقّت الإخفاء.
Future<void> _add(WidgetTester tester) async {
  await tester.tap(find.text('add'));
  await tester.pumpAndSettle();
}

void main() {
  for (final entry in {'فاتح': AppTheme.light, 'داكن': AppTheme.dark}.entries) {
    group('مظهر ${entry.key}', () {
      testWidgets('تظهر الرسالة ثم تختفي وحدها', (tester) async {
        await tester.pumpWidget(_host(entry.value));

        await _add(tester);
        expect(find.text(_message), findsOneWidget);
        expect(find.text('عرض السلة'), findsOneWidget, reason: 'زرّ الإجراء يبقى كما في التصميم');

        // بعد المدّة المقرّرة يجب أن تختفي بلا أي تدخّل من المستخدم.
        await tester.pump(const Duration(seconds: 4));
        await tester.pumpAndSettle();
        expect(find.text(_message), findsNothing, reason: 'الرسالة علقت على الشاشة');
      });

      testWidgets('تبقى ظاهرة قبل انتهاء المدّة', (tester) async {
        await tester.pumpWidget(_host(entry.value));
        await _add(tester);

        await tester.pump(const Duration(milliseconds: 600));
        expect(find.text(_message), findsOneWidget, reason: 'اختفت مبكراً جداً');

        await tester.pump(const Duration(seconds: 4));
        await tester.pumpAndSettle();
        expect(find.text(_message), findsNothing);
      });
    });
  }

  testWidgets('إضافة منتج ثانٍ تستبدل الرسالة ولا تكدّسها', (tester) async {
    await tester.pumpWidget(_host(AppTheme.light));

    await _add(tester);
    await tester.pump(const Duration(milliseconds: 600));
    await _add(tester); // إضافة ثانية قبل اختفاء الأولى

    expect(find.text(_message), findsOneWidget, reason: 'رسالتان فوق بعضهما');

    // ولا تزال تختفي وحدها بعد الثانية.
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    expect(find.text(_message), findsNothing);
  });

  testWidgets('إضافات سريعة متتالية تنتهي برسالة واحدة تختفي', (tester) async {
    await tester.pumpWidget(_host(AppTheme.light));

    for (var i = 0; i < 5; i++) {
      await tester.tap(find.text('add'));
      await tester.pump(const Duration(milliseconds: 120));
    }
    await tester.pumpAndSettle();
    expect(find.text(_message), findsOneWidget);

    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    expect(find.text(_message), findsNothing);
  });

  testWidgets('الضغط على الرسالة يُخفيها فوراً', (tester) async {
    await tester.pumpWidget(_host(AppTheme.light));
    await _add(tester);
    expect(find.text(_message), findsOneWidget);

    await tester.tap(find.text(_message));
    await tester.pumpAndSettle();
    expect(find.text(_message), findsNothing, reason: 'الضغط لم يُخفِ الرسالة');

    // ولا يبقى مؤقّت يرمي بعد الإخفاء اليدوي.
    await tester.pump(const Duration(seconds: 4));
    expect(tester.takeException(), isNull);
  });

  testWidgets('الضغط ثم إضافة منتج جديد يعرض رسالة سليمة من جديد', (
    tester,
  ) async {
    await tester.pumpWidget(_host(AppTheme.light));
    await _add(tester);
    await tester.tap(find.text(_message));
    await tester.pumpAndSettle();
    expect(find.text(_message), findsNothing);

    await _add(tester);
    expect(find.text(_message), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    expect(find.text(_message), findsNothing);
  });

  testWidgets(
    'الانتقال لشاشة أخرى والرسالة ظاهرة لا يرمي استثناءً ولا يترك مؤقّتاً معلّقاً',
    (tester) async {
      await tester.pumpWidget(_host(AppTheme.light));
      await _add(tester);
      expect(find.text(_message), findsOneWidget);

      // دفع شاشة جديدة فوق الحالية بينما الرسالة معروضة.
      final navigator = tester.state<NavigatorState>(find.byType(Navigator));
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Center(child: Text('شاشة أخرى'))),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('شاشة أخرى'), findsOneWidget);

      // تمرير الزمن بعد الانتقال: لا استثناء، ولا تحديث حالة بعد التخلص.
      await tester.pump(const Duration(seconds: 6));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('تفكيك الشجرة والرسالة ظاهرة لا يترك مؤقّتاً يرمي لاحقاً', (
    tester,
  ) async {
    await tester.pumpWidget(_host(AppTheme.light));
    await _add(tester);
    expect(find.text(_message), findsOneWidget);

    // جذر من نوع مختلف يجبر الإطار على تفكيك الشجرة فعلاً بدل إعادة
    // استخدام عناصرها — استبدال MaterialApp بآخر يُبقي ScaffoldMessenger حيّاً.
    await tester.pumpWidget(const SizedBox.shrink());
    expect(find.text(_message), findsNothing);

    // المؤقّت كان معلّقاً وقت التفكيك: تمرير الزمن بعده يجب ألّا يرمي
    // ولا يحاول تحديث حالة عنصر متخلَّص منه.
    await tester.pump(const Duration(seconds: 6));
    expect(tester.takeException(), isNull);
  });
}
