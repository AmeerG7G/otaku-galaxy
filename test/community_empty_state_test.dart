// المجتمع بلا صور (STEP 64 §24): الحالتان — المجتمع كلّه فارغ، وقسمٌ مختار بلا
// صور — بمكوّن الحالات الفارغة نفسه: لوحةٌ بإطارها ونصف قطرها، والشخصية ←
// العنوان ← الوصف ← الزرّ على محورها.
//
// [REGRESSION] حالة القسم الفارغ كانت عموداً عارياً (`_EmptyCategoryState`)
// بلا لوحة ولا إطار — نسخةٌ ثانية من تصميم الحالات الفارغة.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
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

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

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

Future<_NoPhotos> _pump(
  WidgetTester tester, {
  Size size = const Size(412, 892),
  AppLanguage language = AppLanguage.arabic,
  double textScale = 1.0,
  bool loggedIn = true,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final reviews = _NoPhotos();
  final auth = stubAuthCubit(gender: 'male');
  if (loggedIn) await auth.loadSession();
  await tester.pumpWidget(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: FetchCategoriesUsecase(_Products())),
        RepositoryProvider<ReviewRepository>.value(value: reviews),
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
          theme: AppTheme.light,
          locale: const Locale('ar'),
          supportedLocales: const [Locale('ar')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          builder: (context, child) => LocaleScope(
            language: language,
            child: MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(textScale)),
              child: child ?? const SizedBox.shrink(),
            ),
          ),
          home: const Scaffold(body: CommunityScreen()),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return reviews;
}

final _state = find.byType(AnimeEmptyState);

/// اللوحة: أوّل `Container` في مُمرِّر الحالة الفارغة — بإطارها ونصف قطرها.
Rect _expectFramedPanel(WidgetTester tester) {
  final panelFinder = find
      .descendant(
        of: find.descendant(
          of: _state,
          matching: find.byType(SingleChildScrollView),
        ),
        matching: find.byType(Container),
      )
      .first;
  final decoration =
      tester.widget<Container>(panelFinder).decoration! as BoxDecoration;
  expect(decoration.border, isNotNull, reason: 'the frame');
  expect(decoration.borderRadius, BorderRadius.circular(AppDimens.radiusXl));
  return tester.getRect(panelFinder);
}

void _expectCenteredStack(
  WidgetTester tester, {
  required Rect panel,
  required String title,
  required String body,
  String? action,
}) {
  final art = tester.getRect(
    find.descendant(of: _state, matching: find.byType(CharacterArtwork)),
  );
  final titleRect = tester.getRect(find.text(title));
  final bodyRect = tester.getRect(find.text(body));
  expect(art.bottom, lessThanOrEqualTo(titleRect.top + 1));
  expect(titleRect.bottom, lessThanOrEqualTo(bodyRect.top + 1));
  final rects = [('character', art), ('title', titleRect), ('body', bodyRect)];
  if (action != null) {
    final button = tester.getRect(
      find.descendant(of: _state, matching: find.text(action)),
    );
    expect(bodyRect.bottom, lessThanOrEqualTo(button.top + 1));
    rects.add(('button', button));
  }
  for (final (name, rect) in rects) {
    expect(
      rect.center.dx,
      closeTo(panel.center.dx, 1),
      reason: '$name is not centred',
    );
    expect(rect.left, greaterThanOrEqualTo(panel.left));
    expect(rect.right, lessThanOrEqualTo(panel.right));
  }
}

void main() {
  setUpAll(loadProjectFonts);

  for (final language in AppLanguage.values) {
    final strings = AppStrings.of(language);

    testWidgets(
      '${language.name}: a category with no photos — the framed empty-state panel, centred, «${strings('allCategories')}» back to all',
      (tester) async {
        final reviews = await _pump(tester, language: language);
        await tester.tap(find.text(_category.name).last);
        await tester.pumpAndSettle();
        expect(reviews.categoryIds, [null, 'c1']);
        expect(tester.takeException(), isNull);

        expect(_state, findsOneWidget, reason: 'the shared component');
        final state = tester.widget<AnimeEmptyState>(_state);
        expect(state.centered, isTrue);
        expect(state.title, strings('noPhotosInCategoryTitle'));
        final panel = _expectFramedPanel(tester);
        _expectCenteredStack(
          tester,
          panel: panel,
          title: strings('noPhotosInCategoryTitle'),
          body: strings('noPhotosInCategoryBody'),
          action: strings('allCategories'),
        );

        await tester.tap(
          find.descendant(
            of: _state,
            matching: find.text(strings('allCategories')),
          ),
        );
        await tester.pumpAndSettle();
        expect(reviews.categoryIds, [null, 'c1', null]);
        expect(
          tester.widget<AnimeEmptyState>(_state).title,
          strings('beFirstToShareTitle'),
        );
      },
    );

    testWidgets(
      '${language.name}: the whole community empty — same framed, centred composition',
      (tester) async {
        await _pump(tester, language: language);
        expect(tester.takeException(), isNull);
        expect(_state, findsOneWidget);
        expect(tester.widget<AnimeEmptyState>(_state).centered, isTrue);
        final panel = _expectFramedPanel(tester);
        _expectCenteredStack(
          tester,
          panel: panel,
          title: strings('beFirstToShareTitle'),
          body: strings('beFirstToShareBody'),
          action: strings('shareYourExperience'),
        );
      },
    );
  }

  testWidgets('guest: no «شارك تجربتك» (it opens the protected «طلباتي»)', (
    tester,
  ) async {
    await _pump(tester, loggedIn: false);
    expect(_state, findsOneWidget);
    expect(
      find.descendant(of: _state, matching: find.byType(AnimePrimaryButton)),
      findsNothing,
    );
    _expectFramedPanel(tester);
  });

  for (final language in AppLanguage.values) {
    for (final (name, size, scale) in const [
      ('320×568 ×1.0', Size(320, 568), 1.0),
      ('320×568 ×1.3', Size(320, 568), 1.3),
    ]) {
      testWidgets(
        '${language.name} $name: no overflow; the button scrolls clear of the floating nav bar',
        (tester) async {
          final strings = AppStrings.of(language);
          await _pump(tester, size: size, language: language, textScale: scale);
          await tester.tap(find.text(_category.name).last);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);

          final button = find.descendant(
            of: _state,
            matching: find.text(strings('allCategories')),
          );
          // الشريط العائم يغطّي ١٠٤ من أسفل الشاشة (`extendBody`).
          await tester.drag(
            find.descendant(
              of: _state,
              matching: find.byType(SingleChildScrollView),
            ),
            const Offset(0, -2000),
          );
          await tester.pumpAndSettle();
          expect(
            tester.getRect(button).bottom,
            lessThanOrEqualTo(size.height - 104 + 18),
            reason: 'the last action must scroll above the nav bar',
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
