import 'package:flutter/material.dart';
import '../../../core/l10n/app_strings.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/auth/require_auth.dart';
import '../../../core/design_system/design_system.dart';
import '../../../core/di/injection_container.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/gender.dart';
import '../../../core/utils/formatters.dart';
import '../../auth/presentation/cubit/auth_cubit.dart';
import '../data/restock_repository.dart';

/// زرّ «أعلمني عند توفر المنتج» — يحلّ محلّ زرّ السلة المعطَّل عند نفاد المخزون.
///
/// كان الزرّ يقول «نفدت الكمية» ولا يفعل شيئاً، فيصل الزبون إلى طريق مسدود
/// ويغادر. الآن للنفاد إجراءٌ: ينتظر ويُعلَم.
///
/// ثلاث حالات، كلها من الخادم:
///   • غير مشترك → «أعلمني عند توفر المنتج» (قابل للضغط).
///   • مشترك بلا موعد → «بانتظار التوفر — إلغاء التنبيه» (السلوك القائم).
///   • مشترك وله موعد → «بانتظار توفيره بتاريخ …» **معطَّل للعرض فقط**.
///
/// [CRITICAL] حالة الموعد غير قابلة للضغط عمداً. الموعد يملكه المسؤول
/// والخادم؛ زرٌّ يقبل الضغط هنا يفتح باب إعادة اشتراكٍ قائم، أو إلغاءٍ
/// بالخطأ لانتظارٍ يريده الزبون، أو محاولةِ استدعاء إشعارٍ آخر بالضغط
/// المتكرّر. لا شيء من ذلك فعلٌ يخصّ الزبون في هذه الحالة.
///
/// الزائر يمرّ على [requireAuthentication] نفسها التي تحرس السلة والمفضلة —
/// لا بوابة جديدة ولا التفاف على القائمة.
class RestockNotifyButton extends StatefulWidget {
  const RestockNotifyButton({
    super.key,
    required this.productId,
    this.onChanged,
  });

  final String productId;

  /// يُستدعى بعد كل تغيّر ناجح، ليحدّث المستدعي حالته إن لزم.
  final VoidCallback? onChanged;

  @override
  State<RestockNotifyButton> createState() => _RestockNotifyButtonState();
}

class _RestockNotifyButtonState extends State<RestockNotifyButton> {
  final _repo = sl<RestockRepository>();

  bool _loading = true;
  bool _busy = false;
  bool _subscribed = false;
  DateTime? _restockAt;

  @override
  void initState() {
    super.initState();
    _loadState();
  }

  /// الحالة الأولى تُقرأ من الخادم لا تُفترض: زبونٌ اشترك من جهاز آخر يجب
  /// أن يرى «بانتظار التوفر» لا زرّاً يعرض عليه ما فعله سلفاً.
  Future<void> _loadState() async {
    if (!context.mounted) return;
    // الزائر بلا اشتراكات على الخادم؛ لا نطلبها منه ولا نُظهر تحميلاً بلا داعٍ.
    if (!context.read<AuthCubit>().isLoggedIn) {
      setState(() => _loading = false);
      return;
    }
    try {
      final mine = await _repo.mine();
      if (!mounted) return;
      final waiting = mine
          .where((entry) => entry.productId == widget.productId)
          .firstOrNull;
      setState(() {
        _subscribed = waiting != null;
        // الموعد يُقرأ مع الاشتراك عند كل فتح، فلا يبقى قديماً بعد تعديل
        // المسؤول ولا يختفي بعد إعادة تشغيل التطبيق.
        //
        // [CRITICAL] التوفر الفعلي يُلغي الموعد المتوقَّع. الشاشة الأمّ تخفي
        // هذا الزرّ أصلاً حين يعود المنتج، لكن اشتراكاً بقي لأي سبب مع منتج
        // متوفر يجب ألّا يعرض «بانتظار…» عن شيء صار بالإمكان شراؤه.
        _restockAt = (waiting?.inStock ?? false) ? null : waiting?.restockAt;
        _loading = false;
      });
    } catch (_) {
      // تعذّرت القراءة: نعرض الزرّ في حالته الأولى بدل تعطيل الشاشة. أسوأ ما
      // يقع أن يضغط الزبون فيخبره الخادم أنه مشترك سلفاً — وهي رسالة مفهومة.
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _subscribe() async {
    final authenticated = await requireAuthentication(
      context,
      title: context.gNow(GenderedStrings.loginFirst),
      body: context.strings('loginRequiredForRestock'),
    );
    if (!authenticated || !mounted) return;

    setState(() => _busy = true);
    try {
      final result = await _repo.subscribe(widget.productId);
      if (!mounted) return;
      setState(() {
        _subscribed = result.subscribed;
        _restockAt = result.restockAt;
      });
      widget.onChanged?.call();
      _snack(
        result.alreadySubscribed
            ? context.strings('alreadyOnWaitlist')
            : context.strings('willNotifyWhenAvailable'),
        success: true,
      );
    } catch (error) {
      if (!mounted) return;
      // لا نغيّر الحالة عند الفشل: زرٌّ يقول «بانتظار التوفر» بلا اشتراك
      // فعلي هو وعدٌ لا يُوفى.
      _snack(_messageOf(error), success: false);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _unsubscribe() async {
    setState(() => _busy = true);
    try {
      await _repo.unsubscribe(widget.productId);
      if (!mounted) return;
      setState(() {
        _subscribed = false;
        _restockAt = null;
      });
      widget.onChanged?.call();
      _snack(context.strings('alertCancelled'), success: true);
    } catch (error) {
      if (!mounted) return;
      _snack(_messageOf(error), success: false);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _messageOf(Object e) =>
      e is AppException && e.localizedMessage(context).trim().isNotEmpty
      ? e.localizedMessage(context)
      : context.strings('operationFailed');

  /// نفس شريط «تمت إضافة المنتج إلى السلة» بالضبط — لا نسخةَ ثانية منه.
  ///
  /// [CRITICAL] كان هنا `SnackBar` خاصّ: خلفية خضراء صمّاء، مدّة الإطار
  /// الافتراضية (٤ ثوانٍ لا ١٫٥)، بلا `persist: false`، وبلا الضغط
  /// للإخفاء. فكان يبدو مختلفاً ويختفي مختلفاً — ومع أي إجراء يُضاف إليه
  /// لاحقاً كان سيعلق على الشاشة بلا اختفاء أصلاً.
  void _snack(String message, {required bool success}) {
    showOtakuSnack(
      context,
      message: message,
      tone: success ? OtakuSnackTone.success : OtakuSnackTone.error,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const OtakuSkeleton.box(
        height: AppDimens.buttonHeightXl,
        radius: AppDimens.radiusLg,
      );
    }

    final scheduled = _restockAt;

    // مشترك وله موعد: لوحة عرضٍ لا زرّ. لا `onPressed` إطلاقاً — لا معطَّلاً
    // بشرط، بل ودجة لا تقبل الضغط أصلاً.
    if (_subscribed && scheduled != null) {
      return _ScheduledRestockState(date: scheduled);
    }

    return AnimePrimaryButton(
      label: _busy
          ? '...'
          : _subscribed
          ? context.strings('waitingCancelAlert')
          : context.g(GenderedStrings.notifyWhenAvailable),
      onPressed: _busy ? null : (_subscribed ? _unsubscribe : _subscribe),
      height: AppDimens.buttonHeightXl,
    );
  }
}

/// حالة «بانتظار توفيره بتاريخ …» — عرضٌ فقط.
///
/// ليست زرّاً معطَّلاً بل سطحٌ لا يملك `onTap`: الزرّ المعطَّل يدعو للضغط ثم
/// لا يستجيب، وهذه حالةٌ لا فعل فيها أصلاً. التاريخ يُنسَّق من
/// [formatShortArabicDate] المركزية لا هنا.
class _ScheduledRestockState extends StatelessWidget {
  const _ScheduledRestockState({required this.date});

  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Semantics(
      readOnly: true,
      label: context.strings.p('waitingRestockOn', {'date': formatShortArabicDate(context, date)}),
      child: Container(
        height: AppDimens.buttonHeightXl,
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.event_available_outlined, size: 18, color: colors.info),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                context.strings.p('waitingRestockOn', {'date': formatShortArabicDate(context, date)}),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: AppDimens.weightBold,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
