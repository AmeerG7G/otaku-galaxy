import 'dart:math' as math;

import 'package:auto_route/auto_route.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../../../core/l10n/locale_refetch.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../products/domain/entities/category.dart';
import '../../../products/domain/usecases/fetch_categories_usecase.dart';
import '../../../visuals/domain/visual_slot.dart';
import '../../../visuals/presentation/character_artwork.dart';

/// تبويب الأقسام بتصميم Otaku Galaxy v2.
///
/// ترويسة تبويب بعنوان تحريري كبير ورسم باهت، ثم عمود لافتات أقسام
/// عريضة متدرّجة بحروف مائية ضخمة — بدل شبكة المربّعات القديمة.
@RoutePage()
class CategoriesScreen extends StatefulWidget {
  const CategoriesScreen({super.key});

  /// أقصى عرضٍ لرسم الترويسة (39).
  static const double artMaxWidth = 110;

  /// بروز الرسم خارج حافة النهاية (اليسار في RTL) — حافته الشفافة.
  static const double artEndOverhang = 10;

  /// الفراغ بين الترويسة وبطاقة القسم الأولى — الرسم ينتهي عند البطاقة.
  static const double listTop = 18;

  @override
  State<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends State<CategoriesScreen> with LocaleRefetch {
  List<Category> _categories = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// المحتوى الخادمي يُصرَّف لحظة الجلب — يُعاد جلبه بلغة الواجهة الجديدة.
  @override
  void onLanguageChanged() => _load();

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final categories = await context.read<FetchCategoriesUsecase>()();
      if (!mounted) return;
      setState(() {
        _categories = categories;
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

  // [PRODUCT] بلا `SafeArea` على مستوى الشاشة (2026-09-28، لهذه الشاشة
  // وحدها). كانت تدفع الشاشة كلّها تحت شريط الحالة، فيبقى شريطٌ فارغ بارتفاعه
  // فوق الترويسة. الترويسة (تدرّجها) تمتدّ إلى منطقة شريط الحالة، والمحتوى
  // محميّ من مكانين:
  // - `OtakuScreenHeader` يحمل `SafeArea` داخلياً حول العنوان وسطره الوصفي،
  //   فلا نصَّ تحت أيقونات البطارية والشبكة.
  // - الجسم تحت الترويسة يُنزَع عنه الهامش العلوي (`removeTop`): الترويسة
  //   استهلكته، فلا تضيفه قائمةٌ أو حالةٌ فارغة مرّة ثانية.
  //
  // [PRODUCT] (المالك، 2026-10-26 — يحلّ محلّ قرار 2026-10-10 «الرسم في منطقة
  // شريط الحالة») رأس الشخصية 39 لا يقع تحت الساعة والبطارية: الرسم يبدأ أسفل
  // شريط الحالة. إنزاله وحده كان يُدخل أسفله ٢٣ بكسل في بطاقة القسم الأولى (بأي
  // ارتفاعٍ لشريط الحالة: الترويسة تطول بقدره)، فالرسم يُحصر بين أسفل شريط
  // الحالة وأعلى البطاقة الأولى ويُصغَّر بنسبته إن لم يتّسع (عرضه ١١٠ كحدٍّ
  // أقصى). `_CategoriesLayout` يقيس الترويسة أولاً ثم يعطي الرسم ما بقي —
  // تمريرٌ واحد بلا قياسٍ بعد الإطار. الرسم آخر ما يُرسم (فوق القائمة حين
  // تُمرَّر) و`IgnorePointer`.
  @override
  Widget build(BuildContext context) {
    return CustomMultiChildLayout(
      delegate: _CategoriesLayout(
        statusBar: MediaQuery.paddingOf(context).top,
        textDirection: Directionality.of(context),
      ),
      children: [
        LayoutId(
          id: _CategoriesSlot.header,
          child: OtakuScreenHeader.tab(
            title: context.strings('navCategories'),
            subtitle: context.strings('categoriesSubtitle'),
          ),
        ),
        LayoutId(
          id: _CategoriesSlot.body,
          child: MediaQuery.removePadding(
            context: context,
            removeTop: true,
            child: _buildBody(),
          ),
        ),
        // رسم الترويسة فوق الشاشة كلّها لا داخل صندوق الترويسة: ذاك يُقصّ بـ
        // `Clip.hardEdge` بارتفاع صندوقه (نصّ العنوان فقط).
        LayoutId(
          id: _CategoriesSlot.art,
          child: const IgnorePointer(
            child: CharacterArtwork(slot: VisualSlots.categoriesHeader),
          ),
        ),
      ],
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return ListView.separated(
        padding: context.scrollPadding(
          const EdgeInsets.fromLTRB(18, 18, 18, 26),
        ),
        itemCount: 5,
        separatorBuilder: (_, _) => const SizedBox(height: 13),
        itemBuilder: (_, _) =>
            const OtakuSkeleton.box(height: 112, radius: AppDimens.radiusLg),
      );
    }
    if (_error != null) {
      return AnimeErrorState(message: _error!, onAction: _load);
    }
    if (_categories.isEmpty) {
      // بلا رسم: الصورة 37 حُذفت (2026-09-28).
      return AnimeEmptyState(
        title: context.strings('noCategoriesTitle'),
        subtitle: context.strings('noCategoriesBody'),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: context.scrollPadding(
          const EdgeInsets.fromLTRB(
            18,
            CategoriesScreen.listTop,
            18,
            OtakuBottomNav.contentGap,
          ),
        ),
        itemCount: _categories.length,
        separatorBuilder: (_, _) => const SizedBox(height: 13),
        itemBuilder: (context, index) {
          final category = _categories[index];
          return AnimeCategoryCard(
            category: category,
            index: index,
            onTap: () => context.router.push(
              CategoryProductsRoute(
                categoryId: category.id,
                categoryName: category.name,
              ),
            ),
          );
        },
      ),
    );
  }
}

enum _CategoriesSlot { header, body, art }

/// الترويسة ثم الجسم تحتها، ثم الرسم في المساحة بين أسفل شريط الحالة وأعلى
/// البطاقة الأولى (أسفل الترويسة + [CategoriesScreen.listTop]).
class _CategoriesLayout extends MultiChildLayoutDelegate {
  _CategoriesLayout({required this.statusBar, required this.textDirection});

  final double statusBar;
  final TextDirection textDirection;

  @override
  void performLayout(Size size) {
    final header = layoutChild(
      _CategoriesSlot.header,
      BoxConstraints(minWidth: size.width, maxWidth: size.width),
    );
    positionChild(_CategoriesSlot.header, Offset.zero);
    layoutChild(
      _CategoriesSlot.body,
      BoxConstraints.tight(
        Size(size.width, math.max(0, size.height - header.height)),
      ),
    );
    positionChild(_CategoriesSlot.body, Offset(0, header.height));
    final room = header.height + CategoriesScreen.listTop - statusBar;
    final art = layoutChild(
      _CategoriesSlot.art,
      BoxConstraints(
        maxWidth: CategoriesScreen.artMaxWidth,
        maxHeight: math.max(0, room),
      ),
    );
    final x = textDirection == TextDirection.rtl
        ? -CategoriesScreen.artEndOverhang
        : size.width - art.width + CategoriesScreen.artEndOverhang;
    positionChild(_CategoriesSlot.art, Offset(x, statusBar));
  }

  @override
  bool shouldRelayout(_CategoriesLayout oldDelegate) =>
      oldDelegate.statusBar != statusBar ||
      oldDelegate.textDirection != textDirection;
}
