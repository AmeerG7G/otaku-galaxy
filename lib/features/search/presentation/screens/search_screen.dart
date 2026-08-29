import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../main_navigation/presentation/screens/main_navigation_screen.dart';
import '../../../products/domain/entities/product.dart';
import '../../../products/domain/usecases/search_products_usecase.dart';
import '../../../../core/di/injection_container.dart';
import '../../data/search_history_storage.dart';

/// شاشة البحث بتصميم Otaku Galaxy v2.
///
/// صفّ علوي = زر رجوع مربّع + حقل بحث عائم بنصف قطر ٢٢. قبل الكتابة تظهر
/// رقائق «الأخيرة» و«مقترحة» ولوحة تحريرية برسم شخصية؛ وبعدها صفوف نتائج
/// أفقية أو حالة «لا نتائج» تحريرية.
@RoutePage()
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, this.initialQuery = ''});

  final String initialQuery;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _controller = TextEditingController();
  /// آخر عمليات البحث — تُحمَّل من التخزين المحلي وتبقى بعد إغلاق التطبيق.
  List<String> _recent = const [];
  List<Product> _results = [];
  bool _searched = false;
  bool _loading = false;

  /// اقتراحات ثابتة تساعد الزائر على البدء — ليست بيانات وهمية لمنتجات.
  static const _suggestions = [
    'تيشيرت',
    'هودي',
    'مجسمات',
    'حقيبة',
    'ملصقات',
    'إكسسوارات',
  ];

  @override
  void initState() {
    super.initState();
    // استعادة السجلّ المحفوظ فور فتح الشاشة (يبقى بعد إعادة التشغيل).
    _recent = sl<SearchHistoryStorage>().load();
    if (widget.initialQuery.isNotEmpty) {
      _controller.text = widget.initialQuery;
      _search(widget.initialQuery);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _search(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) {
      setState(() {
        _results = [];
        _searched = false;
      });
      return;
    }

    // يُلتقط قبل أي await حتى لا يُقرأ الـcontext عبر فجوة غير متزامنة.
    final searchProducts = context.read<SearchProductsUsecase>();

    setState(() {
      _searched = true;
      _loading = true;
    });
    // يُحفظ على الجهاز فوراً ليبقى بعد إغلاق الشاشة أو التطبيق.
    final recent = await sl<SearchHistoryStorage>().add(trimmed);
    if (mounted) setState(() => _recent = recent);

    final results = await searchProducts(trimmed);
    if (!mounted) return;
    setState(() {
      _results = results.items;
      _loading = false;
    });
  }

  void _pick(String term) {
    _controller.text = term;
    _search(term);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _buildSearchBar(),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchBar() {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 12),
      child: Row(
        children: [
          OtakuHeaderButton.back(onTap: () => context.router.maybePop()),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: _controller,
              autofocus: widget.initialQuery.isEmpty,
              textInputAction: TextInputAction.search,
              onSubmitted: _search,
              onChanged: (value) {
                if (value.trim().isEmpty) _search('');
                setState(() {});
              },
              style: theme.textTheme.bodyMedium?.copyWith(fontSize: 14),
              decoration: InputDecoration(
                isDense: true,
                hintText: 'ابحث عن منتج…',
                hintStyle: theme.textTheme.bodyMedium?.copyWith(
                  fontSize: 14,
                  color: theme.colorScheme.outline,
                ),
                filled: true,
                fillColor: theme.colorScheme.surface,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 14,
                ),
                suffixIcon: _controller.text.isEmpty
                    ? null
                    : IconButton(
                        icon: Icon(
                          Icons.close_rounded,
                          size: 18,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        onPressed: () {
                          _controller.clear();
                          _search('');
                          setState(() {});
                        },
                      ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  borderSide: BorderSide(
                    color: theme.colorScheme.outlineVariant,
                    width: 1.5,
                  ),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  borderSide: BorderSide(
                    color: theme.colorScheme.outlineVariant,
                    width: 1.5,
                  ),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  borderSide: const BorderSide(
                    color: AppColors.secondary,
                    width: 1.5,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (!_searched) return _buildIdleState();
    if (_loading) return _buildSearchingState();
    if (_results.isEmpty) return _buildNoResults();
    return _buildResults();
  }

  /// حالة ما قبل البحث — رقائق الأخيرة والمقترحة ثم لوحة تحريرية.
  Widget _buildIdleState() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 4, 18, 26),
      children: [
        if (_recent.isNotEmpty) ...[
          Row(
            children: [
              Expanded(
                child: OtakuGroupLabel(
                  label: 'عمليات البحث الأخيرة',
                  padding: const EdgeInsets.symmetric(vertical: 8),
                ),
              ),
              AnimeTextButton(
                label: 'مسح الكل',
                onPressed: () async {
                  await sl<SearchHistoryStorage>().clear();
                  if (mounted) setState(() => _recent = const []);
                },
              ),
            ],
          ),
          const SizedBox(height: 3),
          Wrap(
            spacing: 9,
            runSpacing: 9,
            children: [
              for (final term in _recent)
                AnimeChoiceChip(
                  label: term,
                  selected: false,
                  onSelected: (_) => _pick(term),
                ),
            ],
          ),
          const SizedBox(height: 22),
        ],
        const OtakuGroupLabel(
          label: 'مقترحة لك',
          padding: EdgeInsets.only(bottom: 11),
        ),
        Wrap(
          spacing: 9,
          runSpacing: 9,
          children: [
            for (final term in _suggestions)
              AnimeChoiceChip(
                label: term,
                selected: false,
                onSelected: (_) => _pick(term),
              ),
          ],
        ),
        const OtakuEditorialPanel(
          title: 'دوّر على أي شي يخطر ببالك',
          body: 'اكتب اسم المنتج أو الأنمي، وراح نطلعلك كل الموجود بالمتجر.',
          artwork: 'assets/art/a-l-detective.png',
          margin: EdgeInsets.only(top: 24),
          artHeight: 150,
          minHeight: 150,
          contentWidthFactor: 0.64,
        ),
      ],
    );
  }

  Widget _buildSearchingState() {
    final theme = Theme.of(context);
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const SizedBox(
          width: 26,
          height: 26,
          child: CircularProgressIndicator(
            strokeWidth: 3,
            color: AppColors.secondary,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'نبحث في المجرّة…',
          style: theme.textTheme.bodyMedium?.copyWith(
            fontSize: 13,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }

  Widget _buildResults() {
    final theme = Theme.of(context);
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(18, 6, 18, 26),
      itemCount: _results.length + 1,
      separatorBuilder: (_, _) => const SizedBox(height: 11),
      itemBuilder: (context, index) {
        if (index == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 7),
            child: Text(
              '${_results.length} نتيجة',
              style: theme.textTheme.bodySmall?.copyWith(
                fontSize: 12.5,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          );
        }
        final product = _results[index - 1];
        return AnimeProductRow(
          product: product,
          onTap: () =>
              context.router.push(ProductDetailRoute(productId: product.id)),
        );
      },
    );
  }

  Widget _buildNoResults() {
    return AnimeEmptyState(
      title: 'ما لكينا شي',
      subtitle: 'جرّب كلمة أقصر أو تصفّح الأقسام — أكيد راح تلكي شي يعجبك.',
      artwork: 'assets/art/opt/a-i1.png',
      actionLabel: 'تصفّح الأقسام',
      onAction: () {
        mainNavIndex.value = MainTab.categories;
        context.router.popUntilRoot();
      },
    );
  }
}
