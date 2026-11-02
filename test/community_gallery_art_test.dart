// المعرض في المجتمع — الرسم 45 (نصفٌ علويّ بلا خلفية) بدل 25.
//
// الأصل: 860×702 RGBA، أُزيلت خلفيته الرماديّة المسطّحة (#F7F7F7) بملءٍ من
// الحواف مع جيوب الخلفية المغلقة، ثم قُصّ عند منتصف الصورة الأصلية
// (860×1405 ← الصفوف 0..701). الهندسة: حافّة القصّ ملتصقة بأسفل الترويسة.

// المجتمع بلا صور (STEP 64 §24): الحالتان — المجتمع كلّه فارغ، وقسمٌ مختار بلا
// صور — بمكوّن الحالات الفارغة نفسه: لوحةٌ بإطارها ونصف قطرها، والشخصية ←
// العنوان ← الوصف ← الزرّ على محورها.
//
// [REGRESSION] حالة القسم الفارغ كانت عموداً عارياً (`_EmptyCategoryState`)
// بلا لوحة ولا إطار — نسخةٌ ثانية من تصميم الحالات الفارغة.

import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/community/presentation/screens/community_screen.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_page.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_sort.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_categories_usecase.dart';
import 'package:otaku_galaxy/features/reviews/domain/entities/review.dart';
import 'package:otaku_galaxy/features/reviews/domain/repositories/review_repository.dart';
import 'package:otaku_galaxy/features/reviews/presentation/cubit/reviews_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/visuals/presentation/character_artwork.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';

import 'support/auth_stub.dart';

const _category = Category(id: 'c1', name: 'قرطاسية');

class _Products implements ProductRepository {
  @override
  Future<List<Category>> fetchCategories() async => const [_category];
  @override
  Future<HomeData> fetchHome() async => const HomeData();
  @override
  Future<ProductPage> fetchProducts({
    int page = 1,
    int limit = 20,
    String? categoryId,
    String? subcategoryId,
  }) async => const ProductPage(items: [], hasMore: false);
  @override
  Future<ProductPage> searchProducts(
    String query, {
    int page = 1,
    int limit = 20,
    ProductSort? sort,
  }) async => const ProductPage(items: [], hasMore: false);
  @override
  Future<List<Product>> fetchCategoryProducts(
    String categoryId, {
    ProductSort? sort,
  }) async => const [];
  @override
  Future<Product> fetchProductDetails(String id) async =>
      throw UnimplementedError();
}

/// معرضٌ فارغ دائماً؛ يسجّل القسم المطلوب في كل جلب.
class _NoPhotos implements ReviewRepository {
  final List<String?> categoryIds = [];

  @override
  Future<List<Review>> fetchApprovedPhotoReviews({String? categoryId}) async {
    categoryIds.add(categoryId);
    return const [];
  }

  @override
  Future<List<Review>> fetchMyReviews() async => const [];
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('$invocation');
}


Future<void> _pump(
  WidgetTester tester,
  GlobalKey key, {
  required Size size,
  Brightness brightness = Brightness.light,
  AppLanguage language = AppLanguage.arabic,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final auth = stubAuthCubit(gender: 'male');
  await auth.loadSession();
  await tester.pumpWidget(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: FetchCategoriesUsecase(_Products())),
        RepositoryProvider<ReviewRepository>.value(value: _NoPhotos()),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<ReviewsCubit>(
            create: (context) => ReviewsCubit(context.read<ReviewRepository>()),
          ),
        ],
        child: MaterialApp(
          theme: brightness == Brightness.dark ? AppTheme.dark : AppTheme.light,
          locale: const Locale('ar'),
          supportedLocales: const [Locale('ar')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          builder: (context, child) => LocaleScope(
            language: language,
            child: child ?? const SizedBox.shrink(),
          ),
          home: RepaintBoundary(
            key: key,
            child: const Scaffold(body: CommunityScreen()),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}


Future<(int, int, List<int>)> _decode(WidgetTester tester, String path) async {
  late ui.Image image;
  late List<int> rgba;
  await tester.runAsync(() async {
    final codec = await ui.instantiateImageCodec(File(path).readAsBytesSync());
    image = (await codec.getNextFrame()).image;
    rgba = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!.buffer.asUint8List();
  });
  return (image.width, image.height, rgba);
}

void main() {
  const path = 'assets/art/characters/45.png';
  const retired = 25; // مُستبدَل بـ45؛ الرقم فجوةٌ موثّقة

  group('45: الأصل', () {
    test('PNG بقناة ألفا (RGBA) — توقيع PNG ونوع اللون 6', () {
      final b = File(path).readAsBytesSync();
      expect(b.sublist(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]);
      expect(b[25], 6, reason: 'IHDR color type 6 = RGBA');
    });

    testWidgets('860×702: نصف ارتفاع الأصل 1405 (الصفوف 0..701) وخلفيته شفافة حقاً', (tester) async {
      final (w, h, px) = await _decode(tester, path);
      expect((w, h), (860, 702));
      int a(int x, int y) => px[(y * w + x) * 4 + 3];
      for (final (x, y) in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (100, 300), (780, 300)]) {
        expect(a(x, y), 0, reason: 'خلفية ($x,$y) شفافة');
      }
      // لا بكسل خلفيةٍ رمادية (#F7F7F7) معتمٌ على حافّة الشخصية الخارجية.
      var minX = w, minY = h, maxX = 0, maxY = 0, opaque = 0, halo = 0;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          if (a(x, y) == 0) continue;
          opaque++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          final i = (y * w + x) * 4;
          final bgLike = (px[i] - 247).abs() <= 3 && (px[i + 1] - 247).abs() <= 3 && (px[i + 2] - 247).abs() <= 3;
          final nearEdge = x == 0 || y == 0 || x == w - 1 || a(x - 1, y) == 0 || a(x + 1, y) == 0 || (y > 0 && a(x, y - 1) == 0);
          if (bgLike && nearEdge) halo++;
        }
      }
      expect((minX, minY, maxX, maxY), (197, 41, 647, 701), reason: 'حدود الشخصية المرئية');
      expect(halo, 0, reason: 'لا هالة خلفيةٍ على الحافّة');
      expect(opaque, greaterThan(150000), reason: 'الشخصية محفوظة');
      // نصف الشخصية السفلي غير موجود: الصفّ الأخير هو صفّ القصّ (جذع/ذراع بلا تنّورة)،
      // وبكسلاتٌ بعينها من الجزء العلوي محفوظة (شعر داكن، شريط أحمر، قميص).
      for (var x = 0; x < w; x++) {
        if (a(x, h - 1) != 0) return _expectUpperHalfPixels(px, w);
      }
      fail('صف القصّ فارغ — القصّ ليس عند الحافّة');
    });
  });

  test('الموضع يشير إلى 45 ولا 25 في أي مكان', () {
    expect(CharacterArt.forSlot(VisualSlots.communityGallery), path);
    expect(File('assets/art/characters/$retired.png').existsSync(), isFalse, reason: '25.png حُذف');
    expect(File(path).existsSync(), isTrue);
    final stale = RegExp('characters/$retired\\.png');
    for (final root in ['lib', 'test']) {
      for (final f in Directory(root).listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
        if (f.path.endsWith('community_gallery_art_test.dart')) continue;
        expect(stale.hasMatch(f.readAsStringSync()), isFalse, reason: f.path);
      }
    }
    expect(File('pubspec.yaml').readAsStringSync().contains('25.png'), isFalse);
  });

  group('الهندسة على الشاشة الحقيقية', () {
    for (final size in const [Size(412, 892), Size(375, 812), Size(320, 568)]) {
      for (final b in Brightness.values) {
        testWidgets('${size.width.toInt()} ${b.name}: القصّ ملتصق بأسفل الترويسة والعنوان لم يتحرّك', (tester) async {
          final key = GlobalKey();
          await _pump(tester, key, size: size, brightness: b);
          // فكّ الصورة يجري خارج منطقة الاختبار المزيّفة.
          await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
          await tester.pumpAndSettle();
          final artFinder = find.byWidgetPredicate((w) => w is CharacterArtwork && w.slot == VisualSlots.communityGallery);
          final art = tester.getRect(artFinder);
          final header = tester.getRect(find.ancestor(of: artFinder, matching: find.byType(Container)).first);
          expect(art.width, 160);
          expect(art.height, closeTo(160 * 702 / 860, 0.01));
          expect(art.bottom, header.bottom, reason: 'حافّة القصّ على أسفل الترويسة');
          expect(art.left, -30, reason: 'الشخصية الكاملة داخل الشاشة: 197/860·160−30 = 6.7');
          expect(art.top, greaterThanOrEqualTo(0), reason: 'الشعر لا يُقصّ من أعلى');
          // العنوان في مكانه (لم تتحرّك الترويسة): أعلاه 26 دائماً.
          expect(tester.getRect(find.text('المجتمع').first).top, 26);
          expect(tester.takeException(), isNull);
        });
      }
    }
  });
}

void _expectUpperHalfPixels(List<int> px, int w) {
  List<int> at(int x, int y) => px.sublist((y * w + x) * 4, (y * w + x) * 4 + 4);
  // شعر داكن (255 معتم) وجذع القميص قرب صفّ القصّ.
  expect(at(400, 130)[3], 255);
  expect(at(400, 130)[0], lessThan(80));
  expect(at(420, 640)[3], 255, reason: 'القميص قرب صفّ القصّ');
}
