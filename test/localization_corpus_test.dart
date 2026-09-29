// جودة مجموعة الترجمة — تغطية، ومتغيّرات، وفراغ، واتساق مصطلحات.
//
// [CRITICAL] هذه الاختبارات لا تحكم على **جودة** الكردية — ذلك يحتاج ناطقاً.
// تحكم على ما يمكن قياسه آلياً: ألّا يبقى مفتاحٌ بلا ترجمة، وألّا يضيع
// متغيّر، وألّا تُشحن قيمة فارغة، وألّا يتعدّد مصطلحٌ واحد. هذه هي الأخطاء
// التي تمرّ من مراجعة العين وتصل الزبون.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/gender.dart';
import 'package:otaku_galaxy/core/l10n/glossary.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

/// المتغيّرات داخل نصّ: `{name}` و`%s` و`%d`.
Set<String> _placeholders(String value) => {
  ...RegExp(r'\{[a-zA-Z0-9_]+\}').allMatches(value).map((m) => m.group(0)!),
  ...RegExp(r'%[sd]').allMatches(value).map((m) => m.group(0)!),
};

void main() {
  group('[CRITICAL] تغطية الترجمة', () {
    test('[CRITICAL] كل ترجمة كردية *موجودة* صالحة', () {
      // [CRITICAL] المقيس هنا جودة ما تُرجم، لا نسبة ما تُرجم. المفتاح الذي
      // لم يُترجَم بعد غائبٌ عن `_ckb` عمداً ويسقط إلى العربية — وهذا صحيح.
      // الخطأ هو ترجمةٌ *موجودة* لكنها فارغة أو نسخةٌ من العربية: تلك تُعلن
      // اكتمالاً كاذباً.
      final broken = <String>[];
      for (final key in AppStrings.translatedKeys) {
        final ckb = AppStrings.kurdish(key);
        if (ckb.trim().isEmpty) broken.add('$key — فارغ');
        if (ckb == AppStrings.arabic(key) &&
            !AppStrings.localeInvariantKeys.contains(key)) {
          broken.add('$key — نسخة من العربية');
        }
      }
      expect(broken, isEmpty, reason: 'ترجمات معطوبة:\n${broken.join('\n')}');
    });

    test('[TRIPWIRE] الترجمات المنجزة لا تتراجع', () {
      // أرضية لا سقف: العدد يصعد مع التقدّم ولا ينزل. حذفُ ترجمةٍ منجزة
      // يُسقط هذا الاختبار.
      const completedFloor = 17;
      expect(
        AppStrings.translatedKeys.length,
        greaterThanOrEqualTo(completedFloor),
        reason: 'تراجعت الترجمات المنجزة عن الأرضية',
      );
    });

    test('حالة الترجمة معلَنة بصدق — لا اكتمال وهمي', () {
      // تقريرٌ لا حكم: يوثّق الرقم في مخرجات الاختبار كي لا يُنسى.
      final total = AppStrings.keys.length;
      final done = AppStrings.translatedKeys.length;
      final pending = AppStrings.pendingKeys.length;
      expect(done + pending, total, reason: 'حساب الحالة غير متّسق');
      // ignore: avoid_print
      print('  [i18n] مفاتيح: $total · مترجَمة: $done · تنتظر: $pending');
    });

    test('لا قيمة إنتاجية فارغة في أي لغة', () {
      // يشمل المفاتيح التي تنتظر ترجمة: احتياط العربية يجب أن يمنع الفراغ
      // دائماً، فلا شاشة تظهر بمكان خالٍ لأن الكردية لم تصل بعد.
      for (final language in AppLanguage.values) {
        final strings = AppStrings.of(language);
        for (final key in AppStrings.keys) {
          expect(
            strings(key).trim(),
            isNotEmpty,
            reason: '$key فارغ في ${language.code}',
          );
        }
      }
    });
  });

  group('[CRITICAL] سلامة المتغيّرات', () {
    test('مجموعة متغيّرات العربية == مجموعة الكردية', () {
      final broken = <String>[];
      for (final key in AppStrings.translatedKeys) {
        final ar = _placeholders(AppStrings.arabic(key));
        final ckb = _placeholders(AppStrings.kurdish(key));
        if (!const SetEquality().equals(ar, ckb)) {
          broken.add('$key → ar:$ar ckb:$ckb');
        }
      }
      expect(
        broken,
        isEmpty,
        reason: 'متغيّرات ناقصة أو زائدة — النصّ سيظهر مكسوراً:\n'
            '${broken.join('\n')}',
      );
    });
  });

  group('[CRITICAL] المصطلحات المقفلة لا تنزلق', () {
    // [CRITICAL] «نقاط المجرّة» هويّةُ برنامجٍ لا وصف. تعدُّد صيغها بالكردية
    // («خاڵی گەلاکسی» في شاشة و«خاڵەکانی گەلاکسی» في أخرى) يجعل الزبون
    // يظنّها برنامجين، ويجعل البحث والدعم مستحيلين. وقع هذا فعلاً في
    // `reviewInviteBody` ولم يكشفه شيء حتى تدقيق الاتساق اليدوي.
    const forbidden = <String, String>{
      'خاڵی گەلاکسی': 'خاڵەکانی گەلاکسی',
      'خاڵەکانی ستۆر': 'خاڵەکانی گەلاکسی',
    };

    test('لا صيغة ممنوعة لنقاط المجرّة في أي مفتاح', () {
      final offenders = <String>[];
      for (final key in AppStrings.translatedKeys) {
        final value = AppStrings.kurdish(key);
        forbidden.forEach((bad, good) {
          if (value.contains(bad) && !value.contains(good)) {
            offenders.add('$key: «$bad» بدل «$good»');
          }
        });
      }
      expect(
        offenders,
        isEmpty,
        reason: 'انزلق مصطلحٌ مقفل:\n${offenders.join('\n')}',
      );
    });

    test('«بەم زووانە دێتەوە» و«بەردەست نییە» لا تتبادلان', () {
      expect(Glossary.comingSoon.ckb, isNot(Glossary.unavailable.ckb));
    });
  });

  group('[CRITICAL] أرقام قواعد النقاط تطابق الخادم', () {
    // [CRITICAL] شاشة «كيف تعمل النقاط؟» تكتب قيم العمل نصّاً: «٥» و«١»
    // و«١٠٬٠٠٠ دينار». مصدرها الحقيقي `backend/src/domain/galaxyPoints.ts`،
    // ولا يرسلها الخادم إلى تطبيق الزبون أصلاً (تُعرض في لوحة الإدارة
    // وحدها)، فلا يوجد ما يُنسَّق منه. ولأن لا رابط بينهما، فتغييرُ القاعدة
    // في الخادم يترك الشاشة تَعِد الزبون بوعدٍ كاذب بصمت.
    //
    // هذا الحارس هو الرابط: يقرأ ثوابت الخادم نصّاً ويقارنها بما تعرضه
    // العربية. لا يُصلح المعمارية — يجعل انحرافها مستحيلاً بلا صوت.
    // الإصلاح الحقيقي أن يرسل الخادم القواعد في `PointsSummary`، وهو تغيير
    // عقدٍ في الواجهة البرمجية، خارج نطاق الاستخراج.
    const arabicIndicDigits = '٠١٢٣٤٥٦٧٨٩';

    String toArabicIndic(int value) => value
        .toString()
        .split('')
        .map((d) => arabicIndicDigits[int.parse(d)])
        .join();

    int backendConstant(String name) {
      final source = File(
        'backend/src/domain/galaxyPoints.ts',
      ).readAsStringSync();
      final match = RegExp(
        'export const $name = ([0-9_]+);',
      ).firstMatch(source);
      expect(match, isNotNull, reason: 'اختفى الثابت $name من الخادم');
      return int.parse(match!.group(1)!.replaceAll('_', ''));
    }

    /// النصّ بلا فاصل الآلاف العربي، كي تُقارَن الأرقام لا التنسيق.
    String digitsOf(String key) =>
        AppStrings.arabic(key).replaceAll('٬', '');

    test('«عن كل ١٠٬٠٠٠ دينار» تطابق PURCHASE_STEP_IQD', () {
      expect(
        digitsOf('rulePerPurchase'),
        contains(toArabicIndic(backendConstant('PURCHASE_STEP_IQD'))),
        reason: 'تغيّرت خطوة الشراء في الخادم ونصُّ الشاشة ما يزال قديماً',
      );
    });

    test('«٥» تطابق PURCHASE_POINTS_PER_STEP و REVIEW_PHOTOS_POINTS', () {
      final perStep = backendConstant('PURCHASE_POINTS_PER_STEP');
      final photos = backendConstant('REVIEW_PHOTOS_POINTS');
      expect(
        perStep,
        photos,
        reason: 'افترق الثابتان في الخادم — لم يعد مفتاح «٥» الواحد يكفي '
            'للسطرين، ويلزم فصلهما',
      );
      expect(AppStrings.arabic('pointsNumeral5'), toArabicIndic(perStep));
    });

    test('«١» تطابق REVIEW_COMMENT_POINTS', () {
      expect(
        AppStrings.arabic('pointsNumeral1'),
        toArabicIndic(backendConstant('REVIEW_COMMENT_POINTS')),
      );
    });
  });

  group('[CRITICAL] لا شرطة مائلة مضاعفة في القيم', () {
    // [CRITICAL] `'\\n'` في دارت شرطةٌ مائلة حرفية يتبعها حرف n، لا سطرٌ
    // جديد. وقع هذا فعلاً في مفتاحين أثناء النقل — عنوانُ بطل الرئيسية
    // وسطرُ المشاركة — فصار الزبون يقرأ «\n» مطبوعةً وسط الجملة بدل أن
    // ينكسر السطر. لا يكشفه المحلّل ولا يوقف اختباراً، لأن النصّ «صحيح»
    // نحوياً. هذا الحارس يقرأ الملف نصّاً خاماً لأن القيمة بعد التصريف
    // تكون قد فقدت الدليل.
    test('لا \\\\ داخل قيم AppStrings', () {
      final source = File('lib/core/l10n/app_strings.dart').readAsLinesSync();
      final offenders = <String>[];
      for (var i = 0; i < source.length; i++) {
        final line = source[i].trim();
        if (!line.startsWith("'")) continue;
        if (line.contains(r'\\')) offenders.add('${i + 1}: $line');
      }
      expect(
        offenders,
        isEmpty,
        reason: 'شرطة مائلة مضاعفة — ستُطبع حرفياً بدل أن تكسر السطر:\n'
            '${offenders.join('\n')}',
      );
    });
  });

  group('[CRITICAL] الجذر يوفّر LocaleCubit', () {
    // [CRITICAL] `context.strings` يرتدّ إلى العربية عند غياب `LocaleCubit`
    // كي لا تنهار شجرةٌ معزولة (حوار، أو ودجة تُبنى وحدها في اختبار). هذا
    // الارتداد نافع، لكنه يعني أن سقوط المزوِّد من جذر التطبيق لن يرمي
    // استثناءً — سيعرض التطبيق كلّه عربياً بصمت للزبون الكردي. هذا الحارس
    // هو ما يمنع تحوّل الارتداد إلى غطاءٍ على عطبٍ حقيقي.
    test('app.dart يسجّل BlocProvider<LocaleCubit>', () {
      final source = File('lib/app/view/app.dart').readAsStringSync();
      expect(
        source.contains('BlocProvider<LocaleCubit>'),
        isTrue,
        reason: 'سقط مزوِّد اللغة من جذر التطبيق — كل الشاشات ستعرض عربياً '
            'مهما اختار المستخدم، بلا استثناء يكشف ذلك',
      );
    });
  });

  group('[CRITICAL] استدعاءات p() تمرّر قيماً حقيقية', () {
    // [CRITICAL] `'\$x'` في دارت دولارٌ **مهروب**: نصٌّ حرفيّ لا استيفاء.
    // كُتب هكذا سهواً في ١٣ موضعاً أثناء الاستخراج، فكان الزبون سيقرأ
    // «\$_results.length نتيجة» بدل الرقم. المحلّل صمت لأن أغلب المراجع
    // حقولٌ لا متغيّرات محلية، فلا تُبلَّغ «غير مستعملة». هذا الحارس يمنع
    // عودتها: لا دولار مهروب داخل استدعاء p() أبداً.
    test('لا دولار مهروب داخل p()', () {
      final offenders = <String>[];
      for (final entity in Directory('lib').listSync(recursive: true)) {
        if (entity is! File || !entity.path.endsWith('.dart')) continue;
        final lines = entity.readAsStringSync().split('\n');
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].contains('strings.p(') && lines[i].contains(r'\$')) {
            offenders.add('${entity.path}:${i + 1}');
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'دولار مهروب — القيمة لن تُستوفى وستُطبع حرفياً:\n'
            '${offenders.join('\n')}',
      );
    });
  });

  group('[CRITICAL] الجنس — الكردية لا تُصرَّف بجنس المخاطَب', () {
    test('كل مفهوم مصرَّف يحمل صيغةً كردية واحدة', () {
      // [CRITICAL] السوراني لا يصرّف الأمر بجنس المخاطَب: «أضف/أضيفي» كلاهما
      // «زیاد بکە». نسخُ تفريع العربية إلى الكردية كان سيخترع تمييزاً لا
      // وجود له في اللغة. لذلك `ckb` حقلٌ واحد لا ثلاثة.
      final missing = <String>[];
      for (final entry in GenderedStrings.all.entries) {
        final ckb = entry.value.ckb;
        if (ckb == null || ckb.trim().isEmpty) missing.add(entry.key);
      }
      expect(
        missing,
        isEmpty,
        reason: 'مفاهيم مصرَّفة بلا كردية:\n${missing.join('\n')}',
      );
    });

    test('الصيغة الكردية نفسها للذكر والأنثى والمجهول', () {
      for (final entry in GenderedStrings.all.entries) {
        final gendered = entry.value;
        if (gendered.ckb == null) continue;
        expect(
          {
            gendered.ofLocale(AppGender.male, AppLanguage.kurdish),
            gendered.ofLocale(AppGender.female, AppLanguage.kurdish),
            gendered.ofLocale(AppGender.unknown, AppLanguage.kurdish),
          },
          hasLength(1),
          reason: '${entry.key}: الكردية تفرّعت بالجنس بلا داعٍ لغوي',
        );
      }
    });

    test('العربية تحتفظ بتصريفها الثلاثي — لا انحدار', () {
      for (final entry in GenderedStrings.all.entries) {
        final g = entry.value;
        expect(g.male.trim(), isNotEmpty, reason: entry.key);
        expect(g.female.trim(), isNotEmpty, reason: entry.key);
        // الذكر والأنثى مختلفان فعلاً في العربية.
        expect(g.male, isNot(g.female), reason: '${entry.key} لم يُصرَّف');
      }
    });
  });

  group('[CRITICAL] اتساق المصطلحات', () {
    test('لا مصطلح كردي واحد لمفهومين مختلفين', () {
      final byCkb = <String, List<String>>{};
      for (final term in Glossary.all) {
        byCkb.putIfAbsent(term.ckb, () => []).add(term.ar);
      }
      final collisions = byCkb.entries.where((e) => e.value.length > 1).toList();
      expect(
        collisions.map((e) => '${e.key} ← ${e.value.join(" / ")}').toList(),
        isEmpty,
        reason: 'مصطلح كردي واحد لمفهومين — الزبون لن يفرّق بينهما',
      );
    });

    test('لا مفهوم عربي بترجمتين كرديتين', () {
      final byAr = <String, Set<String>>{};
      for (final term in Glossary.all) {
        byAr.putIfAbsent(term.ar, () => {}).add(term.ckb);
      }
      final split = byAr.entries.where((e) => e.value.length > 1).toList();
      expect(
        split.map((e) => '${e.key} → ${e.value.join(" / ")}').toList(),
        isEmpty,
      );
    });

    test('لا مصطلح فارغ في المسرد', () {
      for (final term in Glossary.all) {
        expect(term.ar.trim(), isNotEmpty);
        expect(term.ckb.trim(), isNotEmpty);
        expect(term.ckb, isNot(term.ar), reason: '${term.ar} لم يُترجَم');
      }
    });

    test('«Galaxy Points» تحتفظ بهويتها ولا تُستبدل', () {
      // اسم البرنامج قرار منتج لا خيار ترجمة.
      expect(Glossary.galaxyPoints.ckb, 'خاڵەکانی گەلاکسی');
      expect(AppStrings.kurdish('galaxyPoints'), Glossary.galaxyPoints.ckb);
    });

    test('«قريباً يتوفر» و«غير متوفر» مصطلحان مختلفان — معنى تجاري', () {
      // خلطهما يعني أن الزبون لا يعرف هل ينتظر أم لا.
      expect(Glossary.comingSoon.ckb, isNot(Glossary.unavailable.ckb));
    });
  });

  group('[CRITICAL] العربية لم تتغيّر بالاستخراج', () {
    /// النصوص كما كانت مكتوبة في الودجات **قبل** الاستخراج.
    ///
    /// [CRITICAL] الاستخراج عمليةٌ حافظة للسلوك: الزبون العربي يجب أن يقرأ
    /// الحرف نفسه بعده. أي «تحسين» صياغة أو تشذيب مسافة أثناء النقل يغيّر
    /// ما يراه زبونٌ حقيقي، ويمرّ بلا أن يلاحظه أحد. هذه الخريطة تمنعه.
    const originals = <String, String>{
      'login': 'تسجيل الدخول',

      // ═══ الدفعات ٢–١٠: أعلى النصوص خطراً عند النقل ═══
      // اختيرت لما تحمله لا لعددها: علامة استفهام عربية، حذفٌ «…» لا ثلاث
      // نقاط، شرطة مطوّلة «—» لا واصلة، مزدوجتان «» لا اقتباس لاتيني،
      // إيموجي، أرقام عربية-هندية، ومسافةٌ أخيرة مقصودة. كلّها محارف
      // تُصحَّح سهواً أثناء النقل فتتغيّر الواجهة بلا أن يلاحظ أحد.
      'loading': 'جاري التحميل…',
      'searchingInGalaxy': 'نبحث في المجرّة…',
      'noCategoriesBody': 'لا توجد أقسام متاحة حالياً — عد لاحقاً.',
      'heroNewSeason': 'موسم جديد من\nعالم الأنمي',
      'promoUpToDiscount': 'حتى {percent}٪',
      'deliveryCodWhatsapp':
          'الدفع عند الاستلام، وتأكيد الطلب عبر واتساب قبل الإرسال.',
      'priceIqd': '{amount} د.ع',
      'discountPercentBadge': '−{percent}٪',
      'listSeparator': '، ',
      'freeDelivery': 'توصيل مجاني 🎉',
      'stepOneOfTwo': 'الخطوة ١ من ٢',
      'stepNumeral2': '٢',
      'removeProductConfirm': 'سيُزال «{name}» من سلتك. هل تريد المتابعة؟',
      'etaTwoToFourDays': 'موعد الوصول المتوقع خلال ٢–٤ أيام حسب المحافظة.',
      'statusAcceptedTitle': 'تم قبول طلبك 🎉',
      'birthdaySaved': 'تاريخ ميلادك محفوظ 🎂',
      'reviewRejectedTitle': '❌ لم يتم قبول تقييمك',
      'reviewApprovedChip': '✓ تم نشر تقييمك',
      'reviewPendingChip': '⏳ تقييمك قيد المراجعة',
      'customerReviews': '⭐ تقييمات العملاء',
      'customerPhotos': '📸 صور العملاء',
      'galaxyPointsTitle': '🌌 نقاط المجرّة',
      'happyBirthday': '🎂 عيد ميلاد سعيد!',
      'birthdayTitle': '🎂 تاريخ ميلادك',
      'willNotifyWhenAvailable': 'سنُعلمك فور توفّره 🔔',
      'reviewPublishedThanks': 'تقييمك منشور — شكراً 💜',
      'rulePerPurchase': 'عن كل ١٠٬٠٠٠ دينار من مشترياتك',
      'onbWorldBody': 'منتجات حصرية ومبتكرة تلبي تطلعاتكم ',
      'firstCollectionBody':
          'جمّع منتجاتك بمجموعات مثل «أشياء أريدها» أو «للدراسة» '
              'لتصل إليها بسرعة.',
      'errSessionExpired': 'انتهت الجلسة — سجّل الدخول مجدداً',
      'unitMinuteTwo': 'دقيقتان',
      'monthSeptember': 'سبتمبر',
      // [STEP 64 §19] تغييرٌ مقصود بطلب المالك: الاسم ورابط المتجر، بلا سعر.
      'shareProductText': '{name}\n{url}',
      'register': 'إنشاء حساب',
      'phoneNumber': 'رقم الهاتف',
      'password': 'كلمة المرور',
      'username': 'اسم المستخدم',
      'forgotPassword': 'نسيت كلمة المرور؟',
      'verifyCode': 'رمز التحقق',
      'sendCode': 'إرسال رمز التحقق',
      'confirmPhone': 'تأكيد رقم الهاتف',
      'searchHint': 'ابحث عن منتج…',
      'offers': 'العروض',
      'selectedProducts': 'منتجات مختارة',
      'discover': 'اكتشف المنتجات',
      'addToFavorites': 'إضافة إلى المفضلة',
      'price': 'السعر',
      'description': 'الوصف',
      'quantity': 'الكمية',
      'checkout': 'إتمام الطلب',
      'orderData': 'بيانات الطلب',
      'province': 'المحافظة',
      'deliveryCost': 'تكلفة التوصيل',
      'fullAddress': 'العنوان الكامل',
      'totalShort': 'المجموع',
      'confirmOrder': 'تأكيد إرسال الطلب',
      'orderSentSuccessfully': 'تم إرسال طلبك بنجاح.',
      'editProfile': 'تعديل الملف الشخصي',
    };

    test('كل نصّ مستخرَج يطابق أصله حرفاً بحرف', () {
      final drifted = <String>[];
      for (final entry in originals.entries) {
        final current = AppStrings.arabic(entry.key);
        if (current != entry.value) {
          drifted.add('${entry.key}: «$current» ≠ «${entry.value}»');
        }
      }
      expect(
        drifted,
        isEmpty,
        reason: 'العربية تغيّرت أثناء الاستخراج:\n${drifted.join('\n')}',
      );
    });

    test('المفاتيح المستخرَجة كلها موجودة', () {
      for (final key in originals.keys) {
        expect(AppStrings.keys, contains(key), reason: '$key اختفى');
      }
    });
  });

  group('[TRIPWIRE] رصد نصوص عربية جديدة في الإنتاج', () {
    test('عدد النصوص العربية المضمَّنة لا يتجاوز الخطّ المرجعي', () {
      // [CRITICAL] هذا ليس فحص جودة بل حارس اتجاه: الرقم ينزل مع تقدّم
      // الترجمة ولا يصعد. من يضيف نصّاً عربياً مباشراً بدل مفتاحٍ مترجَم
      // يكسر هذا الاختبار ويُجبَر على المرور بطبقة الترجمة.
      // [CRITICAL] طبقة الترجمة نفسها مستثناة: الكردية تُكتب بالأبجدية
      // العربية، فعدُّها «نصّاً عربياً مضمَّناً» كان سيجعل كل ترجمة جديدة
      // ترفع الرقم وتُسقط الحارس — أي أن الترجمة تُعاقَب بدل أن تُكافأ.
      // المقيس هو النصّ المضمَّن في **الودجات** وحدها.
      // [CRITICAL] الرقم هو العدد الحالي **بالضبط** لا سقفاً فضفاضاً.
      // كان 682 بينما الواقع 563، فإعادةُ نصٍّ مستخرَج إلى ودجة كانت تمرّ
      // بلا صوت — الحارس يحرس الاتجاه فقط إن كان ملتصقاً بالرقم. يُنزَّل
      // هذا العدد مع كل دفعة استخراج، ولا يُرفع أبداً.
      const baseline = 28;
      const localizationLayer = 'lib/core/l10n/';
      final arabic = RegExp(r'[؀-ۿ]');
      final literal = RegExp(r"'([^'\\\n]{1,300})'");
      final found = <String>{};
      for (final entity in Directory('lib').listSync(recursive: true)) {
        if (entity is! File || !entity.path.endsWith('.dart')) continue;
        if (entity.path.contains(localizationLayer)) continue;
        var src = entity.readAsStringSync();
        src = src.replaceAll(RegExp(r'^\s*///.*$', multiLine: true), '');
        src = src.replaceAll(RegExp(r'^\s*//.*$', multiLine: true), '');
        // [CRITICAL] وسائط التوصيفات (`@Deprecated('لا أثر له')`) رسائلُ
        // للمبرمج يعرضها المحلّل وبيئة التطوير، لا يراها زبونٌ أبداً.
        // عدُّها «نصّاً مضمَّناً» كان يدفع نحو ترجمة توثيقٍ برمجي — وهو
        // عبثٌ يُفسد الخطّ المرجعي بضجيج لا يُستخرَج أصلاً.
        src = src.replaceAll(RegExp(r'@\w+\([^)]*\)'), '');
        for (final m in literal.allMatches(src)) {
          final value = m.group(1)!;
          if (!arabic.hasMatch(value)) continue;
          if (RegExp(r'^[\s،؛؟.,:;!?()\[\]{}«»\-–—]*$').hasMatch(value)) continue;
          found.add(value);
        }
      }
      expect(
        found.length,
        lessThanOrEqualTo(baseline),
        reason: 'نصوص عربية مضمَّنة جديدة (${found.length} > $baseline) — '
            'أضِف المفتاح إلى AppStrings بدل كتابة النصّ في الودجة',
      );
    });
  });
}

/// مقارنة مجموعتين — بديل صغير عن `collection` لتفادي اعتماد جديد.
class SetEquality {
  const SetEquality();
  bool equals(Set<String> a, Set<String> b) =>
      a.length == b.length && a.containsAll(b);
}
