// محاولاتُ كسرٍ متعمَّدة لطبقة الترجمة.
//
// كلُّ اختبار هنا يمثّل طريقةً واقعية لإسقاط الواجهة بعد إضافة لغةٍ ثانية:
// لغةٌ مجهولة تصل من التخزين، مفتاحٌ بلا ترجمة، متغيّرٌ ناقص في `p()`،
// اسمُ قسمٍ مشوّه من اللوحة، محافظةٌ بلا ترجمة كردية. لا يكفي ألّا ينهار
// التطبيق — يجب ألّا يُبدّل معنىً بصمت.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/glossary.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category_order.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

void main() {
  group('[CROWBAR] لغات شاذّة', () {
    test('رمز لغة فارغ أو مجهول أو ذو مسافات يرتدّ إلى العربية', () {
      for (final code in <String?>[null, '', '   ', 'en', 'ku', 'kur', 'ZZ']) {
        expect(
          AppLanguage.fromCode(code),
          AppLanguage.arabic,
          reason: 'الرمز «$code» لم يرتدّ إلى العربية',
        );
      }
    });

    test('«ku» ليست «ckb» — لا تُقبل بالخطأ', () {
      // ISO 639-3 للسوراني هو `ckb`. قبولُ `ku` كان سيعني لغةً محفوظة
      // لا يعرفها الخادم، فتصل الإشعارات بلغةٍ أخرى.
      expect(AppLanguage.fromCode('ku'), isNot(AppLanguage.kurdish));
      expect(AppLanguage.kurdish.code, 'ckb');
    });

    test('كل لغة مدعومة تعطي نصّاً غير فارغ لكل مفتاح', () {
      for (final language in AppLanguage.values) {
        final strings = AppStrings.of(language);
        for (final key in AppStrings.keys) {
          final value = strings(key);
          expect(
            value.trim(),
            isNotEmpty,
            reason: '$key (${language.code}) فارغ',
          );
          // المفتاح نفسه معروضاً يعني ضياع النصّ لا ترجمةً ناقصة.
          expect(value, isNot(key), reason: '$key (${language.code}) عرض مفتاحه');
        }
      }
    });

    test('مفتاح غير موجود يعيد المفتاح لا يرمي', () {
      for (final language in AppLanguage.values) {
        expect(AppStrings.of(language)('__no_such_key__'), '__no_such_key__');
      }
    });

    test('التغطية تامّة، وآليّة الارتداد ما تزال قائمة', () {
      // [CRITICAL] كان هذا الاختبار يشترط وجود مفاتيح منتظِرة، وهو شرطٌ
      // صحيح ما دامت الترجمة ناقصة ويصير خاطئاً حين تكتمل: لا يجوز أن
      // يمنع الاختبارُ بلوغَ الهدف. المقيس الآن أمران: أن التغطية تامّة،
      // وأن آليّة الارتداد (مفتاحٌ بلا كردية يعرض العربية) لم تُفكَّك —
      // وهي التي تحمي أي مفتاح يُضاف غداً.
      expect(
        AppStrings.pendingKeys,
        isEmpty,
        reason: 'مفاتيح بلا كردية: ${AppStrings.pendingKeys.join(', ')}',
      );
      for (final key in AppStrings.keys) {
        expect(AppStrings.kurdish(key).trim(), isNotEmpty, reason: '$key فارغ');
      }
      // مفتاحٌ لا وجود له في اللغتين يعيد اسمه، لا فراغاً ولا رمياً.
      expect(AppStrings.kurdish('__absent__'), '__absent__');
      expect(AppStrings.arabic('__absent__'), '__absent__');
    });
  });

  group('[CROWBAR] متغيّرات p()', () {
    test('متغيّر ناقص يترك العنصر النائب ظاهراً لا يرمي', () {
      // ظهورُ `{count}` قبيحٌ لكنه مرئيّ ويُبلَّغ عنه؛ الرمي يُسقط الشاشة.
      final strings = AppStrings.of(AppLanguage.arabic);
      expect(() => strings.p('resultsCount', const {}), returnsNormally);
      expect(strings.p('resultsCount', const {}), contains('{count}'));
    });

    test('متغيّر زائد يُتجاهَل', () {
      final strings = AppStrings.of(AppLanguage.arabic);
      expect(
        strings.p('resultsCount', const {'count': '3', 'bogus': 'x'}),
        strings.p('resultsCount', const {'count': '3'}),
      );
    });

    test('قيمة فارغة أو تحمل رموزاً لا تكسر الاستبدال', () {
      final strings = AppStrings.of(AppLanguage.arabic);
      for (final value in ['', '٥٠٪', r'$x', '{count}', '«س»']) {
        expect(
          () => strings.p('resultsCount', {'count': value}),
          returnsNormally,
          reason: 'القيمة «$value» أسقطت الاستبدال',
        );
      }
    });

    test('كل مفتاح ذي متغيّر يذكره في اللغتين', () {
      final placeholder = RegExp(r'\{(\w+)\}');
      for (final key in AppStrings.translatedKeys) {
        final ar = placeholder
            .allMatches(AppStrings.arabic(key))
            .map((m) => m.group(1))
            .toSet();
        final ckb = placeholder
            .allMatches(AppStrings.kurdish(key))
            .map((m) => m.group(1))
            .toSet();
        expect(ckb, ar, reason: '$key: متغيّرات مختلفة بين اللغتين');
      }
    });
  });

  group('[CROWBAR] حالة الطلب مستقلّة عن اللغة', () {
    test('كل حالة تُشتقّ من رمز الخادم لا من نصٍّ معروض', () {
      // `fromString` تقرأ رموز الخادم الإنجليزية. لو تسرّب نصٌّ معروض إلى
      // هنا لسقط إلى الحالة الافتراضية — وهو ما كانت الشارة تفعله.
      const serverCodes = {
        'PENDING_ADMIN_CONFIRMATION': OrderStatus.waitingAdmin,
        'CONFIRMED': OrderStatus.confirmed,
      };
      serverCodes.forEach((code, expected) {
        expect(OrderStatus.fromString(code), expected);
      });
    });

    test('نصٌّ عربيٌّ معروض لا يُقبل رمزَ حالة', () {
      // لو أعادت `fromString` حالةً حقيقية لنصٍّ عربي، لكان الخلط بين
      // الهوية والعرض ما يزال ممكناً من الباب الخلفي.
      const displayText = 'قيد التوصيل';
      expect(
        OrderStatus.fromString(displayText),
        isNot(OrderStatus.delivering),
        reason: 'النصّ المعروض ما يزال يُشتقّ منه رمزُ حالة',
      );
    });
  });

  group('[CRITICAL] الحالات الثلاث للمخزون لا تنهار في واحدة', () {
    // [CRITICAL] ثلاث حالاتٍ مختلفةٌ تجارياً، وخلطُ أيّ اثنتين يكذب على
    // الزبون:
    //   • مخزون صفر **مع** موعد  → «بەم زووانە دێتەوە» — انتظرْ، سيعود
    //   • مخزون صفر **بلا** موعد → «بەردەست نییە» / «کۆگا تەواو بووە»
    //   • مخزون موجب             → «بەردەستە»
    // العربية تفرّقها بثلاثة نصوص، والكردية ملزَمةٌ بالتفريق نفسه.
    for (final language in AppLanguage.values) {
      test('التمييز قائم في ${language.code}', () {
        final t = AppStrings.of(language);
        final withDate = t('waitingRestockOn'); // صفر + موعد
        final zeroNoDate = t('outOfStock'); //     صفر بلا موعد
        final inStock = t('available'); //         موجب

        final all = {withDate, zeroNoDate, inStock};
        expect(
          all,
          hasLength(3),
          reason: 'انهارت حالتان في نصٍّ واحد (${language.code}): $all',
        );
        for (final v in all) {
          expect(v.trim(), isNotEmpty);
        }
      });
    }

    test('«قريباً» و«غير متوفر» مصطلحان منفصلان في المسرد', () {
      expect(Glossary.comingSoon.ckb, isNot(Glossary.unavailable.ckb));
      expect(Glossary.comingSoon.ar, isNot(Glossary.unavailable.ar));
      expect(Glossary.available.ckb, isNot(Glossary.unavailable.ckb));
    });

    test('نصّ الموعد يحمل المتغيّر — فلا يصير حالةً عامّة', () {
      // «بەم زووانە دێتەوە» بلا تاريخ يساوي وعداً بلا موعد. المفتاح
      // المستعمَل في الواجهة يجب أن يحمل {date} دائماً.
      for (final language in AppLanguage.values) {
        expect(AppStrings.of(language)('waitingRestockOn'), contains('{date}'));
      }
    });
  });

  group('[CROWBAR] أسماء الأقسام المشوّهة', () {
    test('اسم فارغ أو مسافات أو رموز لا يرمي', () {
      for (final name in ['', '   ', '\t\n', '!!!', '١٢٣', 'ال', 'اﻷ']) {
        expect(
          () => canonicalCategoryKey(name),
          returnsNormally,
          reason: 'الاسم «$name» أسقط التطبيع',
        );
      }
    });

    test('«ال» وحدها لا تُقتطع فتصير فراغاً', () {
      // القاعدة تشترط طولاً > 3 عمداً: اقتطاعُ «ال» من «ال» يترك مفتاحاً
      // فارغاً يطابق كلَّ شيء.
      expect(canonicalCategoryKey('ال'), isNotEmpty);
    });

    test('اسمٌ كرديّ لا يتحوّل إلى قسمٍ عربيّ بالخطأ', () {
      // أسماء الأقسام تأتي مترجَمةً من الخادم بعد ترحيل 046. اسمٌ كردي
      // يجب أن يعطي مفتاحاً خاصاً به لا أن يصطدم بقسمٍ عربي.
      final kurdish = canonicalCategoryKey('جلوبەرگ');
      final arabic = canonicalCategoryKey('ملابس');
      expect(kurdish, isNot(arabic));
      expect(kurdish, isNotEmpty);
    });
  });

  group('[CROWBAR] محافظة بلا ترجمة كردية', () {
    test('الخادم يسقط إلى الاسم العربي عند غياب name_ckb', () {
      // `localizeNamed` تختار `name_ckb` وتسقط إلى `name`. الشرط في
      // الترحيل يمنع سلسلةً فارغة، فلا يصل اسمٌ فارغ إلى الواجهة.
      final migration = File(
        'backend/src/database/migrations/'
        '046_bilingual_content_and_user_language.sql',
      ).readAsStringSync();
      expect(
        migration,
        contains('ALTER TABLE governorates'),
        reason: 'اختفى عمود اسم المحافظة الكردي',
      );
      expect(
        migration,
        contains('char_length(btrim(name_ckb)) > 0'),
        reason: 'سقط القيد الذي يمنع اسماً كردياً فارغاً',
      );
    });

    test('لا قائمة محافظات محلية تنافس الخادم', () {
      // كانت `lib/core/constants/locations.dart` تحمل ١٨ محافظة بأسعار
      // توصيل ثابتة، ولا يقرأها أحد منذ أن صارت البيانات من الخادم.
      // بقاؤها كان يدعو لإعادة وصلها بأسعارٍ قديمة.
      expect(
        File('lib/core/constants/locations.dart').existsSync(),
        isFalse,
        reason: 'عادت قائمة المحافظات المحلية — مصدرُ حقيقةٍ ثانٍ للأسعار',
      );
    });
  });
}
