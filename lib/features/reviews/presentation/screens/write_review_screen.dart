import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../domain/entities/review.dart';
import '../cubit/reviews_cubit.dart';
import '../widgets/star_rating.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/constants/api_endpoints.dart';
import 'package:image_picker/image_picker.dart';

/// كتابة تقييم جديد أو تعديل تقييم مرفوض وإعادة إرساله.
///
/// عند التعديل تُملأ الشاشة بمحتوى التقييم السابق (النجوم، التعليق، الصورة)
/// فيعدّل العميل بدل أن يبدأ من الصفر.
@RoutePage()
class WriteReviewScreen extends StatefulWidget {
  const WriteReviewScreen({
    super.key,
    required this.orderId,
    required this.productId,
    required this.productName,
  });

  final String orderId;
  final String productId;
  final String productName;

  @override
  State<WriteReviewScreen> createState() => _WriteReviewScreenState();
}

class _WriteReviewScreenState extends State<WriteReviewScreen> {
  final _commentController = TextEditingController();
  int _rating = 0;
  String? _photoUrl;
  bool _uploadingPhoto = false;
  bool _submitting = false;
  bool _loading = true;
  Review? _existing;

  @override
  void initState() {
    super.initState();
    _loadExisting();
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _loadExisting() async {
    final existing = await context.read<ReviewsCubit>().reviewFor(
      orderId: widget.orderId,
      productId: widget.productId,
    );
    if (!mounted) return;
    setState(() {
      _existing = existing;
      if (existing != null) {
        _rating = existing.rating;
        _commentController.text = existing.comment;
        _photoUrl = existing.photoUrl;
      }
      _loading = false;
    });
  }

  bool get _isEditingRejected =>
      _existing != null && _existing!.status == ReviewStatus.rejected;

  Future<void> _submit() async {
    if (_rating == 0) {
      _snack('يرجى اختيار تقييم بالنجوم');
      return;
    }
    if (_commentController.text.trim().isEmpty) {
      _snack('يرجى كتابة رأيك بالمنتج');
      return;
    }
    setState(() => _submitting = true);
    try {
      final cubit = context.read<ReviewsCubit>();
      if (_isEditingRejected) {
        await cubit.resubmit(
          _existing!.id,
          rating: _rating,
          comment: _commentController.text.trim(),
          photoUrl: _photoUrl,
        );
      } else {
        await cubit.submit(
          orderId: widget.orderId,
          productId: widget.productId,
          productName: widget.productName,
          rating: _rating,
          comment: _commentController.text.trim(),
          photoUrl: _photoUrl,
        );
      }
      if (!mounted) return;
      // نستبدل شاشة الكتابة بتأكيد «بانتظار المراجعة» كما في المصدر، فلا
      // يعود المستخدم لنموذج أرسله فعلاً عند الرجوع.
      await context.router.replace(
        ReviewSubmittedRoute(
          productName: widget.productName,
          rating: _rating,
          comment: _commentController.text.trim(),
          photoUrl: _photoUrl,
        ),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _submitting = false);
      // رسالة الخادم أدقّ من أي نص عام: «التقييم يُفتح بعد يوم»، «سبق أن
      // قيّمت هذا المنتج»، «صورة غير صالحة» — إخفاؤها خلف «حاول مرة أخرى»
      // يترك العميل يعيد المحاولة بلا فائدة.
      _snack(_submitErrorOf(error));
    }
  }

  /// نص الخطأ المعروض — من الخادم متى أرسل واحداً.
  String _submitErrorOf(Object error) {
    if (error is AppException) {
      switch (error.code) {
        case 'RATING_NOT_YET_AVAILABLE':
          // نص الخادم يحمل السبب الدقيق؛ لا نستبدله بمدّة ثابتة.
          return error.message;
        case 'INVALID_PHOTO_URL':
          return 'صورة التقييم غير صالحة — أعد رفعها.';
        case 'REVIEW_EXISTS':
          return 'سبق أن قيّمت هذا المنتج في هذا الطلب.';
        case 'ORDER_NOT_COMPLETED':
          return 'لا يمكن تقييم منتجات طلب لم يُستلم بعد.';
        default:
          return error.message;
      }
    }
    return 'تعذر إرسال التقييم، حاول مرة أخرى';
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
          margin: EdgeInsets.all(AppDimens.screenHorizontalPadding),
        ),
      );
  }

  /// يختار صورة من المعرض ويرفعها للخادم، ثم يحتفظ برابطها الحقيقي.
  /// التقييم المصوّر يمنح نقاطاً أكثر عند اعتماده.
  Future<void> _attachPhoto() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;

    setState(() => _uploadingPhoto = true);
    try {
      final data = await sl<ApiClient>().uploadFile(
        ApiEndpoints.uploads,
        filePath: picked.path,
        purpose: 'review',
      );
      if (!mounted) return;
      setState(() => _photoUrl = (data as Map<String, dynamic>)['url'] as String?);
      _snack('تمت إضافة الصورة');
    } catch (e) {
      if (!mounted) return;
      _snack(
        e is AppException && e.message.trim().isNotEmpty
            ? e.message
            : 'تعذّر رفع الصورة، حاول مرة أخرى',
      );
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          OtakuScreenHeader(
            title: _isEditingRejected ? 'تعديل التقييم' : 'قيّم المنتج',
            subtitle: widget.productName,
            artwork: 'assets/art/opt/a-i6.png',
            onBack: () => context.router.maybePop(),
          ),
          Expanded(
            child: _loading
                ? const OtakuListSkeleton(count: 3, height: 110)
                : ListView(
                    padding: const EdgeInsets.fromLTRB(18, 12, 18, 26),
                    children: [
                      if (_isEditingRejected) ...[
                        _RejectedBanner(reason: _existing!.rejectionReason),
                        SizedBox(height: AppDimens.space5),
                      ],
                      Center(
                        child: StarRating(
                          rating: _rating,
                          size: AppDimens.icon2xl,
                          onChanged: (v) => setState(() => _rating = v),
                        ),
                      ),
                      SizedBox(height: AppDimens.space7),
                      Text(
                        'شنو رأيك بالمنتج؟',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: AppDimens.weightBold,
                        ),
                      ),
                      SizedBox(height: AppDimens.space3),
                      AnimeTextField(
                        controller: _commentController,
                        label: '',
                        hint: 'اكتب رأيك بالمنتج… الجودة، الحجم، سرعة التوصيل.',
                        maxLines: 5,
                      ),
                      SizedBox(height: AppDimens.space6),
                      Text(
                        '📸 أضف صورة للمنتج',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: AppDimens.weightBold,
                        ),
                      ),
                      SizedBox(height: AppDimens.space2),
                      Text(
                        'اختياري — التقييم المصوّر يعطيك ٥ نقاط مجرّة بدل نقطة واحدة.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                          height: AppDimens.lineHeightRelaxed,
                        ),
                      ),
                      SizedBox(height: AppDimens.space3),
                      if (_photoUrl == null)
                        AnimeOutlinedButton(
                          label: _uploadingPhoto ? 'جاري الرفع…' : 'إضافة صورة',
                          onPressed: _uploadingPhoto ? null : _attachPhoto,
                          icon: Icons.add_a_photo_outlined,
                          iconPosition: IconPosition.start,
                        )
                      else
                        _AttachedPhotoRow(
                          onRemove: () => setState(() => _photoUrl = null),
                        ),
                      SizedBox(height: AppDimens.space9),
                      AnimePrimaryButton(
                        label: _isEditingRejected
                            ? 'إعادة الإرسال'
                            : 'إرسال التقييم',
                        onPressed: _submit,
                        loading: _submitting,
                        height: AppDimens.buttonHeightXl,
                      ),
                      SizedBox(height: AppDimens.space3),
                      Text(
                        'تقييم واحد لكل منتج بكل طلب. يُنشر بعد مراجعة الإدارة.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                      SizedBox(height: AppDimens.space6),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _RejectedBanner extends StatelessWidget {
  const _RejectedBanner({this.reason});

  final String? reason;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(AppDimens.space4),
      decoration: BoxDecoration(
        color: colors.errorPale,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: colors.error.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '❌ لم يتم قبول تقييمك',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: AppDimens.weightBold,
              color: colors.error,
            ),
          ),
          if (reason != null && reason!.trim().isNotEmpty) ...[
            SizedBox(height: AppDimens.space2),
            Text(
              'السبب: $reason',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurface,
                height: AppDimens.lineHeightRelaxed,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AttachedPhotoRow extends StatelessWidget {
  const _AttachedPhotoRow({required this.onRemove});

  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(AppDimens.radiusMd),
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
          ),
          child: Icon(
            Icons.image_outlined,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        SizedBox(width: AppDimens.space3),
        Expanded(
          child: Text(
            'تمت إضافة الصورة',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              fontWeight: AppDimens.weightSemiBold,
              color: colors.success,
            ),
          ),
        ),
        TextButton(onPressed: onRemove, child: const Text('إزالة')),
      ],
    );
  }
}
