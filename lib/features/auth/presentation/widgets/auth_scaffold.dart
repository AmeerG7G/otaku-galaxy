import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../../settings/presentation/cubit/locale_cubit.dart';
import '../../../visuals/presentation/character_artwork.dart';

/// هيكل شاشات المصادقة بتصميم Otaku Galaxy v2.
///
/// رأس متدرّج (وردي → بنفسجي → أزرق فاتح) بزوايا سفلية كبيرة، يحمل الشعار
/// والعنوان، تعلوه بطاقة نموذج بيضاء عائمة تتداخل مع الرأس. المحتوى يتدفّق
/// من الأعلى فلا تبقى مساحة فارغة كبيرة أسفل الشاشة.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.form,
    this.footer,
    this.showBack = false,
    this.artwork,
    this.artworkSlot,
    this.artworkHeight = 190,
    this.artworkWidth = 142,
    this.artworkBottom = -12,
    this.subtitleSpacing,
  });

  final String title;
  final String subtitle;

  /// محتوى بطاقة النموذج العائمة.
  final Widget form;

  /// إجراءات أسفل البطاقة (تبديل تسجيل/دخول، تصفح كزائر...).
  final Widget? footer;

  final bool showBack;

  /// رسم شخصية اختياري داخل الرأس — يُقصّ بحافة الرأس ويبقى خلف المحتوى.
  ///
  /// المصدر يضعه دائماً على اليسار الفيزيائي (`left`)، أي جهة النهاية في
  /// واجهة عربية.
  final String? artwork;

  /// مفتاح موضع الرسم (`VisualSlots`) — صورته الثابتة في `CharacterArt`.
  ///
  /// حين يُمرَّر يحدّد الموضعُ صورته ولا يلزم [artwork] (المسار المباشر لرسمٍ
  /// ليس موضعاً). المقاس والموضع كما هما.
  final String? artworkSlot;

  /// رسمٌ يُعرض: موضعٌ بصورته الثابتة، أو مسارٌ مباشر.
  bool get _hasArtwork => artworkSlot != null || artwork != null;

  /// صندوق رسم الرأس وإزاحته السفلية — تختلف لكل شاشة في المصدر.
  ///
  /// المصدر يحدّد `width` و`height` معاً مع `background-size:contain`، فلا
  /// يكفي تقييد الارتفاع وحده وإلا اتّسع الرسم أفقياً وطغى على العنوان.
  final double artworkHeight;
  final double artworkWidth;
  final double artworkBottom;

  // [PRODUCT] لا رسم شخصية بجوار زرّ الإجراء (2026-09-28). كان رسمٌ صغير
  // يتدلّى من زاوية بطاقة النموذج فوق الزرّ (`ctaSlot`، لكل شاشةٍ فتحتُها)؛
  // أزاله المالك مع كل رسمٍ مجاورٍ للأزرار. البطاقة الآن النموذجُ وحده.

  /// تباعد بين العنوان والنص التوضيحي في الرأس. القيمة الافتراضية `space2`.
  /// شاشة «نسيت كلمة المرور» تمرّر قيمة أصغر لتحريك النص قليلاً للأعلى.
  final double? subtitleSpacing;

  /// مقاس النصّ التوضيحي في الرأس — `13` للعربية كما في المرجع.
  ///
  /// [CRITICAL] الكردية وحدها أصغر قليلاً (2026-09-27). حروفها الخاصة
  /// (ێ ۆ ڕ ڵ ک) لا يملكها Tajawal فتُرسم باحتياط NotoSansArabic الأطول
  /// سطراً، وجُملها الثلاث هنا أطول من العربية: بـ١٣ كانت تنزل تحت الحدّ
  /// الذي تغطّيه بطاقة النموذج (قيس `test/kurdish_auth_subtitle_layout_test.dart`).
  /// العربية لا تُمسّ.
  static const double _subtitleSize = 13;
  static const double _subtitleSizeKurdish = 11.5;
  static const double _subtitleHeight = 1.7;
  static const double _subtitleHeightKurdish = 1.55;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isKurdish = context.language == AppLanguage.kurdish;
    final headerInk = isDark
        ? const Color(0xFFF9F6FF)
        : const Color(0xFF22133F);
    final headerInk2 = isDark
        ? const Color(0xFFBCB0E2)
        : const Color(0xFF5A4A7D);

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        // [CRITICAL] الذيل يُدفع إلى أسفل الشاشة، لا يُلصق تحت البطاقة.
        //
        // المصدر يضع على الذيل `margin-top:auto` داخل عمود مرن يملأ الشاشة،
        // فالفراغ الزائد يقع **بين** البطاقة والذيل. التنفيذ السابق كان
        // عموداً عادياً داخل `SingleChildScrollView`، فيلتصق الذيل بالبطاقة
        // ويتجمّع الفراغ كله **تحته** — وهو بالضبط الفراغ الزائد أسفل
        // شاشات المصادقة.
        //
        // `ConstrainedBox(minHeight)` مع `Spacer` هو مقابل ذلك في فلاتر:
        // العمود يملأ الشاشة حين يكون المحتوى أقصر، ويتمدّد ويُمرَّر حين
        // يطول (لوحة المفاتيح مفتوحة مثلاً).
        //
        // [CRITICAL] داخل `SingleChildScrollView` يمرّر الحدّ الأقصى المرتفع
        // غير المحدود (∞) إلى الطفل، فيبقى حدّ الأصغر فقط هو المقيَّد. ليعمل
        // `Spacer` (عنصر مرن) يجب أن يكون الحدّ الأعلى محدوداً — وإلا أخطأت
        // `RenderFlex` ("children have non-zero flex but incoming height
        // constraints are unbounded") فأصبحت كل شاشات المصادقة بيضاء/فارغة.
        // لفّ العمود داخل `IntrinsicHeight` يعطيه ارتفاعاً أصلياً محدوداً
        // يساوي min-height فتُدفع حتى القاع حين المحتوى قصير، ويُتَمرَّر
        // حين يطول.
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: IntrinsicHeight(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ── الرأس المتدرّج ──
                    ClipRRect(
                      borderRadius: const BorderRadius.only(
                        bottomLeft: Radius.circular(42),
                        bottomRight: Radius.circular(42),
                      ),
                      child: Container(
                        height: 214,
                        decoration: BoxDecoration(
                          gradient: isDark
                              ? AppThemeColors.authGradientDark
                              : AppThemeColors.authGradientLight,
                        ),
                        child: Stack(
                          children: [
                            // هالة ناعمة أعلى جهة النهاية.
                            PositionedDirectional(
                              top: -70,
                              end: -50,
                              child: Container(
                                width: 210,
                                height: 210,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: RadialGradient(
                                    colors: [
                                      Colors.white.withValues(alpha: 0.35),
                                      Colors.white.withValues(alpha: 0),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            // رسم الشخصية يُقصّ بحافة الرأس ويبقى خلف النص.
                            if (_hasArtwork)
                              PositionedDirectional(
                                bottom: artworkBottom,
                                end: -34,
                                child: SizedBox(
                                  width: artworkWidth,
                                  height: artworkHeight,
                                  child: artworkSlot == null
                                      ? Image.asset(
                                          artwork!,
                                          fit: BoxFit.contain,
                                          alignment: Alignment.bottomCenter,
                                        )
                                      : CharacterArtwork(
                                          slot: artworkSlot!,
                                        ),
                                ),
                              ),
                            SafeArea(
                              bottom: false,
                              child: Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  22,
                                  16,
                                  22,
                                  0,
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        if (showBack)
                                          _GlassIconButton(
                                            icon: Icons.arrow_forward,
                                            onTap: () =>
                                                Navigator.of(context).pop(),
                                          ),
                                        if (showBack)
                                          const SizedBox(
                                            width: AppDimens.space3,
                                          ),
                                        const OtakuStoreLogoSimple(size: 38),
                                      ],
                                    ),
                                    const SizedBox(height: AppDimens.space5),
                                    ConstrainedBox(
                                      constraints: const BoxConstraints(
                                        maxWidth: 240,
                                      ),
                                      child: Column(
                                        mainAxisSize: MainAxisSize.min,
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          _HeaderTitle(
                                            title: title,
                                            // الكردية: سطرٌ واحد يُصغَّر عند
                                            // الحاجة وحدها. «وشەی نهێنی
                                            // لەبیرچوو» كان يلتفّ سطرين
                                            // فيدفع النصّ التوضيحي تحت
                                            // البطاقة؛ العناوين التي تتّسع لا
                                            // يتغيّر مقاسها.
                                            singleLine: isKurdish,
                                            style: Theme.of(context)
                                                .textTheme
                                                .headlineSmall
                                                ?.copyWith(
                                                  fontSize: 26,
                                                  fontWeight:
                                                      AppDimens.weightBlack,
                                                  color: headerInk,
                                                ),
                                          ),
                                          SizedBox(
                                            height: subtitleSpacing ??
                                                AppDimens.space2,
                                          ),
                                          Text(
                                            subtitle,
                                            key: const Key('auth_header_subtitle'),
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: Theme.of(context)
                                                .textTheme
                                                .bodySmall
                                                ?.copyWith(
                                                  fontSize: isKurdish
                                                      ? _subtitleSizeKurdish
                                                      : _subtitleSize,
                                                  height: isKurdish
                                                      ? _subtitleHeightKurdish
                                                      : _subtitleHeight,
                                                  color: headerInk2,
                                                ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    // ── بطاقة النموذج العائمة (تتداخل مع الرأس) ──
                    Transform.translate(
                      offset: const Offset(0, -28),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 18),
                        // حقلُ إدخالٍ بعرض لوحٍ كامل يبعّد مؤشّر الكتابة عن
                        // تسميته ويجعل النموذج شريطاً ممتدّاً؛ على الهاتف
                        // (أضيق من الحدّ) لا أثر لهذا الإطار البتّة.
                        child: ResponsiveContentFrame(
                          maxWidth: kFormMaxWidth,
                          child: Container(
                            padding: const EdgeInsets.fromLTRB(
                              20,
                              24,
                              20,
                              22,
                            ),
                            decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.surface,
                              borderRadius: BorderRadius.circular(
                                AppDimens.radiusLg,
                              ),
                              border: Border.all(
                                color: Theme.of(
                                  context,
                                ).colorScheme.outlineVariant,
                              ),
                              boxShadow: colors.shadowFloating,
                            ),
                            child: form,
                          ),
                        ),
                      ),
                    ),

                    // الفراغ الزائد هنا — بين البطاقة والذيل — كما في المصدر.
                    const Spacer(),
                    if (footer != null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 18, 20, 26),
                        child: ResponsiveContentFrame(
                          maxWidth: kFormMaxWidth,
                          child: footer!,
                        ),
                      )
                    else
                      const SizedBox(height: AppDimens.space6),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// عنوان الرأس. [singleLine] يُبقيه سطراً واحداً ويصغّره **فقط** إن لم يتّسع
/// له العمود (`FittedBox.scaleDown` لا يكبّر أبداً)؛ وإلا فسطران كما في المرجع.
class _HeaderTitle extends StatelessWidget {
  const _HeaderTitle({
    required this.title,
    required this.singleLine,
    required this.style,
  });

  final String title;
  final bool singleLine;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    if (!singleLine) {
      return Text(
        title,
        key: const Key('auth_header_title'),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: style,
      );
    }
    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: AlignmentDirectional.centerStart,
      child: Text(
        title,
        key: const Key('auth_header_title'),
        maxLines: 1,
        style: style,
      ),
    );
  }
}

class _GlassIconButton extends StatelessWidget {
  const _GlassIconButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.28),
      borderRadius: BorderRadius.circular(AppDimens.radiusXs),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppDimens.radiusXs),
        child: SizedBox(
          width: 38,
          height: 38,
          child: Icon(
            icon,
            size: AppDimens.iconMd,
            color: Theme.of(context).brightness == Brightness.dark
                ? const Color(0xFFF3EFFF)
                : const Color(0xFF2A1A4D),
          ),
        ),
      ),
    );
  }
}
