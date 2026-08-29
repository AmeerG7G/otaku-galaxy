import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/design_system/design_system.dart';

/// حالة حقل رمز التحقق البصرية.
enum OtpFieldStatus { idle, verifying, invalid, valid }

/// حقل رمز تحقق من ٦ خانات بتصميم Otaku Galaxy v2.
///
/// كل خانة سطح مستقل بزوايا مستديرة، وتتغيّر حدودها حسب الحالة:
/// فارغة / أثناء الكتابة / رمز غير صحيح / تم التحقق.
class OtpCodeField extends StatefulWidget {
  const OtpCodeField({
    super.key,
    required this.controller,
    this.status = OtpFieldStatus.idle,
    this.onCompleted,
  });

  final TextEditingController controller;
  final OtpFieldStatus status;
  final ValueChanged<String>? onCompleted;

  @override
  State<OtpCodeField> createState() => _OtpCodeFieldState();
}

class _OtpCodeFieldState extends State<OtpCodeField> {
  late final List<FocusNode> _nodes;
  late final List<TextEditingController> _cells;

  @override
  void initState() {
    super.initState();
    _nodes = List.generate(6, (_) => FocusNode());
    _cells = List.generate(6, (_) => TextEditingController());
  }

  @override
  void dispose() {
    for (final n in _nodes) {
      n.dispose();
    }
    for (final c in _cells) {
      c.dispose();
    }
    super.dispose();
  }

  void _syncToController() {
    final code = _cells.map((c) => c.text).join();
    widget.controller.text = code;
    if (code.length == 6) widget.onCompleted?.call(code);
  }

  void _onChanged(int index, String value) {
    if (value.length > 1) {
      // لصق الرمز كاملاً: وزّع الأرقام على الخانات.
      final digits = value.replaceAll(RegExp(r'\D'), '');
      for (var i = 0; i < 6; i++) {
        _cells[i].text = i < digits.length ? digits[i] : '';
      }
      _syncToController();
      FocusScope.of(context).unfocus();
      setState(() {});
      return;
    }
    if (value.isNotEmpty && index < 5) {
      _nodes[index + 1].requestFocus();
    } else if (value.isEmpty && index > 0) {
      _nodes[index - 1].requestFocus();
    }
    _syncToController();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    Color borderFor(int index) {
      switch (widget.status) {
        case OtpFieldStatus.invalid:
          return colors.error;
        case OtpFieldStatus.valid:
          return colors.success;
        case OtpFieldStatus.verifying:
        case OtpFieldStatus.idle:
          if (_nodes[index].hasFocus) {
            return Theme.of(context).colorScheme.primary;
          }
          return _cells[index].text.isNotEmpty
              ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.45)
              : Theme.of(context).colorScheme.outlineVariant;
      }
    }

    return Directionality(
      // الأرقام تُدخل من اليسار لليمين حتى داخل واجهة عربية.
      textDirection: TextDirection.ltr,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(6, (index) {
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3.5),
            child: SizedBox(
              width: 46,
              height: 56,
              child: TextField(
                controller: _cells[index],
                focusNode: _nodes[index],
                onChanged: (v) => _onChanged(index, v),
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                maxLength: index == 0 ? 6 : 1,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: AppDimens.weightExtraBold,
                ),
                decoration: InputDecoration(
                  counterText: '',
                  filled: true,
                  fillColor: Theme.of(
                    context,
                  ).colorScheme.surfaceContainerHighest,
                  contentPadding: EdgeInsets.zero,
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                    borderSide: BorderSide(color: borderFor(index), width: 1.5),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                    borderSide: BorderSide(color: borderFor(index), width: 1.8),
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                    borderSide: BorderSide(color: borderFor(index), width: 1.5),
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

/// لافتة حالة تحت خانات الرمز: خطأ / نجاح / جارٍ التحقق.
class OtpStatusBanner extends StatelessWidget {
  const OtpStatusBanner({super.key, required this.status});

  final OtpFieldStatus status;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    if (status == OtpFieldStatus.idle) return const SizedBox.shrink();

    if (status == OtpFieldStatus.verifying) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(
            width: 17,
            height: 17,
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
          const SizedBox(width: AppDimens.space3),
          Text(
            'جاري التحقق…',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      );
    }

    final invalid = status == OtpFieldStatus.invalid;
    final color = invalid ? colors.error : colors.success;
    return Container(
      padding: const EdgeInsets.all(AppDimens.space4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(AppDimens.radiusSm),
        border: Border.all(color: color.withValues(alpha: 0.28)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            child: Icon(
              invalid ? Icons.priority_high_rounded : Icons.check,
              size: 14,
              color: Colors.white,
            ),
          ),
          const SizedBox(width: AppDimens.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  invalid ? 'رمز التحقق غير صحيح' : '✓ تم التحقق بنجاح',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontWeight: AppDimens.weightBold,
                    color: color,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  invalid
                      ? 'تأكد من الرمز وحاول مرة أخرى.'
                      : 'جاري متابعة تسجيل الدخول…',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    height: 1.6,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
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
