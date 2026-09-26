// سلوك الرسوم المُدارة: متى يُعرض البعيد، ومتى يعود التطبيق إلى المضمَّن.
//
// الضمانة التي تحرسها هذه السويت هي الأهم في الميزة كلها: **لا شاشة تفرغ
// أبداً**. مهما غاب الإعداد أو فشلت الشبكة أو حذف المسؤول صورة، ينتهي كل
// مسار إلى الأصل المضمَّن مع العنصر.

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/network/media_url.dart';
import 'package:otaku_galaxy/features/visuals/data/visuals_repository.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/managed_artwork.dart';

const _fallback = 'assets/art/opt/a-i0.png';

VisualSlot _slot(String key, String url) => VisualSlot(slotKey: key, currentUrl: url);

Future<void> _pump(WidgetTester tester) async {
  await tester.pumpWidget(
    const MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: ManagedArtwork(
          slot: VisualSlots.emptyCart,
          fallbackAsset: _fallback,
          width: 120,
        ),
      ),
    ),
  );
}

void main() {
  late VisualsRepository repository;

  setUp(() {
    repository = VisualsRepository();
    if (sl.isRegistered<VisualsRepository>()) {
      sl.unregister<VisualsRepository>();
    }
    sl.registerSingleton<VisualsRepository>(repository);
  });

  tearDown(() {
    if (sl.isRegistered<VisualsRepository>()) {
      sl.unregister<VisualsRepository>();
    }
  });

  group('ManagedArtwork — الرجوع إلى المضمَّن', () {
    testWidgets('بلا إعداد إطلاقاً → الأصل المضمَّن', (tester) async {
      await _pump(tester);
      expect(find.byType(Image), findsOneWidget);
      expect(find.byType(CachedNetworkImage), findsNothing);

      final image = tester.widget<Image>(find.byType(Image));
      expect((image.image as AssetImage).assetName, _fallback);
    });

    testWidgets('فتحة أخرى مضبوطة لا تُغيّر هذه الفتحة', (tester) async {
      repository.seed({
        VisualSlots.emptyFavorites: _slot(
          VisualSlots.emptyFavorites,
          '/uploads/slot/other.png',
        ),
      });
      await _pump(tester);
      expect(find.byType(CachedNetworkImage), findsNothing);
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('رابط فارغ يُعامل كغياب إعداد', (tester) async {
      repository.seed({VisualSlots.emptyCart: _slot(VisualSlots.emptyCart, '')});
      await _pump(tester);
      expect(find.byType(CachedNetworkImage), findsNothing);
    });

    testWidgets('حذف الصورة من اللوحة يُعيد الشاشة إلى المضمَّن', (tester) async {
      repository.seed({
        VisualSlots.emptyCart: _slot(VisualSlots.emptyCart, '/uploads/slot/a.png'),
      });
      await _pump(tester);
      expect(find.byType(CachedNetworkImage), findsOneWidget);

      // المسؤول حذف الصورة ← الفتحة لم تعد تصل ← لا شاشة تفرغ.
      repository.clear();
      await tester.pump();
      expect(find.byType(CachedNetworkImage), findsNothing);
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('الأصل المضمَّن يُعرض أثناء تحميل البعيد — لا وميض', (tester) async {
      repository.seed({
        VisualSlots.emptyCart: _slot(VisualSlots.emptyCart, '/uploads/slot/a.png'),
      });
      await _pump(tester);

      // `placeholder` هو الأصل نفسه، فلا لحظة تكون الشاشة فيها بلا رسم.
      final widget = tester.widget<CachedNetworkImage>(find.byType(CachedNetworkImage));
      expect(widget.placeholder, isNotNull);
      expect(widget.errorWidget, isNotNull);
      // بلا تلاشٍ: التبديل بين المضمَّن والبعيد يجب ألا يُرى.
      expect(widget.fadeInDuration, Duration.zero);
    });
  });

  group('ManagedArtwork — الصورة البعيدة', () {
    testWidgets('الفتحة المضبوطة تعرض الرابط المطلق', (tester) async {
      repository.seed({
        VisualSlots.emptyCart: _slot(VisualSlots.emptyCart, '/uploads/slot/cart.png'),
      });
      await _pump(tester);

      final widget = tester.widget<CachedNetworkImage>(find.byType(CachedNetworkImage));
      expect(widget.imageUrl, resolveMediaUrl('/uploads/slot/cart.png'));
      expect(widget.imageUrl, startsWith('http'));
    });

    testWidgets('المقاس المطلوب يُحترم كما في الأصل', (tester) async {
      repository.seed({
        VisualSlots.emptyCart: _slot(VisualSlots.emptyCart, '/uploads/slot/cart.png'),
      });
      await _pump(tester);
      final widget = tester.widget<CachedNetworkImage>(find.byType(CachedNetworkImage));
      expect(widget.width, 120);
    });

    testWidgets('[CRITICAL] لا شفافية على الرسم المُدار — بعيداً كان أو مضمَّناً', (tester) async {
      // [PRODUCT] قرار 2026-09-15: الشخصية تُعرض كصورتها الأصلية. كان المكوّن
      // يقبل `opacity` فتبدو الشخصية التي يرفعها المسؤول باهتة.
      for (final seeded in [true, false]) {
        if (seeded) {
          repository.seed({
            VisualSlots.emptyCart: _slot(VisualSlots.emptyCart, '/uploads/slot/a.png'),
          });
        } else {
          repository.clear();
        }
        await tester.pumpWidget(
          const MaterialApp(
            home: ManagedArtwork(slot: VisualSlots.emptyCart, fallbackAsset: _fallback),
          ),
        );
        expect(find.byType(Opacity), findsNothing, reason: 'seeded=$seeded');
        expect(find.byType(ColorFiltered), findsNothing);
        expect(find.byType(ShaderMask), findsNothing);
      }
    });
  });

  group('VisualsRepository — التحليل والفشل', () {
    test('فتحة بلا مفتاح أو بلا رابط تُهمَل', () {
      final repo = VisualsRepository();
      repo.seed({
        'ok': _slot('ok', '/uploads/a.png'),
      });
      expect(repo.slot('ok'), isNotNull);
      expect(repo.slot('missing'), isNull);
      expect(repo.urlFor('missing'), isNull);
    });

    test('urlFor يحوّل المرجع النسبي إلى مطلق', () {
      final repo = VisualsRepository();
      repo.seed({'ok': _slot('ok', '/uploads/a.png')});
      expect(repo.urlFor('ok'), resolveMediaUrl('/uploads/a.png'));
    });

    test('الرابط الخارجي الكامل يمرّ كما هو', () {
      final repo = VisualsRepository();
      repo.seed({'ok': _slot('ok', 'https://cdn.example.com/a.png')});
      expect(repo.urlFor('ok'), 'https://cdn.example.com/a.png');
    });

    test('المراجعة تتقدّم عند كل تحديث — فتُعاد البناء مرة واحدة', () {
      final repo = VisualsRepository();
      final before = repo.revision.value;
      repo.seed({'ok': _slot('ok', '/uploads/a.png')});
      expect(repo.revision.value, before + 1);
      repo.clear();
      expect(repo.revision.value, before + 2);
    });
  });

  group('VisualsRepository — التحميل المسبق لا يتعلّق', () {
    test('التحميل المسبق ينتهي دائماً ولو لم تُحمَّل أي صورة', () async {
      // على الويب لا ذاكرة قرص، وقد لا يستدعي `ImageStream` مستمعه إطلاقاً.
      // بلا مهلة لكل صورة تتوقف الحلقة عند أولها فلا يُنزَّل شيء — تعطّل
      // صامت بلا خطأ ولا سجل.
      final repo = VisualsRepository();
      repo.seed({
        'a': _slot('a', 'http://127.0.0.1:9/never-answers-a.png'),
        'b': _slot('b', 'http://127.0.0.1:9/never-answers-b.png'),
      });
      await repo.prefetch().timeout(const Duration(seconds: 40));
    });

    test('التحميل المسبق لا يرمي على قائمة فارغة', () async {
      final repo = VisualsRepository();
      await repo.prefetch();
    });
  });

  group('VisualSlot — عقد الخادم', () {
    test('يقرأ المفتاح والصورة الثابتة', () {
      final slot = VisualSlot.fromJson(const {
        'slotKey': 'empty_cart_character',
        'currentUrl': '/uploads/a.png',
      });
      expect(slot.slotKey, 'empty_cart_character');
      expect(slot.currentUrl, '/uploads/a.png');
    });

    test('حقول التدوير القديمة — إن أرسلها خادمٌ أقدم — تُهمَل بلا أثر', () {
      // [PRODUCT] لا تدوير ولا قائمة صور (الهجرة ٠٥٤): الصورة واحدة، والتطبيق
      // لا يختار من قائمة ولا ينتظر «انتهاء صلاحية».
      final slot = VisualSlot.fromJson(const {
        'slotKey': 'empty_cart_character',
        'currentUrl': '/uploads/b.png',
        'urls': ['/uploads/a.png', '/uploads/b.png'],
        'rotationMode': 'daily',
        'validUntil': '2026-09-01T21:00:00.000Z',
      });
      expect(slot.currentUrl, '/uploads/b.png');
    });

    test('حمولة ناقصة لا تُسقط التحليل', () {
      final slot = VisualSlot.fromJson(const {});
      expect(slot.slotKey, '');
      expect(slot.currentUrl, '');
    });
  });

  group('عقد الفتحات', () {
    test('كل المفاتيح فريدة وبصيغة يقبلها الخادم', () {
      expect(VisualSlots.all.toSet(), hasLength(VisualSlots.all.length));
      final pattern = RegExp(r'^[a-z][a-z0-9_]{2,48}$');
      for (final key in VisualSlots.all) {
        expect(pattern.hasMatch(key), isTrue, reason: 'مفتاح غير صالح: $key');
      }
    });
  });
}
