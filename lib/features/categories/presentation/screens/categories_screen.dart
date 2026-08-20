import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../products/domain/usecases/fetch_categories_usecase.dart';

@RoutePage()
class CategoriesScreen extends StatefulWidget {
  const CategoriesScreen({super.key});

  @override
  State<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends State<CategoriesScreen> {
  List<dynamic> _categories = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

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
    final colors = context.themeColors;

    return Scaffold(
      appBar: AppBar(title: const Text('الأقسام'), centerTitle: true),
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: _loading
            ? _buildLoadingGrid()
            : _error != null
            ? AnimeErrorState(message: _error!, onAction: _load)
            : RefreshIndicator(
                onRefresh: _load,
                child: CustomScrollView(
                  slivers: [
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: EdgeInsets.all(
                          AppDimens.screenHorizontalPadding,
                        ),
                        child: Text(
                          'تصفح أقسام متجر مجرات الاوتاكو',
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                        ),
                      ),
                    ),
                    SliverPadding(
                      padding: EdgeInsets.all(
                        AppDimens.screenHorizontalPadding,
                      ),
                      sliver: SliverGrid(
                        gridDelegate:
                            const SliverGridDelegateWithMaxCrossAxisExtent(
                              maxCrossAxisExtent: 220,
                              mainAxisSpacing: AppDimens.space3,
                              crossAxisSpacing: AppDimens.space3,
                              childAspectRatio: 0.95,
                            ),
                        delegate: SliverChildBuilderDelegate((context, index) {
                          final category = _categories[index];
                          return AnimeCategoryCard(
                            category: category,
                            size: double.infinity,
                            onTap: () => context.router.push(
                              CategoryProductsRoute(
                                categoryId: category.id,
                                categoryName: category.name,
                              ),
                            ),
                          );
                        }, childCount: _categories.length),
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: SizedBox(height: AppDimens.space10),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _buildLoadingGrid() {
    return GridView.builder(
      padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 220,
        mainAxisSpacing: AppDimens.space3,
        crossAxisSpacing: AppDimens.space3,
        childAspectRatio: 0.95,
      ),
      itemCount: 6,
      itemBuilder: (context, index) => _buildCategorySkeleton(),
    );
  }

  Widget _buildCategorySkeleton() {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(AppDimens.radiusLg),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: AppDimens.categoryIconSize * 1.5,
            height: AppDimens.categoryIconSize * 1.5,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Theme.of(context).colorScheme.outlineVariant,
                  Theme.of(context).colorScheme.surfaceContainerHighest,
                ],
              ),
              borderRadius: BorderRadius.circular(AppDimens.radiusMd),
            ),
          ),
          SizedBox(height: AppDimens.space3),
          Container(
            height: 14,
            width: 70,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Theme.of(context).colorScheme.outlineVariant,
                  Theme.of(context).colorScheme.surfaceContainerHighest,
                ],
              ),
              borderRadius: BorderRadius.circular(AppDimens.radiusSm),
            ),
          ),
        ],
      ),
    );
  }
}
