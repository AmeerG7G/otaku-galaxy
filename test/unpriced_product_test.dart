// «قريباً — السعر يُعلن لاحقاً» (084) في التطبيق — 2026-10-26.
//
// [CRITICAL REGRESSION GUARD] منتجٌ بلا سعرٍ معلن ظهر في المتجر على الويب ولم
// يظهر في التطبيق: الكتالوج يُخفيه عن كل عميلٍ لا يرسل `X-OG-Unpriced: 1`،
// لأن النسخ المثبَّتة الأقدم تقرأ السعر الغائب صفراً («٠ د.ع»). هذه النسخة
// تطلبه وتعرضه كما يعرضه الويب: «السعر لم يُعلن بعد»، بلا سعر ولا حالة مخزون
// ولا زرّ إضافة. والموعد المتوقَّع يظهر ما دام قادماً، بيوم توقيت المتجر.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/core/utils/formatters.dart';
import 'package:otaku_galaxy/features/product_detail/presentation/screens/product_detail_screen.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

import 'support/render_harness.dart';
import 'support/screen_fixtures.dart';

class _RecordingAdapter implements HttpClientAdapter {
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode({'success': true, 'data': <String, dynamic>{}}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> _json({Object? price = 25000, int stock = 3, String? restockAt}) => {
  'id': 'p1',
  'nameAr': 'مجسم',
  'descriptionAr': 'وصف',
  'images': <String>[],
  'price': price,
  'stock': stock,
  'restockAt': restockAt,
};

Future<void> _pump(WidgetTester tester, Widget child, {double width = 180}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: Center(child: SizedBox(width: width, child: child))),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('التحليل والحالة', () {
    test('[CRITICAL] price: null ← لم يُعلن، لا يُشترى، لا «أخبرني»', () {
      final p = Product.fromJson(_json(price: null));
      expect(p.priceAnnounced, isFalse);
      expect(p.availability, ProductAvailability.priceComingSoon);
      expect(p.availability.canAddToCart, isFalse);
      expect(p.availability.showsRestockAction, isFalse);
    });

    test('سعرٌ معلن ← كما كان (متوفر / قريباً / نفد)', () {
      expect(Product.fromJson(_json()).availability, ProductAvailability.available);
      expect(Product.fromJson(_json()).priceAnnounced, isTrue);
      expect(
        Product.fromJson(_json(stock: 0, restockAt: '2099-01-01T21:00:00Z')).availability,
        ProductAvailability.comingSoon,
      );
      expect(Product.fromJson(_json(stock: 0)).availability, ProductAvailability.unavailable);
    });

    test('ردٌّ أقدم بلا مفتاح price لا يُقرأ «لم يُعلن»', () {
      final json = _json()..remove('price');
      expect(Product.fromJson(json).priceAnnounced, isTrue);
    });

    test('موعد التوفر يُعرض لمنتجٍ بلا سعر ما دام قادماً — لا الذي مضى', () {
      final future = Product.fromJson(_json(price: null, restockAt: '2099-03-01T21:00:00Z'));
      expect(future.displayRestockAt, isNotNull);
      final past = Product.fromJson(_json(price: null, restockAt: '2026-10-12T21:00:00Z'));
      expect(past.displayRestockAt, isNull);
      // ومتوفرٌ بسعر لا يحمل موعداً (القاعدة القائمة).
      expect(Product.fromJson(_json(restockAt: '2099-03-01T21:00:00Z')).displayRestockAt, isNull);
    });
  });

  group('العرض', () {
    testWidgets('[CRITICAL] البطاقة: «السعر لم يُعلن بعد» لا «٠ د.ع»، ولا شريط نفاد', (tester) async {
      final p = Product.fromJson(_json(price: null, stock: 0));
      await _pump(tester, AnimeProductCard(product: p, onTap: () {}));
      expect(find.text(AppStrings.arabic('priceNotAnnounced')), findsWidgets);
      expect(find.textContaining('0 د.ع'), findsNothing);
      expect(find.text(AppStrings.arabic('outOfStock')), findsNothing);
      expect(find.text(AppStrings.arabic('comingSoon')), findsNothing);
    });

    testWidgets('الصفّ (٣٢٠ — أضيق هاتف): السعر نائبٌ بالنصّ بلا فيضان', (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final p = Product.fromJson(_json(price: null));
      await _pump(tester, AnimeProductRow(product: p), width: 320);
      expect(find.text(AppStrings.arabic('priceNotAnnounced')), findsOneWidget);
      expect(find.textContaining('د.ع'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('لا حالة مخزون (كالويب): الشارة فارغة ولو وُجدت قطع', (tester) async {
      await _pump(tester, ProductStockPill.forProduct(Product.fromJson(_json(price: null, stock: 5))));
      expect(find.text(AppStrings.arabic('available')), findsNothing);
      expect(find.byType(Text), findsNothing);
    });
  });

  group('صفحة المنتج', () {
    setUpAll(loadProjectFonts);
    for (final language in AppLanguage.values) {
      testWidgets('[CRITICAL] ${language.code}: زرٌّ معطَّل يقول السبب، لا سعر، والموعد القادم ظاهر', (tester) async {
        useGeoView(tester, kGeoViews.first);
        await pumpFixtureApp(
          tester,
          home: const ProductDetailScreen(productId: fixtureUnpricedId),
          language: language,
          textScale: 1.0,
        );
        await settleFixture(tester);
        final label = AppStrings.of(language)('priceNotAnnounced');
        expect(find.text(label), findsNWidgets(2), reason: 'مكان السعر + الزرّ');
        final button = tester.widget<AnimePrimaryButton>(
          find.ancestor(of: find.text(label).last, matching: find.byType(AnimePrimaryButton)),
        );
        expect(button.onPressed, isNull);
        expect(find.textContaining('د.ع'), findsNothing);
        expect(find.text(AppStrings.of(language)('outOfStock')), findsNothing);
        // الموعد القادم يُعرض رقمياً (STEP 77): 2099-03-01T21:00Z = منتصف ليل
        // ٢ آذار ببغداد ← «2099-03-02» في اللغتين، بلا اسم شهر.
        expect(find.textContaining('2099-03-02'), findsOneWidget);
        expect(
          find.textContaining(AppStrings.of(language)('monthMarch')),
          findsNothing,
        );
        expect(tester.takeException(), isNull);
      });
    }
  });

  group('الطلب يطلبها صراحةً', () {
    test('[CRITICAL] كل طلب يحمل X-OG-Unpriced: 1', () async {
      final adapter = _RecordingAdapter();
      final dio = Dio(BaseOptions(baseUrl: 'http://stub.invalid/api'))..httpClientAdapter = adapter;
      final client = ApiClient(config: AppConfig.development, dio: dio);
      await client.get('/catalog/products');
      expect(adapter.requests.single.headers['X-OG-Unpriced'], '1');
    });
  });

  group('يوم الموعد بتوقيت المتجر (بغداد، UTC+03:00)', () {
    test('[CRITICAL] منتصف ليل بغداد المخزَّن 21:00Z يُقرأ يومه الصحيح', () {
      expect(storeCalendarDate(DateTime.utc(2026, 10, 12, 21)), DateTime(2026, 10, 13));
      expect(storeCalendarDate(DateTime.utc(2026, 10, 12, 20, 59)), DateTime(2026, 10, 12));
      // حدود الشهر والسنة.
      expect(storeCalendarDate(DateTime.utc(2026, 12, 31, 21)), DateTime(2027, 1, 1));
      expect(storeCalendarDate(DateTime.utc(2028, 2, 28, 21)), DateTime(2028, 2, 29));
    });
  });
}
