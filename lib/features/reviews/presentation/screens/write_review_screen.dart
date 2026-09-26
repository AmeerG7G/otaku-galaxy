import 'dart:typed_data';

import 'package:auto_route/auto_route.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../../../core/network/media_url.dart';
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

  /// مراجع الصور **كما يخزّنها الخادم** (`/uploads/…`) — هي ما يُرسَل.
  ///
  /// [CRITICAL] ليست روابط عرض. رابط العرض يُبنى بأصل هذه البيئة
  /// (`10.0.2.2` من المحاكي، `localhost` من سطح المكتب…) والخادم يرفض أي
  /// أصلٍ غير أصله؛ إرسالُ رابط العرض عند تعديل تقييمٍ مرفوض كان يُفشل
  /// إعادة الإرسال على الهاتف. للعرض تُحلّ لحظتَه بـ[resolveMediaUrl].
  final List<String> _photoRefs = [];

  /// الصورة المختارة الآن، قبل أن يردّ الخادم برابطها — تُعرض فوراً.
  ///
  /// [CRITICAL] المعاينة لا تنتظر الرفع: كان الزبون يختار صورةً فلا يرى
  /// شيئاً حتى يكتمل الرفع، ثم لا يرى شيئاً بعده أيضاً لأن المرجع النسبي
  /// كان يُمرَّر إلى `Image.network` بلا حلّ فيفشل إلى الرمز المحايد.
  Uint8List? _pendingPhotoBytes;
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
        _photoRefs
          ..clear()
          ..addAll(existing.photoRefs);
      }
      _loading = false;
    });
  }

  bool get _isEditingRejected =>
      _existing != null && _existing!.status == ReviewStatus.rejected;

  Future<void> _submit() async {
    if (_rating == 0) {
      _snack(context.strings('pickStarRating'));
      return;
    }
    if (_commentController.text.trim().isEmpty) {
      _snack(context.strings('writeYourOpinion'));
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
          photoUrls: List.unmodifiable(_photoRefs),
        );
      } else {
        await cubit.submit(
          orderId: widget.orderId,
          productId: widget.productId,
          productName: widget.productName,
          rating: _rating,
          comment: _commentController.text.trim(),
          photoUrls: List.unmodifiable(_photoRefs),
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
          photoUrl: _photoRefs.isEmpty ? null : resolveMediaUrl(_photoRefs.first),
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
          return context.strings('reviewPhotoInvalid');
        case 'REVIEW_EXISTS':
          return context.strings('alreadyReviewed');
        case 'TOO_MANY_PHOTOS':
          return context.strings.p('maxPhotosPerReviewDot', {'max': '$_maxPhotos'});
        case 'ORDER_NOT_COMPLETED':
          return context.strings('cannotReviewUnreceived');
        default:
          return error.message;
      }
    }
    return context.strings('reviewSendFailed');
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
    if (_photoRefs.length >= _maxPhotos) {
      _snack(context.strings.p('maxPhotosPerReview', {'max': '$_maxPhotos'}));
      return;
    }

    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;

    // المعاينة المحلية أولاً — قبل الرفع لا بعده.
    final bytes = await picked.readAsBytes();
    if (!mounted) return;
    setState(() {
      _pendingPhotoBytes = bytes;
      _uploadingPhoto = true;
    });
    try {
      final data = await sl<ApiClient>().uploadFile(
        ApiEndpoints.uploads,
        filePath: picked.path,
        purpose: 'review',
      );
      if (!mounted) return;
      final url = (data as Map<String, dynamic>)['url'] as String?;
      if (url == null || url.trim().isEmpty) {
        _snack(context.strings('photoUploadFailed'));
        return;
      }
      setState(() {
        // السباق ممكن: رفعان متزامنان قد ينتهيان معاً بعد بلوغ السقف.
        // ردّ الرفع مرجعٌ نسبي أصلاً — يُحفظ كما هو.
        if (_photoRefs.length < _maxPhotos) _photoRefs.add(url);
      });
      _snack(context.strings('photoAdded'));
    } catch (e) {
      if (!mounted) return;
      _snack(
        e is AppException && e.localizedMessage(context).trim().isNotEmpty
            ? e.localizedMessage(context)
            : context.strings('photoUploadFailed'),
      );
    } finally {
      if (mounted) {
        setState(() {
          _uploadingPhoto = false;
          _pendingPhotoBytes = null;
        });
      }
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
                  ? context.strings('editReview')
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
                          context.strings('whatDoYouThink'),
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
                          context.strings.p('photoBonusNote', {'max': '$_maxPhotos'}),
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
                          photoRefs: _photoRefs,
                          pendingPhotoBytes: _pendingPhotoBytes,
                          maxPhotos: _maxPhotos,
                          uploading: _uploadingPhoto,
                          onAdd: _attachPhoto,
                          onRemove: (index) =>
                              setState(() => _photoRefs.removeAt(index)),
                        ),
                        SizedBox(height: AppDimens.space9),
                        AnimePrimaryButton(
                          label: _isEditingRejected
                              ? context.strings('resend')
                              : context.strings('sendReview'),
                          onPressed: _submit,
                          loading: _submitting,
                          height: AppDimens.buttonHeightXl,
                        ),
                        SizedBox(height: AppDimens.space3),
                        Text(
                          context.strings('oneReviewPerProductPublished'),
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
            context.strings('reviewRejectedTitle'),
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: AppDimens.weightBold,
              color: colors.errorText,
            ),
          ),
          if (reason != null && reason!.trim().isNotEmpty) ...[
            SizedBox(height: AppDimens.space2),
            Text(
              context.strings.p('reviewRejectedReason', {'reason': reason!}),
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
    required this.photoRefs,
    required this.pendingPhotoBytes,
    required this.maxPhotos,
    required this.uploading,
    required this.onAdd,
    required this.onRemove,
  });

  /// مراجع الخادم — تُحلّ إلى روابط عرض داخل المصغّرة لا هنا.
  final List<String> photoRefs;

  /// الصورة قيد الرفع — تُعرض من الجهاز فوراً ريثما يردّ الخادم.
  final Uint8List? pendingPhotoBytes;
  final int maxPhotos;
  final bool uploading;
  final VoidCallback onAdd;
  final ValueChanged<int> onRemove;

  static const double _tile = 78;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final full = photoRefs.length >= maxPhotos;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: AppDimens.space3,
          runSpacing: AppDimens.space3,
          children: [
            for (var i = 0; i < photoRefs.length; i++)
              _Thumb(
                reference: photoRefs[i],
                size: _tile,
                onRemove: () => onRemove(i),
              ),
            if (pendingPhotoBytes != null)
              _PendingThumb(bytes: pendingPhotoBytes!, size: _tile),
            if (!full)
              Semantics(
                button: true,
                label: context.strings('addPhoto'),
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
              ? context.strings.p('photoLimitReached', {'max': '$maxPhotos'})
              : context.strings.p('photoCountOfMax', {'count': '${photoRefs.length}', 'max': '$maxPhotos'}),
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

/// مصغّرة صورة واحدة مع زرّ إزالتها.
/// مصغّرة صورة اختيرت للتوّ ولم يردّ الخادم بعد — من بايتات الجهاز.
class _PendingThumb extends StatelessWidget {
  const _PendingThumb({required this.bytes, required this.size});

  final Uint8List bytes;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: context.strings('photoUploading'),
      child: SizedBox(
        width: size,
        height: size,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.memory(bytes, fit: BoxFit.cover, gaplessPlayback: true),
              ColoredBox(
                color: Colors.black.withValues(alpha: 0.28),
                child: const Center(
                  child: SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.reference, required this.size, required this.onRemove});

  /// مرجع الخادم — يُحلّ إلى رابط عرض هنا فقط.
  final String reference;
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
              // [CRITICAL] المرجع من الخادم نسبي (`/uploads/…`) — يُحلّ إلى
              // أصل الوسائط قبل العرض، وإلا فشل `Image.network` بصمت.
              child: CustomerPhoto(url: resolveMediaUrl(reference)),
            ),
          ),
          PositionedDirectional(
            top: 2,
            end: 2,
            child: Semantics(
              button: true,
              label: context.strings('removePhoto'),
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
