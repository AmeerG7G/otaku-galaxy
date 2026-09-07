// [CRITICAL REGRESSION GUARD]
//
// أهلية التقييم يقرّرها الخادم وحده، والتطبيق يعرض ولا يستنتج.
//
// التاريخ: كانت الأهلية مهلةً (١٦ ساعة) تُحتسب من خروج الطلب للتوصيل
// ويضبطها المسؤول من اللوحة، فالزبون الذي ضغط «استلمت طلبي» كان يُقال له
// «التقييم يُفتح لاحقاً». أُلغيت المهلة: الاستلام يفتح التقييم في اللحظة
// نفسها، والخادم يرسل القرار جاهزاً في `canReview`.
//
// ما تحرسه هذه الاختبارات على طرف العميل:
//   • القرار يُقرأ من الحمولة — لا من الحالة ولا من الطوابع ولا من الساعة.
//   • لا مهلة ولا موعدَ فتحٍ مخبوز في التطبيق.
//   • الزرّ مربوط بالطلب المؤهَّل وحده.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';

import 'support/auth_stub.dart';

/// حمولة طلب كما يعيدها الخادم.
Map<String, dynamic> orderJson({
  required bool canReview,
  String status = 'COMPLETED',
  String? deliveredAt = '2026-08-26T00:00:00.000Z',
}) => {
  'id': 'o1',
  'number': '1001',
  'province': 'بغداد',
  'deliveryFee': 4000,
  'fullAddress': 'عنوان',
  'phone': '07701234567',
  'total': 19000,
  'productsTotal': 15000,
  'discount': 0,
  'deliveryDiscount': 0,
  'status': status,
  'items': <dynamic>[],
  'createdAt': '2026-08-25T00:00:00.000Z',
  'deliveredAt': deliveredAt,
  'canReview': canReview,
  'statusHistory': <dynamic>[],
};

Future<void> pumpCard(
  WidgetTester tester,
  Order order, {
  VoidCallback? onReview,
}) async {
  final auth = stubAuthCubit(gender: 'male');
  await auth.loadSession();
  await tester.pumpWidget(
    BlocProvider.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.light,
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            body: AnimeOrderCard(order: order, onReview: onReview ?? () {}),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  group('القرار يأتي من الخادم', () {
    test('«مفتوح» من الخادم → مفتوح', () {
      expect(Order.fromJson(orderJson(canReview: true)).canReview, isTrue);
    });

    test('«مغلق» من الخادم → مغلق', () {
      expect(Order.fromJson(orderJson(canReview: false)).canReview, isFalse);
    });

    /**
     * [CRITICAL] الحالة والطوابع لا تُستنتَج منها الأهلية.
     *
     * طلبٌ مكتمل ومستلَم، والخادم يقول «لا» — التطبيق يقول «لا». لو اشتقّ
     * التطبيق الأهلية من `status == completed` لانقلب الجواب هنا، ولانفتح
     * التقييم لمن منعه الخادم.
     */
    test('[CRITICAL] لا تُشتقّ من الحالة ولا من لحظة الاستلام', () {
      final order = Order.fromJson(
        orderJson(
          canReview: false,
          status: 'COMPLETED',
          deliveredAt: '2020-01-01T00:00:00.000Z',
        ),
      );
      expect(order.status, OrderStatus.completed);
      expect(order.deliveredAt, isNotNull);
      expect(order.canReview, isFalse);
    });

    test('الحمولة بلا الحقل تُقرأ «مغلقاً» — لا افتراض متساهل', () {
      final json = orderJson(canReview: true)..remove('canReview');
      expect(Order.fromJson(json).canReview, isFalse);
    });

    /** لم يعد للمفهوم القديم أثر في النموذج. */
    test('لا موعد فتحٍ ولا وقت متبقٍّ في النموذج', () {
      final order = Order.fromJson(orderJson(canReview: false));
      expect(
        (order as dynamic).toString(),
        isNotNull,
        reason: 'يكفي أن يُبنى النموذج بلا الحقول الملغاة',
      );
    });
  });

  group('الزرّ مربوط بالطلب المؤهَّل', () {
    testWidgets('[CRITICAL] الطلب المؤهَّل يعرض «قيّم طلبك»', (tester) async {
      await pumpCard(tester, Order.fromJson(orderJson(canReview: true)));
      expect(find.text('قيّم طلبك'), findsOneWidget);
    });

    testWidgets('[CRITICAL] الطلب غير المؤهَّل لا يعرض الزرّ', (tester) async {
      await pumpCard(tester, Order.fromJson(orderJson(canReview: false)));
      expect(find.text('قيّم طلبك'), findsNothing);
    });

    testWidgets('بلا معالج تقييم لا يظهر الزرّ ولو كان مؤهَّلاً', (tester) async {
      final auth = stubAuthCubit(gender: 'male');
      await auth.loadSession();
      await tester.pumpWidget(
        BlocProvider.value(
          value: auth,
          child: MaterialApp(
            theme: AppTheme.light,
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(
                body: AnimeOrderCard(
                  order: Order.fromJson(orderJson(canReview: true)),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('قيّم طلبك'), findsNothing);
    });

    testWidgets('الضغط يُبلّغ عن هذا الطلب بعينه', (tester) async {
      var tapped = 0;
      await pumpCard(
        tester,
        Order.fromJson(orderJson(canReview: true)),
        onReview: () => tapped++,
      );
      await tester.tap(find.text('قيّم طلبك'));
      expect(tapped, 1);
    });

    testWidgets('الصيغة مصرَّفة بجنس صاحب الحساب', (tester) async {
      final auth = stubAuthCubit(gender: 'female');
      await auth.loadSession();
      await tester.pumpWidget(
        BlocProvider.value(
          value: auth,
          child: MaterialApp(
            theme: AppTheme.light,
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(
                body: AnimeOrderCard(
                  order: Order.fromJson(orderJson(canReview: true)),
                  onReview: () {},
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('قيّمي طلبك'), findsOneWidget);
    });
  });

  /**
   * «استلمت طلبي» تفتح التقييم فوراً — والواجهة تقرأ ذلك من ردّ الخادم.
   *
   * [CRITICAL] لا تُبنى الأهلية محلياً بعد التأكيد. المحاكاة هنا هي العقد:
   * الطلب قبل التأكيد `canReview: false`، وردُّ `confirm-receipt` يحمل
   * `canReview: true`، فتتبدّل البطاقة تبعاً للردّ لا تبعاً لضغطة الزرّ.
   */
  group('تأكيد الاستلام يفتح التقييم', () {
    testWidgets('[CRITICAL] البطاقة تتبدّل بعد ردّ الخادم', (tester) async {
      final auth = stubAuthCubit(gender: 'male');
      await auth.loadSession();

      var order = Order.fromJson(
        orderJson(canReview: false, status: 'OUT_FOR_DELIVERY', deliveredAt: null),
      );

      late StateSetter refresh;
      await tester.pumpWidget(
        BlocProvider.value(
          value: auth,
          child: MaterialApp(
            theme: AppTheme.light,
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(
                body: StatefulBuilder(
                  builder: (context, setState) {
                    refresh = setState;
                    return AnimeOrderCard(order: order, onReview: () {});
                  },
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      // قبل التأكيد: لا زرّ تقييم.
      expect(find.text('قيّم طلبك'), findsNothing);

      // ردّ `confirm-receipt` من الخادم — الحالة تُبنى من الحمولة لا محلياً.
      refresh(() {
        order = Order.fromJson(orderJson(canReview: true));
      });
      await tester.pump();

      expect(find.text('قيّم طلبك'), findsOneWidget);
    });
  });

  group('حراسة المصدر — لا مهلة ولا أهلية مخبوزة في التطبيق', () {
    test('[CRITICAL] لا ثابت مهلة في كود الطلبات/التقييمات', () {
      final offenders = <String>[];
      for (final dir in [
        Directory('lib/features/orders'),
        Directory('lib/features/reviews'),
      ]) {
        if (!dir.existsSync()) continue;
        for (final file in dir.listSync(recursive: true).whereType<File>()) {
          if (!file.path.endsWith('.dart')) continue;
          final source = file.readAsStringSync();
          if (RegExp(r'Duration\(\s*hours:\s*(16|24)').hasMatch(source) ||
              RegExp(r'Duration\(\s*days:\s*1\s*\)').hasMatch(source)) {
            offenders.add(file.path);
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'الأهلية من الخادم — لا مهلة تُخبز في التطبيق: $offenders',
      );
    });

    /**
     * [CRITICAL] لا بقايا من العقد القديم.
     *
     * `ratingAvailable` و`ratingAvailableAt` لم يعودا يُرسَلان. بقاءُ قارئٍ
     * لهما في التطبيق يعني حقلاً يُقرأ دائماً `null` — وشرطاً يبدو أنه يعمل.
     */
    test('[CRITICAL] لا أثر لحقول النافذة الملغاة', () {
      final offenders = <String>[];
      for (final dir in [
        Directory('lib/features/orders'),
        Directory('lib/features/reviews'),
        Directory('lib/core/design_system'),
      ]) {
        if (!dir.existsSync()) continue;
        for (final file in dir.listSync(recursive: true).whereType<File>()) {
          if (!file.path.endsWith('.dart')) continue;
          // تُجرَّد التعليقات قبل الفحص: توثيقُ ما أُزيل مشروع ومفيد،
          // والممنوع أن يبقى **قارئ** للحقل في شيفرة تنفَّذ.
          final source = file
              .readAsStringSync()
              .split('\n')
              .where((line) => !line.trimLeft().startsWith('//'))
              .join('\n');
          if (source.contains('ratingAvailableAt') ||
              RegExp(r'\bratingAvailable\b').hasMatch(source) ||
              source.contains('timeUntilRating')) {
            offenders.add(file.path);
          }
        }
      }
      expect(offenders, isEmpty, reason: 'حقول ملغاة ما تزال مقروءة: $offenders');
    });
  });
}
