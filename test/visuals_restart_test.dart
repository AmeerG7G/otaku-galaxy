// الرسوم المُدارة بعد إعادة التشغيل: لا شخصيةٌ غير التي اختارها المسؤول.
//
// [CRITICAL REGRESSION GUARD] كان `VisualsRepository` يحفظ الإعداد في
// الذاكرة وحدها، فيبدأ كل إقلاعٍ بلا إعداد: ترسم الشاشات شخصيتها المضمَّنة
// كأنها الحقيقة، ثم يصل `GET /visuals` فتُبدَّل كلّها مرة (إعادة بناء) ومرة
// ثانية (بديل التحميل حتى تُقرأ الصورة من القرص). الآن آخر إعدادٍ ناجح يُحفظ
// في `SharedPreferences` ويُستعاد متزامناً، وصورُه تُدفَّأ من القرص قبل أول
// شاشة، والإصدار نفسه لا يعيد بناء شيئاً.
//
// ما يُثبَت هنا: طبقة الحلّ والحالة وبنية الودجات (أي رابط تحمله أي فتحة،
// وفي أي إطار)، **وأول إطارٍ مرسوم**: صورةٌ حقيقية تُقرأ من «القرص» (ملفٌ
// مؤقّت عبر مدير ذاكرةٍ لا يلمس الشبكة) فتُدفَّأ، ثم يُبنى الرسم فيحمل الصورة
// في إطاره الأول بلا بديلٍ مضمَّن — وهو تعريف «لا وميض» على مستوى الودجات.

import 'dart:convert';
import 'dart:io' as io;
import 'dart:typed_data';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:file/local.dart';
import 'package:flutter/material.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/core/network/media_url.dart';
import 'package:otaku_galaxy/features/visuals/data/visuals_repository.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/managed_artwork.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _cartRef = '/uploads/visual/2026/09/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.png';
const _homeRef = '/uploads/visual/2026/09/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.png';
const _cartFallback = 'assets/art/opt/a-i2.png';
const _homeFallback = 'assets/art/opt/a-i5.png';

String _snapshot({String version = 'v1', Map<String, String>? slots}) => jsonEncode({
  'version': version,
  'slots': [
    for (final entry in (slots ?? {VisualSlots.emptyCart: _cartRef}).entries)
      {'slotKey': entry.key, 'currentUrl': entry.value},
  ],
});

/// ردّ `GET /visuals` مسجَّل.
class _VisualsAdapter implements HttpClientAdapter {
  _VisualsAdapter(this.version, this.slots);
  String version;
  Map<String, String> slots;
  int calls = 0;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? _, Future<void>? _) async {
    calls++;
    return ResponseBody.fromString(
      jsonEncode({
        'success': true,
        'data': {
          'version': version,
          'timezone': 'Asia/Baghdad',
          'slots': [
            for (final e in slots.entries) {'slotKey': e.key, 'currentUrl': e.value},
          ],
        },
      }),
      200,
      headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
    );
  }

  @override
  void close({bool force = false}) {}
}

Future<(VisualsRepository, SharedPreferences, _VisualsAdapter)> _repository({
  String? persisted,
  String serverVersion = 'v1',
  Map<String, String>? serverSlots,
}) async {
  SharedPreferences.setMockInitialValues(
    persisted == null ? {} : {VisualsRepository.snapshotKey: persisted},
  );
  final prefs = await SharedPreferences.getInstance();
  final adapter = _VisualsAdapter(serverVersion, serverSlots ?? {VisualSlots.emptyCart: _cartRef});
  final dio = Dio(BaseOptions(baseUrl: 'http://stub.invalid/api'))..httpClientAdapter = adapter;
  final api = ApiClient(config: AppConfig.development, dio: dio, tokenProvider: () => null);
  return (VisualsRepository(api: api, prefs: prefs), prefs, adapter);
}

/// مديرُ ذاكرةٍ يعرف ملفاً لرابطٍ واحد ولا يلمس الشبكة.
class _OneFileCache implements BaseCacheManager {
  _OneFileCache(this.knownUrl);
  final String knownUrl;
  final List<String> asked = [];

  @override
  Future<FileInfo?> getFileFromCache(String key, {bool ignoreMemCache = false}) async {
    asked.add(key);
    return null; // «معروف» في السجل لكن الملف نفسه غائب — يجب ألّا يرمي.
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('لا شبكة في التدفئة: ${invocation.memberName}');
}

/// صورة PNG حقيقية ١×١ — ما يكفي لمرور الفكّ الفعلي لا محاكاته.
final Uint8List _png1x1 = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

/// مديرُ ذاكرةٍ يخدم ملفاتٍ من القرص فقط — أي نداءٍ آخر (شبكة) يرمي.
class _DiskOnlyCache implements BaseCacheManager {
  _DiskOnlyCache(this.files);
  final Map<String, io.File> files;
  final List<String> streamed = [];

  FileInfo? _info(String url) {
    final file = files[url];
    if (file == null) return null;
    return FileInfo(
      const LocalFileSystem().file(file.path),
      FileSource.Cache,
      DateTime.now().add(const Duration(days: 1)),
      url,
    );
  }

  @override
  Future<FileInfo?> getFileFromCache(String key, {bool ignoreMemCache = false}) async => _info(key);

  @override
  Stream<FileResponse> getFileStream(
    String url, {
    String? key,
    Map<String, String>? headers,
    bool withProgress = false,
  }) {
    streamed.add(url);
    final info = _info(url);
    return info == null
        ? Stream<FileResponse>.error(StateError('لا شبكة في التدفئة: $url'))
        : Stream<FileResponse>.value(info);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('لا شبكة في التدفئة: ${invocation.memberName}');
}

/// خادمٌ مقطوع — كل نداء يفشل فوراً كما يفشل الهاتف بلا شبكة.
class _DeadAdapter implements HttpClientAdapter {
  int calls = 0;
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? _, Future<void>? _) async {
    calls++;
    throw const io.SocketException('network unreachable');
  }

  @override
  void close({bool force = false}) {}
}

void _register(VisualsRepository repository) {
  if (sl.isRegistered<VisualsRepository>()) sl.unregister<VisualsRepository>();
  sl.registerSingleton<VisualsRepository>(repository);
}

Widget _app(Widget child) => MaterialApp(
  home: Directionality(textDirection: TextDirection.rtl, child: child),
);

CachedNetworkImage? _remoteOf(WidgetTester tester, String slot) {
  final finder = find.byKey(ValueKey<String>('managed-artwork:$slot'));
  return finder.evaluate().isEmpty ? null : tester.widget<CachedNetworkImage>(finder);
}

void main() {
  tearDown(() {
    if (sl.isRegistered<VisualsRepository>()) sl.unregister<VisualsRepository>();
  });

  group('الاستعادة المتزامنة عند الإنشاء', () {
    test('[CRITICAL] الإعداد المحفوظ يُقرأ قبل أي شبكة — الرابط معروف من اللحظة الأولى', () async {
      final (repo, _, adapter) = await _repository(persisted: _snapshot());
      expect(adapter.calls, 0, reason: 'لا نداء شبكة في المُنشئ');
      expect(repo.urlFor(VisualSlots.emptyCart), resolveMediaUrl(_cartRef));
      expect(repo.urlFor(VisualSlots.homeHero), isNull, reason: 'غير المحفوظ يبقى مضمَّناً');
    });

    test('محفوظٌ تالف يُهمَل بلا استثناء', () async {
      for (final broken in ['{not json', '[]', '{"slots": 5}', '']) {
        final (repo, _, _) = await _repository(persisted: broken);
        expect(repo.urlFor(VisualSlots.emptyCart), isNull, reason: broken);
      }
    });

    test('[CRITICAL] الإصدار نفسه من الخادم لا يُقدّم المراجعة — لا إعادة بناء بعد الإقلاع', () async {
      final (repo, _, _) = await _repository(persisted: _snapshot(version: 'v1'), serverVersion: 'v1');
      final before = repo.revision.value;
      await repo.refresh();
      expect(repo.revision.value, before);
      expect(repo.urlFor(VisualSlots.emptyCart), resolveMediaUrl(_cartRef));
    });

    test('إصدارٌ جديد يُقدّم المراجعة مرةً ويُكتب محلّ المحفوظ', () async {
      final (repo, prefs, _) = await _repository(
        persisted: _snapshot(version: 'v1'),
        serverVersion: 'v2',
        serverSlots: {VisualSlots.emptyCart: _homeRef},
      );
      final before = repo.revision.value;
      await repo.refresh();
      expect(repo.revision.value, before + 1);
      expect(repo.urlFor(VisualSlots.emptyCart), resolveMediaUrl(_homeRef));
      await Future<void>.delayed(Duration.zero);
      final saved = jsonDecode(prefs.getString(VisualsRepository.snapshotKey)!) as Map<String, dynamic>;
      expect(saved['version'], 'v2');
      expect((saved['slots'] as List).single['currentUrl'], _homeRef);
    });

    test('أول جلبٍ بلا محفوظ يحفظ للتشغيل التالي', () async {
      final (repo, prefs, _) = await _repository(serverVersion: 'v7');
      expect(prefs.getString(VisualsRepository.snapshotKey), isNull);
      await repo.refresh();
      await Future<void>.delayed(Duration.zero);
      expect(prefs.getString(VisualsRepository.snapshotKey), contains('"v7"'));
    });
  });

  group('التدفئة من القرص وحدها', () {
    test('لا محفوظ ⇒ تنتهي فوراً بلا لمس المدير', () async {
      final (repo, _, _) = await _repository();
      final cache = _OneFileCache('none');
      await repo.warmRestored(cacheManager: cache);
      expect(cache.asked, isEmpty);
    });

    test('[CRITICAL] تسأل القرص عن كل رابطٍ محفوظ ولا تُنزّل ما ليس عليه، وتنتهي داخل الميزانية', () async {
      final (repo, _, adapter) = await _repository(
        persisted: _snapshot(slots: {VisualSlots.emptyCart: _cartRef, VisualSlots.homeHero: _homeRef}),
      );
      final cache = _OneFileCache(resolveMediaUrl(_cartRef)!);
      final started = DateTime.now();
      await repo.warmRestored(cacheManager: cache, budget: const Duration(milliseconds: 500));
      expect(DateTime.now().difference(started), lessThan(const Duration(milliseconds: 500)));
      expect(cache.asked.toSet(), {resolveMediaUrl(_cartRef), resolveMediaUrl(_homeRef)});
      expect(adapter.calls, 0, reason: 'التدفئة لا تلمس الشبكة');
    });
  });

  group('الإقلاع البارد — أول إطارٍ مرسوم', () {
    tearDown(() {
      imageCache.clear();
      imageCache.clearLiveImages();
    });

    testWidgets('[CRITICAL] صورةٌ على القرص تُدفَّأ بلا شبكة وتُرسم في أول إطار — لا بديل مضمَّن ولا إطار فارغ', (
      tester,
    ) async {
      // إدخال/إخراج متزامن: غير المتزامن من dart:io لا يعود داخل الزمن المزيَّف.
      final dir = io.Directory.systemTemp.createTempSync('og-visuals-');
      addTearDown(() => dir.deleteSync(recursive: true));
      final url = resolveMediaUrl(_cartRef)!;
      final cache = _DiskOnlyCache({url: io.File('${dir.path}/cart.png')..writeAsBytesSync(_png1x1)});

      final (repo, _, adapter) = await _repository(persisted: _snapshot());
      // التدفئة تفكّ الملف فعلاً (إدخال/إخراج وفكٌّ حقيقيان ⇒ runAsync).
      await tester.runAsync(() => repo.warmRestored(cacheManager: cache));
      expect(cache.streamed, [url], reason: 'قُرئ من القرص مرةً واحدة');
      expect(adapter.calls, 0, reason: 'بلا شبكة');
      // مفتاح ذاكرة الصور هو مفتاح المزوّد الذي تستعمله الودجة نفسها — بلا
      // مدير الذاكرة، فالمساواة بالرابط والمقياس وحدهما.
      expect(imageCache.containsKey(CachedNetworkImageProvider(url)), isTrue);

      _register(repo);
      await tester.pumpWidget(
        _app(const ManagedArtwork(slot: VisualSlots.emptyCart, fallbackAsset: _cartFallback, width: 80)),
      );
      // الإطار الأول — لا `pump` إضافي.
      final remote = find.byKey(const ValueKey<String>('managed-artwork:${VisualSlots.emptyCart}'));
      expect(remote, findsOneWidget);
      final raw = tester.widget<RawImage>(find.descendant(of: remote, matching: find.byType(RawImage)));
      expect(raw.image, isNotNull, reason: 'الصورة الحقيقية في الإطار الأول');
      expect(
        find.descendant(of: remote, matching: find.byWidgetPredicate((w) => w is Image && w.image is AssetImage)),
        findsNothing,
        reason: 'لا بديل مضمَّن ولو لإطار',
      );
    });

    testWidgets('ما ليس على القرص يُترك لمساره: بديلُ الفتحة **هي** حتى تصل الصورة — لا صورة فتحةٍ أخرى', (
      tester,
    ) async {
      // إدخال/إخراج متزامن: غير المتزامن من dart:io لا يعود داخل الزمن المزيَّف.
      final dir = io.Directory.systemTemp.createTempSync('og-visuals-');
      addTearDown(() => dir.deleteSync(recursive: true));
      final cartUrl = resolveMediaUrl(_cartRef)!;
      final cache = _DiskOnlyCache({cartUrl: io.File('${dir.path}/cart.png')..writeAsBytesSync(_png1x1)});
      final (repo, _, _) = await _repository(
        persisted: _snapshot(slots: {VisualSlots.emptyCart: _cartRef, VisualSlots.homeHero: _homeRef}),
      );
      await tester.runAsync(() => repo.warmRestored(cacheManager: cache));
      expect(imageCache.containsKey(CachedNetworkImageProvider(cartUrl)), isTrue);
      expect(imageCache.containsKey(CachedNetworkImageProvider(resolveMediaUrl(_homeRef)!)), isFalse);

      _register(repo);
      await tester.pumpWidget(
        _app(
          const Column(
            children: [
              ManagedArtwork(slot: VisualSlots.emptyCart, fallbackAsset: _cartFallback, width: 80),
              ManagedArtwork(slot: VisualSlots.homeHero, fallbackAsset: _homeFallback, width: 80),
            ],
          ),
        ),
      );
      await tester.pump();
      final hero = find.byKey(const ValueKey<String>('managed-artwork:${VisualSlots.homeHero}'));
      final placeholders = find
          .descendant(of: hero, matching: find.byWidgetPredicate((w) => w is Image && w.image is AssetImage))
          .evaluate()
          .map((e) => ((e.widget as Image).image as AssetImage).assetName)
          .toList();
      expect(placeholders, [_homeFallback], reason: 'بديل الفتحة هي لا السلة');
      final cart = find.byKey(const ValueKey<String>('managed-artwork:${VisualSlots.emptyCart}'));
      expect(tester.widget<RawImage>(find.descendant(of: cart, matching: find.byType(RawImage))).image, isNotNull);
    });

    test('[CRITICAL] خادمٌ مقطوع عند الإقلاع: المحفوظ يبقى الحقيقة، لا إعادة بناء ولا استثناء', () async {
      SharedPreferences.setMockInitialValues({VisualsRepository.snapshotKey: _snapshot()});
      final prefs = await SharedPreferences.getInstance();
      final adapter = _DeadAdapter();
      final dio = Dio(BaseOptions(baseUrl: 'http://stub.invalid/api'))..httpClientAdapter = adapter;
      final repo = VisualsRepository(
        api: ApiClient(config: AppConfig.development, dio: dio, tokenProvider: () => null),
        prefs: prefs,
      );
      final before = repo.revision.value;
      await repo.refresh();
      expect(adapter.calls, greaterThanOrEqualTo(1));
      expect(repo.revision.value, before, reason: 'الفشل لا يُبدّل شيئاً');
      expect(repo.urlFor(VisualSlots.emptyCart), resolveMediaUrl(_cartRef));
      expect(repo.urlFor(VisualSlots.homeHero), isNull);
      // والمحفوظ لم يُمسّ.
      expect(prefs.getString(VisualsRepository.snapshotKey), _snapshot());
      repo.dispose();
    });
  });

  group('عزل الفتحات في الودجات', () {
    testWidgets('[CRITICAL] أول إطارٍ بعد الإقلاع يحمل رابط الخادم لا المضمَّن — والفتحة غير المضبوطة مضمَّنُها هي', (
      tester,
    ) async {
      final (repo, _, _) = await _repository(persisted: _snapshot());
      _register(repo);
      await tester.pumpWidget(
        _app(
          const Column(
            children: [
              ManagedArtwork(slot: VisualSlots.emptyCart, fallbackAsset: _cartFallback, width: 80),
              ManagedArtwork(slot: VisualSlots.homeHero, fallbackAsset: _homeFallback, width: 80),
            ],
          ),
        ),
      );
      // الإطار الأول — لا `pumpAndSettle`، ولا شبكة استُدعيت بعد.
      final cart = _remoteOf(tester, VisualSlots.emptyCart);
      expect(cart, isNotNull);
      expect(cart!.imageUrl, resolveMediaUrl(_cartRef));
      expect(_remoteOf(tester, VisualSlots.homeHero), isNull);
      // المضمَّن المستقل (مسار «لا إعداد») لفتحةٍ واحدة فقط: غير المضبوطة.
      // مضمَّن الفتحة المضبوطة لا يظهر إلّا كبديل تحميلٍ **داخل** ودجة
      // الصورة البعيدة — وهو ما يعرضه الاختبار لأن لا بايتات تُحمَّل فيه؛
      // على الجهاز تُرسم الصورة المدفَّأة في البناء نفسه فلا يظهر البديل.
      final standalone = find.byWidgetPredicate(
        (w) => w is Image && w.image is AssetImage,
      );
      final standaloneAssets = <String>[];
      for (final element in standalone.evaluate()) {
        final insideRemote = element.findAncestorWidgetOfExactType<CachedNetworkImage>() != null;
        if (!insideRemote) standaloneAssets.add(((element.widget as Image).image as AssetImage).assetName);
      }
      expect(standaloneAssets, [_homeFallback]);
      final placeholderInsideRemote = find.descendant(
        of: find.byKey(const ValueKey<String>('managed-artwork:${VisualSlots.emptyCart}')),
        matching: find.byWidgetPredicate(
          (w) => w is Image && w.image is AssetImage && (w.image as AssetImage).assetName == _cartFallback,
        ),
      );
      // بديل التحميل يُبنى حين تُبلغ الصورة البعيدة أنها بلا إطار بعد.
      await tester.pump();
      expect(placeholderInsideRemote, findsOneWidget);
    });

    testWidgets('[CRITICAL] فتحاتٌ كثيرة معاً: كلٌّ برابطها ولا تبادل', (tester) async {
      final slots = {
        for (final (i, key) in VisualSlots.all.take(12).indexed)
          key: '/uploads/visual/2026/09/${i.toString().padLeft(8, '0')}-0000-4000-8000-000000000000.png',
      };
      final (repo, _, _) = await _repository(persisted: _snapshot(slots: slots));
      _register(repo);
      await tester.pumpWidget(
        _app(
          SingleChildScrollView(
            child: Column(
              children: [
                for (final key in slots.keys)
                  ManagedArtwork(slot: key, fallbackAsset: _cartFallback, width: 40),
              ],
            ),
          ),
        ),
      );
      for (final entry in slots.entries) {
        expect(_remoteOf(tester, entry.key)!.imageUrl, resolveMediaUrl(entry.value), reason: entry.key);
      }
    });

    testWidgets('[CRITICAL] تبديل فتحة الموضع نفسه لا يورّث عنصرَ صورة الفتحة السابقة', (tester) async {
      final (repo, _, _) = await _repository(
        persisted: _snapshot(slots: {VisualSlots.registerPending: _cartRef, VisualSlots.forgotPasswordPending: _homeRef}),
      );
      _register(repo);
      Widget host(String slot) => _app(ManagedArtwork(slot: slot, fallbackAsset: _cartFallback, width: 80));

      await tester.pumpWidget(host(VisualSlots.registerPending));
      final first = tester.element(
        find.byKey(const ValueKey<String>('managed-artwork:${VisualSlots.registerPending}')),
      );

      await tester.pumpWidget(host(VisualSlots.forgotPasswordPending));
      expect(_remoteOf(tester, VisualSlots.registerPending), isNull);
      final second = tester.element(
        find.byKey(const ValueKey<String>('managed-artwork:${VisualSlots.forgotPasswordPending}')),
      );
      expect(identical(first, second), isFalse, reason: 'عنصرٌ جديد — لا إطارٌ موروث');
      expect(_remoteOf(tester, VisualSlots.forgotPasswordPending)!.imageUrl, resolveMediaUrl(_homeRef));
    });

    testWidgets('تغيّر الصورة من اللوحة يحلّ إلى الرابط الجديد ويُبقي القديمة حتى تصل — لا مضمَّن بينهما', (
      tester,
    ) async {
      final (repo, _, _) = await _repository(persisted: _snapshot());
      _register(repo);
      await tester.pumpWidget(_app(const ManagedArtwork(slot: VisualSlots.emptyCart, fallbackAsset: _cartFallback)));
      expect(_remoteOf(tester, VisualSlots.emptyCart)!.imageUrl, resolveMediaUrl(_cartRef));

      repo.seed({VisualSlots.emptyCart: const VisualSlot(slotKey: VisualSlots.emptyCart, currentUrl: _homeRef)});
      await tester.pump();
      final remote = _remoteOf(tester, VisualSlots.emptyCart)!;
      expect(remote.imageUrl, resolveMediaUrl(_homeRef));
      expect(remote.useOldImageOnUrlChange, isTrue);
    });

    testWidgets('حذف الصورة من اللوحة يُعيد الفتحة إلى مضمَّنها هي', (tester) async {
      final (repo, _, _) = await _repository(persisted: _snapshot());
      _register(repo);
      await tester.pumpWidget(_app(const ManagedArtwork(slot: VisualSlots.emptyCart, fallbackAsset: _cartFallback)));
      repo.seed(const {});
      await tester.pump();
      expect(_remoteOf(tester, VisualSlots.emptyCart), isNull);
      final asset = tester.widget<Image>(find.byType(Image)).image as AssetImage;
      expect(asset.assetName, _cartFallback);
    });
  });
}
