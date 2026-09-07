// حالة «بانتظار توفيره بتاريخ …» — عرضٌ فقط، وبتاريخ من الخادم.
//
// [CRITICAL] ما يُحرَس هنا ثلاثة:
//   • الحالات الثلاث تتبع ما يرسله الخادم لا حالةً محلية.
//   • حالة الموعد **لا تقبل الضغط** — لا اشتراك ثانٍ ولا إلغاء بالخطأ.
//   • التاريخ يُنسَّق من الطبقة المركزية، ولا يُخترع في الودجة.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/utils/formatters.dart';
import 'package:otaku_galaxy/features/restock/data/restock_repository.dart';
import 'package:otaku_galaxy/features/restock/presentation/restock_notify_button.dart';

import 'support/auth_stub.dart';

const _productId = 'p1';

/// مستودع وهمي يمثّل ما يرسله الخادم — لا شبكة ولا حالة محلية.
class _StubRestock implements RestockRepository {
  _StubRestock({this.waiting, this.subscribeResult});

  /// ما يعيده `mine()` — انتظار قائم أو لا شيء.
  RestockWaiting? waiting;

  /// ما يعيده الخادم بعد اشتراك ناجح.
  RestockSubscription? subscribeResult;

  int subscribeCalls = 0;
  int unsubscribeCalls = 0;

  @override
  Future<List<RestockWaiting>> mine() async =>
      waiting == null ? const [] : [waiting!];

  @override
  Future<RestockSubscription> subscribe(String productId) async {
    subscribeCalls++;
    final result =
        subscribeResult ??
        const RestockSubscription(subscribed: true, alreadySubscribed: false);
    waiting = RestockWaiting(
      productId: productId,
      restockAt: result.restockAt,
    );
    return result;
  }

  @override
  Future<void> unsubscribe(String productId) async {
    unsubscribeCalls++;
    waiting = null;
  }
}

// ignore: library_private_types_in_public_api
Future<_StubRestock> pumpButton(
  WidgetTester tester, {
  RestockWaiting? waiting,
  RestockSubscription? subscribeResult,
}) async {
  final repo = _StubRestock(waiting: waiting, subscribeResult: subscribeResult);
  await GetIt.I.reset();
  GetIt.I.registerSingleton<RestockRepository>(repo);

  final auth = stubAuthCubit(gender: 'male');
  await auth.loadSession();

  await tester.pumpWidget(
    BlocProvider.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.light,
        home: const Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(body: RestockNotifyButton(productId: _productId)),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return repo;
}

void main() {
  tearDown(() => GetIt.I.reset());

  group('تنسيق التاريخ المركزي', () {
    test('يوم وشهر بالعربية', () {
      expect(formatShortArabicDate(DateTime(2026, 9, 15)), '15 سبتمبر');
      expect(formatShortArabicDate(DateTime(2026, 1, 3)), '3 يناير');
      expect(formatShortArabicDate(DateTime(2026, 12, 31)), '31 ديسمبر');
    });
  });

  group('الحالات الثلاث', () {
    testWidgets('غير مشترك → دعوة الاشتراك قابلة للضغط', (tester) async {
      await pumpButton(tester);
      expect(find.text('أعلمني عند توفر المنتج'), findsOneWidget);
      expect(find.textContaining('بانتظار توفيره'), findsNothing);
    });

    testWidgets('مشترك بلا موعد → السلوك القائم كما هو', (tester) async {
      await pumpButton(
        tester,
        waiting: const RestockWaiting(productId: _productId),
      );
      expect(find.text('بانتظار التوفر — إلغاء التنبيه'), findsOneWidget);
      expect(find.textContaining('بانتظار توفيره'), findsNothing);
    });

    testWidgets('[CRITICAL] مشترك وله موعد → حالة التاريخ', (tester) async {
      await pumpButton(
        tester,
        waiting: RestockWaiting(
          productId: _productId,
          restockAt: DateTime(2026, 9, 15),
        ),
      );
      expect(find.text('بانتظار توفيره بتاريخ 15 سبتمبر'), findsOneWidget);
      expect(find.text('أعلمني عند توفر المنتج'), findsNothing);
      expect(find.text('بانتظار التوفر — إلغاء التنبيه'), findsNothing);
    });
  });

  group('حالة التاريخ للعرض فقط', () {
    /**
     * [CRITICAL] لا زرّ أصلاً — لا زرّ معطَّل.
     *
     * الزرّ المعطَّل يدعو للضغط ثم لا يستجيب؛ هذه حالةٌ لا فعل فيها، فلا
     * تحمل `onPressed` ولا `InkWell`.
     */
    testWidgets('[CRITICAL] لا زرّ ولا استجابة للضغط', (tester) async {
      final repo = await pumpButton(
        tester,
        waiting: RestockWaiting(
          productId: _productId,
          restockAt: DateTime(2026, 9, 15),
        ),
      );

      expect(find.byType(AnimePrimaryButton), findsNothing);
      expect(find.byType(InkWell), findsNothing);
      expect(find.byType(ElevatedButton), findsNothing);

      // الضغط على النصّ لا يُنتج شيئاً.
      await tester.tap(find.text('بانتظار توفيره بتاريخ 15 سبتمبر'));
      await tester.pumpAndSettle();

      expect(repo.subscribeCalls, 0);
      expect(repo.unsubscribeCalls, 0);
      expect(find.text('بانتظار توفيره بتاريخ 15 سبتمبر'), findsOneWidget);
    });

    testWidgets('الضغط المتكرّر لا يُنشئ اشتراكاً ولا يلغيه', (tester) async {
      final repo = await pumpButton(
        tester,
        waiting: RestockWaiting(
          productId: _productId,
          restockAt: DateTime(2026, 9, 20),
        ),
      );
      for (var i = 0; i < 5; i++) {
        await tester.tap(find.textContaining('بانتظار توفيره'));
        await tester.pump();
      }
      expect(repo.subscribeCalls, 0);
      expect(repo.unsubscribeCalls, 0);
    });

    testWidgets('معلَّمة للقارئ الصوتي كحالة قراءة', (tester) async {
      await pumpButton(
        tester,
        waiting: RestockWaiting(
          productId: _productId,
          restockAt: DateTime(2026, 9, 15),
        ),
      );
      expect(
        tester
            .widgetList<Semantics>(find.byType(Semantics))
            .any((s) => s.properties.readOnly == true),
        isTrue,
      );
    });
  });

  group('الاشتراك بمنتج له موعد', () {
    /** [CRITICAL] الحالة الجديدة تظهر فوراً — بلا إعادة تشغيل ولا تحديث يدوي. */
    testWidgets('[CRITICAL] بعد الاشتراك تتبدّل الواجهة إلى حالة التاريخ', (
      tester,
    ) async {
      final repo = await pumpButton(
        tester,
        subscribeResult: RestockSubscription(
          subscribed: true,
          alreadySubscribed: false,
          restockAt: DateTime(2026, 9, 15),
        ),
      );

      expect(find.text('أعلمني عند توفر المنتج'), findsOneWidget);

      await tester.tap(find.text('أعلمني عند توفر المنتج'));
      await tester.pumpAndSettle();

      expect(repo.subscribeCalls, 1);
      expect(find.text('بانتظار توفيره بتاريخ 15 سبتمبر'), findsOneWidget);
      expect(find.text('أعلمني عند توفر المنتج'), findsNothing);
    });

    testWidgets('الاشتراك بلا موعد يبقي السلوك القائم', (tester) async {
      await pumpButton(
        tester,
        subscribeResult: const RestockSubscription(
          subscribed: true,
          alreadySubscribed: false,
        ),
      );
      await tester.tap(find.text('أعلمني عند توفر المنتج'));
      await tester.pumpAndSettle();
      expect(find.text('بانتظار التوفر — إلغاء التنبيه'), findsOneWidget);
    });
  });

  group('التاريخ يتبع الخادم', () {
    testWidgets('[CRITICAL] تعديل الموعد يغيّر النصّ المعروض', (tester) async {
      await pumpButton(
        tester,
        waiting: RestockWaiting(
          productId: _productId,
          restockAt: DateTime(2026, 9, 15),
        ),
      );
      expect(find.text('بانتظار توفيره بتاريخ 15 سبتمبر'), findsOneWidget);

      // الزبون يغادر الشاشة ثم يعود بعد أن عدّل المسؤول الموعد. التفكيك
      // ضروري: إعادة البناء بنفس النوع تُبقي الحالة فلا يُعاد النداء، وهو
      // ما لا يحدث في التطبيق حين تُفتح الشاشة من جديد.
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();

      await pumpButton(
        tester,
        waiting: RestockWaiting(
          productId: _productId,
          restockAt: DateTime(2026, 9, 20),
        ),
      );
      expect(find.text('بانتظار توفيره بتاريخ 20 سبتمبر'), findsOneWidget);
      expect(find.text('بانتظار توفيره بتاريخ 15 سبتمبر'), findsNothing);
    });

    /**
     * [CRITICAL] التوفر الفعلي يتقدّم على أي موعد متوقَّع.
     *
     * اشتراكٌ بقي لمنتج عاد للتوفر يجب ألّا يعرض «بانتظار…» عن شيء يمكن
     * شراؤه الآن.
     */
    testWidgets('[CRITICAL] المنتج المتوفر لا يعرض حالة الانتظار', (
      tester,
    ) async {
      await pumpButton(
        tester,
        waiting: RestockWaiting(
          productId: _productId,
          restockAt: DateTime(2026, 9, 15),
          inStock: true,
        ),
      );
      expect(find.textContaining('بانتظار توفيره'), findsNothing);
    });

    testWidgets('اشتراك منتج آخر لا يسرّب موعده لهذا المنتج', (tester) async {
      await pumpButton(
        tester,
        waiting: RestockWaiting(
          productId: 'another-product',
          restockAt: DateTime(2026, 9, 15),
        ),
      );
      expect(find.text('أعلمني عند توفر المنتج'), findsOneWidget);
      expect(find.textContaining('بانتظار'), findsNothing);
    });
  });
}
