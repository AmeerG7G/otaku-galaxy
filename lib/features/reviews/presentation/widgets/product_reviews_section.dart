import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../community/presentation/screens/community_screen.dart';
import '../../domain/entities/review.dart';
import '../../domain/repositories/review_repository.dart';
import 'star_rating.dart';

/// قسم تقييمات العملاء وصورهم داخل تفاصيل المنتج.
///
/// يقرأ التقييمات المعتمدة فقط من الخادم عبر [ReviewRepository]؛ التقييم
/// لا يظهر هنا قبل نشره من لوحة التحكم.
class ProductReviewsSection extends StatefulWidget {
  const ProductReviewsSection({super.key, required this.productId});

  final String productId;

  @override
  State<ProductReviewsSection> createState() => _ProductReviewsSectionState();
}

class _ProductReviewsSectionState extends State<ProductReviewsSection> {
  List<Review> _reviews = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final reviews = await context
        .read<ReviewRepository>()
        .fetchApprovedReviewsForProduct(widget.productId);
    if (!mounted) return;
    setState(() {
      _reviews = reviews;
      _loading = false;
    });
  }

  double get _average {
    if (_reviews.isEmpty) return 0;
    final total = _reviews.fold<int>(0, (sum, r) => sum + r.rating);
    return total / _reviews.length;
  }

  List<Review> get _withPhotos => _reviews.where((r) => r.hasPhoto).toList();

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const OtakuListSkeleton(
        count: 2,
        height: 96,
        padding: EdgeInsets.zero,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '⭐ تقييمات العملاء',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontFamily: 'Tajawal',
            fontSize: 16.5,
            fontWeight: AppDimens.weightExtraBold,
          ),
        ),
        SizedBox(height: AppDimens.space4),
        if (_reviews.isEmpty)
          _EmptyReviews()
        else ...[
          _RatingSummary(average: _average, count: _reviews.length),
          if (_withPhotos.isNotEmpty) ...[
            SizedBox(height: AppDimens.space6),
            Text(
              '📸 صور العملاء',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: AppDimens.weightBold,
              ),
            ),
            SizedBox(height: AppDimens.space3),
            SizedBox(
              height: 88,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _withPhotos.length,
                separatorBuilder: (_, _) => SizedBox(width: AppDimens.space3),
                itemBuilder: (context, index) => _PhotoThumb(
                  photoUrl: _withPhotos[index].photoUrl,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => CustomerPhotoViewer(
                        photos: _withPhotos,
                        initialIndex: index,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
          SizedBox(height: AppDimens.space6),
          for (final review in _reviews)
            Padding(
              padding: EdgeInsets.only(bottom: AppDimens.space3),
              child: _ReviewCard(review: review),
            ),
        ],
      ],
    );
  }
}

class _RatingSummary extends StatelessWidget {
  const _RatingSummary({required this.average, required this.count});

  final double average;
  final int count;

  @override
  Widget build(BuildContext context) {
    return OtakuPanel(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Column(
            children: [
              Text(
                average.toStringAsFixed(1),
                textDirection: TextDirection.ltr,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontFamily: 'Tajawal',
                  fontSize: 32,
                  height: 1,
                  fontWeight: AppDimens.weightBlack,
                ),
              ),
              const SizedBox(height: 6),
              StarRating(rating: average.round(), size: AppDimens.iconSm),
            ],
          ),
          const SizedBox(width: 18),
          Expanded(
            child: Text(
              '$count تقييم من عملاء اشتروا هذا المنتج',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                height: AppDimens.lineHeightRelaxed,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PhotoThumb extends StatelessWidget {
  const _PhotoThumb({required this.photoUrl, required this.onTap});

  final String? photoUrl;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        width: 88,
        height: 88,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: CustomerPhoto(url: photoUrl),
      ),
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review});

  final Review review;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return OtakuPanel(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  // لا تُعرض بيانات خاصة إطلاقاً (هاتف/عنوان/رقم طلب) —
                  // الاسم الظاهر فقط.
                  review.customerName,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
              ),
              Container(
                padding: EdgeInsets.symmetric(
                  horizontal: AppDimens.space3,
                  vertical: AppDimens.space1,
                ),
                decoration: BoxDecoration(
                  color: colors.successPale,
                  borderRadius: BorderRadius.circular(AppDimens.radiusFull),
                ),
                child: Text(
                  '✓ اشترى هذا المنتج',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: colors.success,
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: AppDimens.space2),
          StarRating(rating: review.rating, size: AppDimens.iconSm),
          SizedBox(height: AppDimens.space3),
          Text(
            review.comment,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              height: AppDimens.lineHeightRelaxed,
            ),
          ),
          // صورة العميل المرفقة بالتقييم — حقيقية أو مؤشّر محايد.
          if (review.hasPhoto) ...[
            SizedBox(height: AppDimens.space3),
            ClipRRect(
              borderRadius: BorderRadius.circular(AppDimens.radiusSm),
              child: SizedBox(
                width: 96,
                height: 96,
                child: CustomerPhoto(url: review.photoUrl, iconSize: 26),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// حالة «لا تقييمات» — لوحة تحريرية برسم شخصية، لا صندوق نصّي رمادي.
class _EmptyReviews extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return const OtakuEditorialPanel(
      title: 'ما بيه تقييمات لهذا المنتج',
      body: 'كون أول واحد يشارك تجربته بعد استلام طلبه.',
      artwork: 'assets/art/opt/a-i1.png',
      margin: EdgeInsets.zero,
      minHeight: 150,
      artHeight: 120,
      contentWidthFactor: 0.7,
    );
  }
}
