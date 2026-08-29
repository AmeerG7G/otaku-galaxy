import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../orders/domain/entities/order.dart';
import '../../domain/entities/review.dart';
import '../cubit/reviews_cubit.dart';
import '../widgets/review_status_chip.dart';

/// «قيّم منتجات طلبك» بتصميم Otaku Galaxy v2.
///
/// ترويسة برسم باهت وسطر وصفي، ثم بطاقة لكل منتج فيها فتحة صورة محايدة
/// وحالة التقييم وزرّ إجراء عريض داخل البطاقة — لا بطاقات مادية ولا صفوف.
@RoutePage()
class RateOrderScreen extends StatefulWidget {
  const RateOrderScreen({super.key, required this.order});

  final Order order;

  @override
  State<RateOrderScreen> createState() => _RateOrderScreenState();
}

class _RateOrderScreenState extends State<RateOrderScreen> {
  Map<String, Review> _byProduct = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final cubit = context.read<ReviewsCubit>();
    final map = <String, Review>{};
    for (final item in widget.order.items) {
      final review = await cubit.reviewFor(
        orderId: widget.order.id,
        productId: item.product.id,
      );
      if (review != null) map[item.product.id] = review;
    }
    if (!mounted) return;
    setState(() {
      _byProduct = map;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: Column(
        children: [
          OtakuScreenHeader(
            title: '⭐ قيّم منتجات طلبك',
            subtitle: 'رأيك يساعد بقية العملاء يختارون بثقة',
            artwork: 'assets/art/opt/a-i6.png',
            onBack: () => context.router.maybePop(),
          ),
          Expanded(
            child: _loading
                ? const OtakuListSkeleton(count: 3, height: 140)
                : ListView(
                    padding: const EdgeInsets.fromLTRB(18, 12, 18, 26),
                    children: [
                      for (final item in widget.order.items) ...[
                        _ProductReviewCard(
                          product: item.product,
                          review: _byProduct[item.product.id],
                          onTap: () async {
                            final done = await context.router.push<bool>(
                              WriteReviewRoute(
                                orderId: widget.order.id,
                                productId: item.product.id,
                                productName: item.product.name,
                              ),
                            );
                            if (done == true) _load();
                          },
                        ),
                        const SizedBox(height: 12),
                      ],
                      const SizedBox(height: 4),
                      Text(
                        'تكدر تقيّم كل منتج مرة وحدة. التقييم يُراجع قبل نشره.',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontSize: 11.5,
                          height: 1.7,
                          color: theme.colorScheme.outline,
                        ),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

/// بطاقة تقييم منتج — فتحة صورة، الاسم، الحالة، ثم إجراء عريض.
class _ProductReviewCard extends StatelessWidget {
  const _ProductReviewCard({
    required this.product,
    required this.review,
    required this.onTap,
  });

  final dynamic product;
  final Review? review;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // التقييم المعتمد أو قيد المراجعة لا يُفتح للتعديل — المرفوض فقط يُعدَّل.
    final canEdit = review == null || review!.status == ReviewStatus.rejected;
    final images = product.images as List<String>;

    return OtakuPanel(
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                  border: Border.all(color: theme.colorScheme.outlineVariant),
                ),
                clipBehavior: Clip.antiAlias,
                child: ProductPhotoSlot(
                  imageUrl: images.isNotEmpty ? images.first : null,
                  showLabel: false,
                  iconSize: 22,
                ),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      product.name as String,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontSize: 13.5,
                        height: 1.5,
                        fontWeight: AppDimens.weightSemiBold,
                      ),
                    ),
                    const SizedBox(height: 7),
                    if (review == null)
                      OtakuStatusPill(
                        label: 'لم يُقيَّم بعد',
                        color: theme.colorScheme.outline,
                        showDot: false,
                      )
                    else
                      ReviewStatusChip(status: review!.status),
                    if (review != null && review!.rating > 0) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          for (var i = 1; i <= 5; i++)
                            Icon(
                              i <= review!.rating
                                  ? Icons.star_rounded
                                  : Icons.star_border_rounded,
                              size: 15,
                              color: i <= review!.rating
                                  ? AppColors.accent
                                  : theme.colorScheme.outlineVariant,
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (canEdit)
            AnimePrimaryButton(
              label: review == null ? 'قيّم المنتج' : 'عدّل وأعد الإرسال',
              onPressed: onTap,
              height: AppDimens.buttonHeightMd,
            )
          else
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 13),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                border: Border.all(color: theme.colorScheme.outlineVariant),
              ),
              child: Text(
                review!.status == ReviewStatus.approved
                    ? 'تقييمك منشور — شكراً 💜'
                    : 'تقييمك قيد المراجعة',
                style: theme.textTheme.labelLarge?.copyWith(
                  fontSize: 13,
                  fontWeight: AppDimens.weightBold,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
