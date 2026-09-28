import 'package:auto_route/auto_route.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../../../core/l10n/locale_refetch.dart';
import 'package:flutter/material.dart';

import '../../../../core/utils/request_sequence.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/gender.dart';
import '../../../../core/router/app_router.dart';
import '../../../main_navigation/presentation/screens/main_navigation_screen.dart';
import '../../../products/domain/entities/product.dart';
import '../../../products/domain/usecases/search_products_usecase.dart';
import '../../../../core/di/injection_container.dart';
import '../../data/search_history_storage.dart';
import '../../../visuals/domain/visual_slot.dart';

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

class _SearchScreenState extends State<SearchScreen> with LocaleRefetch {
  final _controller = TextEditingController();

  /// آخر عمليات البحث — تُحمَّل من التخزين المحلي وتبقى بعد إغلاق التطبيق.
  List<String> _recent = const [];
  List<Product> _results = [];
  bool _searched = false;
  bool _loading = false;

  /// فشل آخر طلب — يُعرض بدل النتائج مع إعادة محاولة؛ `null` ما دام سليماً.
  String? _error;

  /// اقتراحات ثابتة تساعد الزائر على البدء — ليست بيانات وهمية لمنتجات.
  ///
  /// مفاتيحُ لا نصوص: الرقاقة تعرض النصّ **وترسله استعلاماً** في آنٍ واحد،
  /// فلو بقي النصّ محفوراً هنا لبقي عربياً في واجهةٍ كردية. المفتاح يُصرَّف
  /// عند العرض، والقيمة العربية اليوم هي القيمة نفسها حرفاً بحرف.
  static const _suggestionKeys = [
    'searchSuggestionTshirt',
    'searchSuggestionHoodie',
    'searchSuggestionFigures',
    'searchSuggestionBag',
    'searchSuggestionStickers',
    'searchSuggestionAccessories',
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

  /// نتائج البحث تُعاد للاستعلام الحالي بلغة الواجهة الجديدة.
  ///
  /// [CRITICAL] المطابقة نفسها بلغة الطلب (هجرة ٠٦٦): العربية تبحث في الاسم
  /// والوصف العربيين، والكردية في الكرديين. تبديل اللغة يغيّر **مجموعة**
  /// النتائج لا أسماءها وحدها — والأسماء تُعرض بـ[localizedProductName].
  @override
  void onLanguageChanged() {
    final query = _controller.text.trim();
    if (query.isNotEmpty) _search(query);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// أحدث استعلام — نتائج استعلامٍ سابق تصل متأخّرةً تُهمَل (انظر [RequestSequence]).
  final _requests = RequestSequence();

  Future<void> _search(String query) async {
    // [CRITICAL] الرقم يُلتقط قبل أي `await`: المستخدم يكتب «ناروتو» ثم
    // «لوفي» قبل وصول الأولى؛ بلا هذا كان ردّ «ناروتو» يصل متأخّراً ويطمس
    // نتائج «لوفي» — قائمةٌ لا تطابق ما في حقل البحث.
    final token = _requests.next();
    final trimmed = query.trim();
    if (trimmed.isEmpty) {
      setState(() {
        _results = [];
        _searched = false;
        _error = null;
      });
      return;
    }

    // يُلتقط قبل أي await حتى لا يُقرأ الـcontext عبر فجوة غير متزامنة.
    final searchProducts = context.read<SearchProductsUsecase>();

    setState(() {
      _searched = true;
      _loading = true;
      _error = null;
    });
    // يُحفظ على الجهاز فوراً ليبقى بعد إغلاق الشاشة أو التطبيق.
    final recent = await sl<SearchHistoryStorage>().add(trimmed);
    if (mounted) setState(() => _recent = recent);

    // [CRITICAL] كل مسارٍ يُخرج من التحميل. كان الفشل بلا مسار: استثناءٌ من
    // الشبكة يترك `_loading = true` فيدور المؤشّر إلى الأبد بلا رسالة ولا
    // إعادة محاولة. والفشل، كالنجاح، يُهمَل إن تجاوزه طلبٌ أحدث: لا يطمس
    // نتائج «لوفي» فشلُ «ناروتو» المتأخّر.
    try {
      final results = await searchProducts(trimmed);
      if (!mounted || !_requests.isCurrent(token)) return;
      setState(() {
        _results = results.items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || !_requests.isCurrent(token)) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _pick(String term) {
    _controller.text = term;
    _search(term);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // إطار الشبكة: يمنع تمدّد المحتوى بلا حدّ ويترك للشبكة عرضاً
      // يكفي أعمدةً أكثر. لا أثر له على الهاتف.
      body: ResponsiveContentFrame(
        maxWidth: kGridMaxWidth,
        child: SafeArea(
          child: Column(
            children: [
              _buildSearchBar(),
              Expanded(child: _buildBody()),
            ],
          ),
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
                hintText: context.strings('searchHint'),
                hintStyle: theme.textTheme.bodyMedium?.copyWith(
                  fontSize: 14,
                  color: theme.colorScheme.onSurfaceVariant,
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
    if (_error != null) {
      return AnimeErrorState(message: _error!, onAction: () => _search(_controller.text));
    }
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
                  label: context.strings('recentSearches'),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                ),
              ),
              AnimeTextButton(
                label: context.strings('clearAll'),
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
        OtakuGroupLabel(
          label: context.strings('suggestedForYou'),
          padding: EdgeInsets.only(bottom: 11),
        ),
        Wrap(
          spacing: 9,
          runSpacing: 9,
          children: [
            for (final term in _suggestionKeys.map(context.strings.call))
              AnimeChoiceChip(
                label: term,
                selected: false,
                onSelected: (_) => _pick(term),
              ),
          ],
        ),
        // لم تعد `const`: النصّ يُصرَّف بجنس صاحب الحساب فيُقرأ من السياق.
        OtakuEditorialPanel(
          title: context.strings('searchIdleTitle'),
          body: context.g(GenderedStrings.searchHintBody),
          artworkSlot: VisualSlots.searchHeader,
          margin: const EdgeInsets.only(top: 24),
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
          context.strings('searchingInGalaxy'),
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
              context.strings.p('resultsCount', {'count': '${_results.length}'}),
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
      title: context.strings('noResultsTitle'),
      subtitle: context.strings('noResultsBody'),
      artworkSlot: VisualSlots.emptySearch,
      actionLabel: context.strings('browseCategories'),
      onAction: () {
        mainNavIndex.value = MainTab.categories;
        context.router.popUntilRoot();
      },
      // نمط السلة الفارغة: الرسم فوق، ثم النصّ، ثم زرّ «تصفّح الأقسام» —
      // كلٌّ في وسط اللوحة لا في جهة البداية.
      centered: true,
    );
  }
}
