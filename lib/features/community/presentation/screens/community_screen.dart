import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../reviews/domain/entities/review.dart';
import '../../../reviews/domain/repositories/review_repository.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../auth/presentation/cubit/auth_state.dart';
import '../../../reviews/presentation/cubit/reviews_cubit.dart';
import '../../../products/domain/entities/category.dart';
import '../../../products/domain/usecases/fetch_categories_usecase.dart';

/// المجتمع بتصميم Otaku Galaxy v2.
///
/// ترويسة تحريرية بهالة بنفسجية ورسم باهت وكبسولة عدد معتمدة، ثم معرض
/// بعمودين بارتفاعات متفاوتة — لا شبكة مربّعات متساوية ولا شريط تطبيق.
///
/// ليس شبكة اجتماعية: بلا إعجابات، تعليقات، متابعين، ملفات شخصية أو قصص.
/// الغرض تجاري بحت — إظهار المنتجات بصور حقيقية والانتقال لصفحة المنتج.
@RoutePage()
class CommunityScreen extends StatefulWidget {
  const CommunityScreen({super.key});

  @override
  State<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends State<CommunityScreen> {
  List<Review> _photos = [];
  bool _loading = true;
  String? _error;

  /// الأقسام الحقيقية من الخادم — لا تُخترع أقسام على العميل.
  List<Category> _categories = const [];

  /// القسم المختار؛ `null` تعني «الكل».
  String? _categoryId;

  @override
  void initState() {
    super.initState();
    _loadCategories();
    _load();
    // تقييمات العميل نفسه تغذّي لافتتَي «قيد المراجعة» و«لم يتم قبولها».
    if (context.read<AuthCubit>().state is AuthAuthenticated) {
      context.read<ReviewsCubit>().load();
    }
  }

  /// شرائح الفلترة تُبنى من الأقسام الحقيقية؛ فشلها لا يكسر المعرض.
  Future<void> _loadCategories() async {
    try {
      final categories = await context.read<FetchCategoriesUsecase>()();
      if (!mounted) return;
      setState(() => _categories = categories);
    } catch (_) {
      if (!mounted) return;
      setState(() => _categories = const []);
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // الفلترة على الخادم: النتيجة تشمل كامل البيانات لا المحمَّل فقط.
      final photos = await context
          .read<ReviewRepository>()
          .fetchApprovedPhotoReviews(categoryId: _categoryId);
      if (!mounted) return;
      setState(() {
        _photos = photos;
        _loading = false;
      });
    } catch (e) {
      // المعرض يقرأ من الخادم — الفشل يعرض حالة خطأ لا تحميلاً أبدياً.
      if (!mounted) return;
      setState(() {
        _error = '$e';
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
          _buildHeader(),
          const _MyPhotoStatusBanners(),
          if (_categories.isNotEmpty) _buildCategoryFilters(),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  /// ترويسة المجتمع — هالة بنفسجية ورسم باهت خلف عنوان تحريري.
  Widget _buildHeader() {
    final theme = Theme.of(context);
    return Container(
      clipBehavior: Clip.hardEdge,
      decoration: const BoxDecoration(),
      child: Stack(
        children: [
          PositionedDirectional(
            top: -80,
            end: -70,
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    AppColors.primary.withValues(alpha: 0.20),
                    AppColors.primary.withValues(alpha: 0),
                  ],
                  stops: const [0, 0.66],
                ),
              ),
            ),
          ),
          PositionedDirectional(
            top: -6,
            end: -40,
            child: IgnorePointer(
              child: Opacity(
                opacity: 0.16,
                child: Image.asset('assets/art/opt/a-i0.png', width: 120),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 26, 18, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'المجتمع',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontFamily: 'Tajawal',
                    fontWeight: AppDimens.weightBlack,
                    fontSize: 24,
                    height: 1.3,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 7),
                FractionallySizedBox(
                  widthFactor: 0.82,
                  child: Text(
                    'صور حقيقية من عملاء استلموا منتجاتهم',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontSize: 13,
                      height: 1.6,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: OtakuStatusPill(
                    label: _loading
                        ? 'جاري التحميل…'
                        : '${_photos.length} صورة معتمدة',
                    color: AppColors.success,
                    showDot: false,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// شريط شرائح الأقسام — «الكل» ثم الأقسام الحقيقية، كما في المصدر.
  Widget _buildCategoryFilters() {
    // كان `SizedBox(height: 54)` مع حشوة ١٦+٨ يترك ٣٠ بكسل فقط للرقاقة،
    // وهي تحتاج نحو ٣٥ — فيُقصّ نصف النص. القياس الآن من المحتوى نفسه،
    // فلا قصّ مهما طال الاسم أو كبر الخط.
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 10),
      child: Row(
        children: [
          for (var index = 0; index < _categories.length + 1; index++) ...[
            if (index > 0) const SizedBox(width: 8),
            Builder(
              builder: (context) {
                final isAll = index == 0;
                final category = isAll ? null : _categories[index - 1];
                final selected = isAll
                    ? _categoryId == null
                    : _categoryId == category!.id;
                return _CategoryChip(
                  label: isAll ? 'الكل' : category!.name,
                  selected: selected,
                  onTap: () {
                    if (selected) return;
                    setState(() => _categoryId = category?.id);
                    _load();
                  },
                );
              },
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const _CommunitySkeleton();
    }
    if (_error != null) {
      return AnimeErrorState(message: _error!, onAction: _load);
    }
    if (_photos.isEmpty) {
      // فلتر مفعّل بلا نتائج ≠ مجتمع فارغ — الرسالة تختلف والإجراء كذلك.
      if (_categoryId != null) {
        return AnimeEmptyState(
          title: 'ما في صور بهذا القسم بعد',
          subtitle: 'جرّب قسماً ثانياً أو تصفّح كل الصور.',
          artwork: 'assets/art/opt/a-i1.png',
          actionLabel: 'كل الأقسام',
          onAction: () {
            setState(() => _categoryId = null);
            _load();
          },
        );
      }
      // المجتمع شاشة تصفّح حرّة: زرّ «شارك تجربتك» يفتح «طلباتي» المحمية،
      // فلا يُعرض للزائر كي لا يُقذف إلى تسجيل الدخول من شاشة عامة.
      final isLoggedIn = context.select<AuthCubit, bool>(
        (cubit) => cubit.state is AuthAuthenticated,
      );
      return AnimeEmptyState(
        title: 'كن أول من يشارك تجربته',
        subtitle:
            'شارك صورة لمنتجك بعد استلام طلبك، وقد تظهر هنا بعد مراجعتها.',
        artwork: 'assets/art/opt/a-i4.png',
        actionLabel: isLoggedIn ? 'شارك تجربتك' : null,
        onAction: isLoggedIn
            ? () => context.router.push(const OrdersRoute())
            : null,
      );
    }

    // عمودان بارتفاعات متفاوتة — تركيبة المعرض في مصدر التصميم.
    final left = <int>[];
    final right = <int>[];
    for (var i = 0; i < _photos.length; i++) {
      (i.isEven ? left : right).add(i);
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 104),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: _buildColumn(left)),
            const SizedBox(width: 12),
            Expanded(child: _buildColumn(right, topOffset: 22)),
          ],
        ),
      ),
    );
  }

  Widget _buildColumn(List<int> indexes, {double topOffset = 0}) {
    return Padding(
      padding: EdgeInsets.only(top: topOffset),
      child: Column(
        children: [
          for (final index in indexes) ...[
            _PhotoTile(
              review: _photos[index],
              // ارتفاعات متناوبة تعطي إيقاع المعرض بدل شبكة صمّاء.
              height: [190.0, 150.0, 220.0, 170.0][index % 4],
              onTap: () => _openViewer(index),
            ),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }

  void _openViewer(int index) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) =>
            CustomerPhotoViewer(photos: _photos, initialIndex: index),
      ),
    );
  }
}

/// لافتتا حالة صور العميل — «قيد المراجعة» و«لم يتم قبول الصورة».
///
/// تظهران بين ترويسة المجتمع والمعرض تماماً كما في المصدر، وتقرآن من
/// تقييمات العميل نفسه لا من المعرض العام.
class _MyPhotoStatusBanners extends StatelessWidget {
  const _MyPhotoStatusBanners();

  @override
  Widget build(BuildContext context) {
    final isLoggedIn = context.select<AuthCubit, bool>(
      (cubit) => cubit.state is AuthAuthenticated,
    );
    if (!isLoggedIn) return const SizedBox.shrink();

    return BlocBuilder<ReviewsCubit, ReviewsState>(
      builder: (context, state) {
        final pending = state.reviews
            .where((r) => r.status == ReviewStatus.pending && r.hasPhoto)
            .firstOrNull;
        final rejected = state.reviews
            .where((r) => r.status == ReviewStatus.rejected)
            .firstOrNull;
        if (pending == null && rejected == null) {
          return const SizedBox.shrink();
        }

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (pending != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
                child: _StatusBanner(
                  tone: context.themeColors.warning,
                  glyph: '◔',
                  title: 'صورتك قيد المراجعة',
                  body: 'راح تظهر بالمجتمع وبصفحة المنتج بعد الموافقة.',
                ),
              ),
            if (rejected != null)
              Padding(
                padding: EdgeInsets.fromLTRB(18, pending == null ? 14 : 11, 18, 0),
                child: _StatusBanner(
                  tone: context.themeColors.error,
                  glyph: '!',
                  title: 'لم يتم قبول الصورة',
                  titleTinted: true,
                  body: rejected.rejectionReason?.trim().isNotEmpty == true
                      ? rejected.rejectionReason!
                      : 'الصورة لا تظهر المنتج بوضوح.',
                  actionLabel: 'تعديل وإعادة الإرسال',
                  onTap: () => context.router.push(
                    WriteReviewRoute(
                      orderId: rejected.orderId,
                      productId: rejected.productId,
                      productName: rejected.productName,
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// لافتة حالة واحدة — أيقونة مربّعة ملوّنة، عنوان وسطر شرح، وإجراء اختياري.
class _StatusBanner extends StatelessWidget {
  const _StatusBanner({
    required this.tone,
    required this.glyph,
    required this.title,
    required this.body,
    this.titleTinted = false,
    this.actionLabel,
    this.onTap,
  });

  final Color tone;
  final String glyph;
  final String title;
  final String body;
  final bool titleTinted;
  final String? actionLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
        decoration: BoxDecoration(
          color: Color.alphaBlend(
            tone.withValues(alpha: 0.09),
            theme.colorScheme.surface,
          ),
          border: Border.all(color: tone.withValues(alpha: 0.26)),
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: tone.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                glyph,
                style: TextStyle(fontSize: 14, height: 1, color: tone),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontSize: 12.5,
                      fontWeight: AppDimens.weightBold,
                      color: titleTinted ? tone : theme.colorScheme.onSurface,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    body,
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontSize: 11.5,
                      height: 1.6,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            if (actionLabel != null) ...[
              const SizedBox(width: 10),
              Text(
                actionLabel!,
                style: theme.textTheme.labelSmall?.copyWith(
                  fontSize: 11.5,
                  fontWeight: AppDimens.weightBold,
                  color: AppColors.secondary,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// شريحة فلترة واحدة — ممتلئة بتدرّج الهوية عند الاختيار.
class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? AppColors.secondary : theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(AppDimens.radiusFull),
          border: Border.all(
            color: selected
                ? Colors.transparent
                : theme.colorScheme.outlineVariant,
          ),
        ),
        child: Text(
          label,
          style: theme.textTheme.labelMedium?.copyWith(
            fontSize: 12.5,
            fontWeight: selected
                ? AppDimens.weightBold
                : AppDimens.weightSemiBold,
            color: selected ? Colors.white : theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

/// هيكل تحميل المعرض — عمودان من مستطيلات متلألئة.
class _CommunitySkeleton extends StatelessWidget {
  const _CommunitySkeleton();

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 104),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              children: const [
                OtakuSkeleton.box(height: 190, radius: 22),
                SizedBox(height: 12),
                OtakuSkeleton.box(height: 220, radius: 22),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 22),
              child: Column(
                children: const [
                  OtakuSkeleton.box(height: 150, radius: 22),
                  SizedBox(height: 12),
                  OtakuSkeleton.box(height: 170, radius: 22),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// بلاطة صورة عميل — فتحة صورة محايدة بارتفاع متغيّر.
class _PhotoTile extends StatelessWidget {
  const _PhotoTile({
    required this.review,
    required this.height,
    required this.onTap,
  });

  final Review review;
  final double height;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(22),
      child: Container(
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: theme.colorScheme.outlineVariant),
          boxShadow: colors.shadowXSoft,
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            CustomerPhoto(url: review.photoUrl, iconSize: 28),
            // اسم المنتج على تدرّج داكن أسفل البلاطة.
            PositionedDirectional(
              start: 0,
              end: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.fromLTRB(12, 18, 12, 10),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.62),
                      Colors.black.withValues(alpha: 0),
                    ],
                  ),
                ),
                child: Text(
                  review.productName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontSize: 11.5,
                    fontWeight: AppDimens.weightBold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// عارض صور العملاء بملء الشاشة — تمرير أفقي وانتقال لصفحة المنتج.
class CustomerPhotoViewer extends StatefulWidget {
  const CustomerPhotoViewer({
    super.key,
    required this.photos,
    this.initialIndex = 0,
  });

  final List<Review> photos;
  final int initialIndex;

  @override
  State<CustomerPhotoViewer> createState() => _CustomerPhotoViewerState();
}

class _CustomerPhotoViewerState extends State<CustomerPhotoViewer> {
  late final PageController _controller;
  late int _index;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
    _controller = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final current = widget.photos[_index];

    return Scaffold(
      backgroundColor: const Color(0xFF08050F),
      body: SafeArea(
        child: Column(
          children: [
            // صفّ علوي بزرّ إغلاق زجاجي وعدّاد — بدل شريط تطبيق مادي.
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
              child: Row(
                children: [
                  InkWell(
                    onTap: () => Navigator.of(context).pop(),
                    borderRadius: BorderRadius.circular(13),
                    child: Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.13),
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: const Icon(
                        Icons.close_rounded,
                        size: 18,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const Spacer(),
                  Text(
                    '${_index + 1} / ${widget.photos.length}',
                    textDirection: TextDirection.ltr,
                    style: theme.textTheme.labelLarge?.copyWith(
                      fontSize: 12.5,
                      fontWeight: AppDimens.weightBold,
                      color: Colors.white.withValues(alpha: 0.8),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: widget.photos.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (context, index) {
                  final photo = widget.photos[index];
                  return InteractiveViewer(
                    minScale: 1,
                    maxScale: 4,
                    child: Center(
                      child: photo.hasPhoto
                          ? Image.network(
                              photo.photoUrl!,
                              fit: BoxFit.contain,
                              loadingBuilder: (context, child, progress) =>
                                  progress == null
                                  ? child
                                  : const SizedBox(
                                      width: 34,
                                      height: 34,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2.5,
                                        color: Colors.white,
                                      ),
                                    ),
                              errorBuilder: (_, _, _) => Icon(
                                Icons.image_not_supported_outlined,
                                size: 90,
                                color: Colors.white.withValues(alpha: 0.45),
                              ),
                            )
                          : Icon(
                              Icons.image_not_supported_outlined,
                              size: 90,
                              color: Colors.white.withValues(alpha: 0.45),
                            ),
                    ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    current.productName,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontFamily: 'Tajawal',
                      fontWeight: AppDimens.weightExtraBold,
                      fontSize: 16,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    current.comment,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontSize: 12.5,
                      height: 1.7,
                      color: Colors.white.withValues(alpha: 0.8),
                    ),
                  ),
                  const SizedBox(height: 16),
                  AnimePrimaryButton(
                    label: 'عرض المنتج',
                    onPressed: () => context.router.push(
                      ProductDetailRoute(productId: current.productId),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
