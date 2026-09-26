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

/// تبويب الأقسام بتصميم Otaku Galaxy v2.
///
/// ترويسة تبويب بعنوان تحريري كبير ورسم باهت، ثم عمود لافتات أقسام
/// عريضة متدرّجة بحروف مائية ضخمة — بدل شبكة المربّعات القديمة.
@RoutePage()
class CategoriesScreen extends StatefulWidget {
  const CategoriesScreen({super.key});

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

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          OtakuScreenHeader.tab(
            title: context.strings('navCategories'),
            subtitle: context.strings('categoriesSubtitle'),
            artwork: 'assets/art/opt/a-i2.png',
            artworkSlot: VisualSlots.categoriesHeader,
            artworkWidth: 110,
            artworkEnd: -10,
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return ListView.separated(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 26),
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
      return AnimeEmptyState(
        title: context.strings('noCategoriesTitle'),
        subtitle: context.strings('noCategoriesBody'),
        artwork: 'assets/art/opt/a-i2.png',
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 104),
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
