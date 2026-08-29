import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../widgets/star_rating.dart';

/// تأكيد إرسال التقييم — «بانتظار المراجعة».
///
/// تطابق كتلة «REVIEW SUBMITTED (PENDING)» في مصدر التصميم: هالة ذهبية،
/// رسم شخصية في الوسط، كبسولة حالة ذهبية، سطر شرح، ثم معاينة التقييم
/// المرسَل داخل سطح عائم.
@RoutePage()
class ReviewSubmittedScreen extends StatelessWidget {
  const ReviewSubmittedScreen({
    super.key,
    required this.productName,
    required this.rating,
    required this.comment,
    this.photoUrl,
  });

  final String productName;
  final int rating;
  final String comment;
  final String? photoUrl;

  bool get _hasPhoto => photoUrl != null && photoUrl!.trim().isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Scaffold(
      body: Stack(
        children: [
          // هالة ذهبية أعلى الجهة اليمنى الفيزيائية.
          PositionedDirectional(
            top: -80,
            start: -70,
            child: IgnorePointer(
              child: Container(
                width: 260,
                height: 260,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      colors.warning.withValues(alpha: 0.22),
                      colors.warning.withValues(alpha: 0),
                    ],
                    stops: const [0, 0.68],
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(22, 34, 22, 12),
                    child: Column(
                      children: [
                        Image.asset(
                          'assets/art/opt/a-i4.png',
                          width: 172,
                          fit: BoxFit.contain,
                        ),
                        const SizedBox(height: 8),
                        OtakuStatusPill(
                          label: 'بانتظار المراجعة',
                          color: colors.warning,
                          fontSize: 12.5,
                        ),
                        const SizedBox(height: 14),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 270),
                          child: Text(
                            'سيتم مراجعة تقييمك قبل نشره.',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontSize: 14,
                              height: 1.9,
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                        const SizedBox(height: 22),
                        _ReviewPreviewCard(
                          productName: productName,
                          rating: rating,
                          comment: comment,
                          hasPhoto: _hasPhoto,
                          photoUrl: photoUrl,
                        ),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(22, 12, 22, 24),
                  child: Column(
                    children: [
                      AnimePrimaryButton(
                        label: 'متابعة تقييم المنتجات',
                        height: AppDimens.buttonHeightXl,
                        // `true` تُعيد تحميل قائمة التقييم التي دفعتنا هنا.
                        onPressed: () => context.router.maybePop(true),
                      ),
                      const SizedBox(height: 10),
                      AnimeTextButton(
                        label: 'طلباتي',
                        // `navigate` تعيد استخدام «طلباتي» إن كانت في المكدّس
                        // بدل تكديس نسخة ثانية منها.
                        onPressed: () =>
                            context.router.navigate(const OrdersRoute()),
                      ),
                    ],
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

/// معاينة التقييم المرسَل — صورة مصغّرة إن وُجدت، ثم الاسم والنجوم والنص.
class _ReviewPreviewCard extends StatelessWidget {
  const _ReviewPreviewCard({
    required this.productName,
    required this.rating,
    required this.comment,
    required this.hasPhoto,
    required this.photoUrl,
  });

  final String productName;
  final int rating;
  final String comment;
  final bool hasPhoto;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border.all(color: theme.colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        boxShadow: context.themeColors.shadowXSoft,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasPhoto) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(15),
              child: SizedBox(
                width: 64,
                height: 64,
                child: ProductPhotoSlot(imageUrl: photoUrl),
              ),
            ),
            const SizedBox(width: 13),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  productName,
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontSize: 13,
                    height: 1.5,
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
                const SizedBox(height: 6),
                StarRating(rating: rating, size: 13),
                if (comment.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    comment,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontSize: 12.5,
                      height: 1.7,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
