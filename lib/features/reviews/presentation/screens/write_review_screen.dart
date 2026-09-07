import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/gender.dart';
import '../../../../core/router/app_router.dart';
import '../../domain/entities/review.dart';
import '../cubit/reviews_cubit.dart';
import '../widgets/star_rating.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/constants/api_endpoints.dart';
import 'package:image_picker/image_picker.dart';
import '../../../visuals/domain/visual_slot.dart';

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
  /// أقصى عدد صور للتقييم الواحد.
  ///
  /// [CRITICAL] نسخةٌ للتجربة لا للأمان. الحارس الحقيقي في الخادم
  /// (`galaxyPoints.MAX_REVIEW_PHOTOS`) وفي قيد القاعدة؛ من يستدعي الـAPI
  /// مباشرةً لا يمرّ بهذه الشاشة أصلاً. وجودها هنا يمنع رحلةً تنتهي برفض.
  static const _maxPhotos = 5;

  final _commentController = TextEditingController();
  int _rating = 0;
  final List<String> _photoUrls = [];
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
        _photoUrls
          ..clear()
          ..addAll(existing.photoUrls);
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
          photoUrls: List.unmodifiable(_photoUrls),
        );
      } else {
        await cubit.submit(
          orderId: widget.orderId,
          productId: widget.productId,
          productName: widget.productName,
          rating: _rating,
          comment: _commentController.text.trim(),
          photoUrls: List.unmodifiable(_photoUrls),
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
          // شاشة التأكيد تعرض صورة واحدة؛ الأولى تمثّل الباقي.
          photoUrl: _photoUrls.isEmpty ? null : _photoUrls.first,
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
          return 'سبق أن قيّمت هذا المنتج.';
        case 'TOO_MANY_PHOTOS':
          return 'الحد الأقصى $_maxPhotos صور للتقييم الواحد.';
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
  ///
  /// إرفاق صورة (واحدة أو خمس) يمنح خمس نقاط مقطوعة — لا خمساً لكل صورة.
  Future<void> _attachPhoto() async {
    if (_photoUrls.length >= _maxPhotos) {
      _snack('الحد الأقصى $_maxPhotos صور للتقييم الواحد');
      return;
    }

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
      final url = (data as Map<String, dynamic>)['url'] as String?;
      if (url == null || url.trim().isEmpty) {
        _snack('تعذّر رفع الصورة، حاول مرة أخرى');
        return;
      }
      setState(() {
        // السباق ممكن: رفعان متزامنان قد ينتهيان معاً بعد بلوغ السقف.
        if (_photoUrls.length < _maxPhotos) _photoUrls.add(url);
      });
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
      // عمودٌ موسَّط بعرض القراءة على اللوح — القائمة الممتدّة بعرض
      // ١٣٦٦ بكسل تصير صفوفاً فارغة الوسط. لا أثر له على الهاتف.
      body: ResponsiveContentFrame(
        maxWidth: kReadingMaxWidth,
        child: Column(
          children: [
            OtakuScreenHeader(
              title: _isEditingRejected
                  ? 'تعديل التقييم'
                  : context.g(GenderedStrings.rateProduct),
              subtitle: widget.productName,
              artwork: 'assets/art/opt/a-i6.png',
              artworkSlot: VisualSlots.writeReview,
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
                          'ما رأيك في المنتج؟',
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(fontWeight: AppDimens.weightBold),
                        ),
                        SizedBox(height: AppDimens.space3),
                        AnimeTextField(
                          controller: _commentController,
                          label: '',
                          hint: context.g(GenderedStrings.writeYourOpinion),
                          maxLines: 5,
                        ),
                        SizedBox(height: AppDimens.space6),
                        Text(
                          '📸 ${context.g(GenderedStrings.addPhotos)}',
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(fontWeight: AppDimens.weightBold),
                        ),
                        SizedBox(height: AppDimens.space2),
                        Text(
                          'اختياري — إرفاق الصور يمنحك $_maxPhotos نقاط '
                          'إضافية، سواء أرفقت صورة واحدة أو $_maxPhotos.',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                                height: AppDimens.lineHeightRelaxed,
                              ),
                        ),
                        SizedBox(height: AppDimens.space3),
                        _PhotoPicker(
                          photoUrls: _photoUrls,
                          maxPhotos: _maxPhotos,
                          uploading: _uploadingPhoto,
                          onAdd: _attachPhoto,
                          onRemove: (index) =>
                              setState(() => _photoUrls.removeAt(index)),
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
                          'لكل منتج تقييم واحد، ويُنشر بعد المراجعة.',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                        ),
                        SizedBox(height: AppDimens.space6),
                      ],
                    ),
            ),
          ],
        ),
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
              color: colors.errorText,
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

/// شبكة صور التقييم — إضافة وإزالة حتى السقف.
///
/// المصغّرات مربّعة بحجم ثابت وتلتفّ في `Wrap`، فتعمل على الهاتف الصغير
/// واللوح بلا تخطيط منفصل لكلٍّ منهما. زرّ الإضافة يختفي عند بلوغ السقف بدل
/// أن يبقى معطَّلاً يوحي بإمكان المزيد.
class _PhotoPicker extends StatelessWidget {
  const _PhotoPicker({
    required this.photoUrls,
    required this.maxPhotos,
    required this.uploading,
    required this.onAdd,
    required this.onRemove,
  });

  final List<String> photoUrls;
  final int maxPhotos;
  final bool uploading;
  final VoidCallback onAdd;
  final ValueChanged<int> onRemove;

  static const double _tile = 78;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final full = photoUrls.length >= maxPhotos;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: AppDimens.space3,
          runSpacing: AppDimens.space3,
          children: [
            for (var i = 0; i < photoUrls.length; i++)
              _Thumb(
                url: photoUrls[i],
                size: _tile,
                onRemove: () => onRemove(i),
              ),
            if (!full)
              Semantics(
                button: true,
                label: 'إضافة صورة',
                child: InkWell(
                  onTap: uploading ? null : onAdd,
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  child: Container(
                    width: _tile,
                    height: _tile,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                      border: Border.all(color: theme.colorScheme.outlineVariant),
                    ),
                    child: uploading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(
                            Icons.add_a_photo_outlined,
                            size: AppDimens.iconMd,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                  ),
                ),
              ),
          ],
        ),
        SizedBox(height: AppDimens.space2),
        Text(
          full
              ? 'وصلت إلى الحد الأقصى ($maxPhotos صور).'
              : '${photoUrls.length} من $maxPhotos',
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

/// مصغّرة صورة واحدة مع زرّ إزالتها.
class _Thumb extends StatelessWidget {
  const _Thumb({required this.url, required this.size, required this.onRemove});

  final String url;
  final double size;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        children: [
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppDimens.radiusMd),
              child: CustomerPhoto(url: url),
            ),
          ),
          PositionedDirectional(
            top: 2,
            end: 2,
            child: Semantics(
              button: true,
              label: 'إزالة الصورة',
              child: InkWell(
                onTap: onRemove,
                customBorder: const CircleBorder(),
                child: Container(
                  width: 22,
                  height: 22,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.close_rounded,
                    size: 14,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
