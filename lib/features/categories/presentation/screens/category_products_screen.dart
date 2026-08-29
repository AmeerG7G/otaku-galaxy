import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../home/presentation/widgets/product_card.dart';
import '../../../products/domain/entities/category.dart';
import '../../../products/domain/entities/product.dart';
import '../../../products/domain/usecases/fetch_categories_usecase.dart';
import '../../../products/domain/usecases/fetch_category_products_usecase.dart';
import '../../../products/domain/entities/product_sort.dart';

/// شاشة منتجات القسم — عند دخول قسم رئيسي له أقسام فرعية، تُفتح مباشرةً
/// على أول قسم فرعي (بلا صفحة "الكل")، مع إمكانية التنقل بالسحب الأفقي
/// أو بالنقر على اسم القسم الفرعي أعلى الشاشة.
@RoutePage()
class CategoryProductsScreen extends StatefulWidget {
  const CategoryProductsScreen({
    super.key,
    required this.categoryId,
    required this.categoryName,
  });

  final String categoryId;
  final String categoryName;

  @override
  State<CategoryProductsScreen> createState() => _CategoryProductsScreenState();
}

class _CategoryProductsScreenState extends State<CategoryProductsScreen> {
  List<Product> _products = [];
  List<String> _subcategories = const [];
  // معرّفات الأقسام الفرعية (اسم → معرّف) لفلترة المنتجات عبر subcategoryId.
  Map<String, String> _subcategoryIds = const {};
  // الصفحة الحالية داخل الأقسام الفرعية (0 = أول قسم فرعي — لا صفحة "الكل").
  int _selectedPage = 0;
  bool _loading = true;

  /// الترتيب المختار — يُرسل للخادم عند كل تحميل.
  ProductSort _sort = ProductSort.newest;
  String? _error;

  /// ترتيب القسم ضمن قائمة الأقسام — يحدّد تدرّج ترويسة v2.
  /// القسم كما وصل من الخادم (لصورته وأقسامه الفرعية)؛ null قبل التحميل.
  Category? _category;

  late final PageController _pageController;
  final _pillsScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _load();
  }

  @override
  void dispose() {
    _pageController.dispose();
    _pillsScrollController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final fetchCategoryProducts = context
          .read<FetchCategoryProductsUsecase>();
      final fetchCategories = context.read<FetchCategoriesUsecase>();
      final products = await fetchCategoryProducts(
        widget.categoryId,
        sort: _sort,
      );
      List<String> subcategories = const [];
      Map<String, String> subcategoryIds = const {};
      try {
        final categories = await fetchCategories();
        final index = categories.indexWhere(
          (Category c) => c.id == widget.categoryId,
        );
        if (index != -1) {
          subcategories = categories[index].subcategories;
          subcategoryIds = categories[index].subcategoryIds;
          _category = categories[index];
        }
      } catch (_) {
        // الأقسام الفرعية اختيارية — لا نُفشل الشاشة عند عدم توفرها.
      }
      if (!mounted) return;
      setState(() {
        _products = products;
        _subcategories = subcategories;
        _subcategoryIds = subcategoryIds;
        _selectedPage = 0;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  List<Product> _productsForPage(int page) {
    final subcategory = _subcategories[page];
    final subcategoryId = _subcategoryIds[subcategory];
    if (subcategoryId != null) {
      return _products.where((p) => p.subcategoryId == subcategoryId).toList();
    }
    return _products.where((p) => p.subcategory == subcategory).toList();
  }

  void _selectPage(int page) {
    if (page == _selectedPage) return;
    _pageController.animateToPage(
      page,
      duration: AppDimens.durationNormal,
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          OtakuScreenHeader.gradient(
            title: widget.categoryName,
            subtitle: _loading
                ? 'جاري التحميل…'
                : '${_products.length} منتج في هذا القسم',
            gradient: LinearGradient(
              // نفس دالة اللون التي تستخدمها بطاقة القسم، ومشتقّة من
              // المعرّف لا من الترتيب — فيتطابق اللون هنا ومع الشاشتين
              // الأخريين حتى قبل أن تصل قائمة الأقسام.
              colors: AnimeCategoryCard.gradientForCategory(
                _category ??
                    Category(id: widget.categoryId, name: widget.categoryName),
              ),
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
            ),
            onBack: () => context.router.maybePop(),
            actions: [
              OtakuHeaderButton(
                icon: Icons.search_rounded,
                onGradient: true,
                tooltip: 'بحث',
                onTap: () => context.router.push(SearchRoute()),
              ),
            ],
          ),
          Expanded(child: _buildContent()),
        ],
      ),
    );
  }

  Widget _buildContent() {
    if (_loading) return const OtakuProductSkeletonGrid();
    if (_error != null) {
      return AnimeErrorState(message: _error!, onAction: _load);
    }
    if (_products.isEmpty) {
      return AnimeEmptyState(
        title: 'ما بيه منتجات هنا',
        subtitle: 'هذا القسم فاضي حالياً — جرّب قسم ثاني أو ارجع لاحقاً.',
        artwork: 'assets/art/a-l-detective.png',
        actionLabel: 'رجوع للأقسام',
        onAction: () => context.router.maybePop(),
      );
    }

    if (_subcategories.isEmpty) {
      return Column(
        children: [
          _buildSortBar(),
          Expanded(child: _buildProductsScroll(_products)),
        ],
      );
    }

    return Column(
      children: [
        _buildSubcategoryPills(),
        _buildSortBar(),
        Expanded(
          child: PageView.builder(
            controller: _pageController,
            onPageChanged: (page) {
              setState(() => _selectedPage = page);
              _scrollPillIntoView(page);
            },
            itemCount: _subcategories.length,
            itemBuilder: (context, page) =>
                _buildProductsScroll(_productsForPage(page)),
          ),
        ),
      ],
    );
  }

  void _scrollPillIntoView(int index) {
    // تمرير تقريبي يبقي التبويب المختار مرئياً — كل شارة بعرض متغيّر بسيط
    // فنقدّر الإزاحة بمعدل ثابت مقبول بصرياً بدل قياس دقيق لكل شارة.
    if (!_pillsScrollController.hasClients) return;
    final target = (index - 1).clamp(0, _subcategories.length - 1) * 96.0;
    _pillsScrollController.animateTo(
      target.clamp(0, _pillsScrollController.position.maxScrollExtent),
      duration: AppDimens.durationNormal,
      curve: Curves.easeOutCubic,
    );
  }

  /// شارات الأقسام الفرعية أعلى الشاشة — نقر أو سحب أفقي للتنقل بينها.
  Widget _buildSubcategoryPills() {
    // بلا ارتفاع ثابت: `SizedBox(height: 52)` ناقص الحشوة كان يترك ٣٤ بكسل
    // لرقاقة تحتاج أكثر، فتُقصّ الكبسولة ونصفُ النص معها. التمرير الأفقي
    // هنا يقيس محتواه، فيتمدّد مع تكبير الخط ولا يقصّ شيئاً.
    return SingleChildScrollView(
      controller: _pillsScrollController,
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(18, 14, 18, 8),
      child: Row(
        children: [
          for (var index = 0; index < _subcategories.length; index++) ...[
            if (index > 0) const SizedBox(width: 7),
            AnimeChoiceChip(
              label: _subcategories[index],
              selected: _selectedPage == index,
              onSelected: (selected) {
                if (selected) _selectPage(index);
              },
            ),
          ],
        ],
      ),
    );
  }

  /// شريط الترتيب — سطح عائم بحافة ١٫٥ كما في مصدر التصميم.
  Widget _buildSortBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 6),
      child: OtakuSortBar(label: _sort.label, onTap: _openSortSheet),
    );
  }

  /// ورقة الترتيب السفلية — بديل قوائم Material المنسدلة.
  ///
  /// النتيجة تُحفظ في الحالة ثم يُعاد التحميل من الخادم، فيشمل الترتيب
  /// الكتالوج كاملاً لا الصفحة المعروضة فقط.
  Future<void> _openSortSheet() async {
    final picked = await showOtakuPicker<ProductSort>(
      context: context,
      title: 'ترتيب حسب',
      selected: _sort,
      options: [
        for (final sort in ProductSort.values)
          OtakuPickerOption(value: sort, label: sort.label),
      ],
    );
    if (picked == null || picked == _sort || !mounted) return;
    setState(() => _sort = picked);
    await _load();
  }

  /// شبكة المنتجات (تُستخدم داخل صفحة المتصفح أو في القسم بلا أقسام فرعية).
  Widget _buildProductsScroll(List<Product> products) {
    if (products.isEmpty) {
      return LayoutBuilder(
        builder: (context, constraints) => RefreshIndicator(
          onRefresh: _load,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: SizedBox(
              height: constraints.maxHeight,
              child: const AnimeEmptyState(
                title: 'ما بيه منتجات بهذا القسم',
                subtitle: 'جرّب قسم فرعي ثاني — أكيد راح تلكي شي يعجبك.',
                artwork: 'assets/art/a-l-detective.png',
              ),
            ),
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: GridView.builder(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 26),
        physics: const AlwaysScrollableScrollPhysics(),
        gridDelegate: kProductGridDelegate,
        itemCount: products.length,
        itemBuilder: (context, index) {
          final product = products[index];
          return ProductCard(
            product: product,
            onTap: () =>
                context.router.push(ProductDetailRoute(productId: product.id)),
          );
        },
      ),
    );
  }
}
