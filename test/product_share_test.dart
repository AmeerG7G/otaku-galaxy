// مشاركة المنتج (STEP 64 §19): اسم المنتج ثم رابط المتجر — بلا سعر، والرابط
// من إعدادات المتجر التي يضبطها المسؤول لا من الكود.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/features/product_detail/presentation/utils/product_share.dart';
import 'package:otaku_galaxy/features/settings/data/store_settings_repository.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

void main() {
  const url = 'https://otakugalaxystore.com/shop';

  group('productShareText', () {
    for (final language in AppLanguage.values) {
      final strings = AppStrings.of(language);

      test(
        '${language.name}: «الاسم» ثم «الرابط» في سطرين — لا شيء غيرهما',
        () {
          final text = productShareText(
            strings,
            name: 'كوب ناروتو 350 مل',
            storeUrl: url,
          );
          expect(text, 'كوب ناروتو 350 مل\n$url');
        },
      );

      test('${language.name}: لا سعر ولا عملة', () {
        final text = productShareText(strings, name: 'ملصق', storeUrl: url);
        // لا رقم خارج الرابط، ولا «د.ع».
        expect(text.replaceAll(url, ''), isNot(matches(RegExp(r'[0-9٠-٩]'))));
        expect(text, isNot(contains('د.ع')));
        expect(strings('shareProductText'), isNot(contains('{price}')));
      });

      test(
        '${language.name}: رابطٌ غير مضبوط = الاسم وحده (لا سطرٌ فارغ ولا «{url}»)',
        () {
          for (final empty in ['', '   ']) {
            expect(
              productShareText(strings, name: 'ملصق', storeUrl: empty),
              'ملصق',
            );
          }
        },
      );
    }

    test('الرابط يُقلَّم', () {
      expect(
        productShareText(AppStrings.arabic, name: 'ملصق', storeUrl: '  $url '),
        'ملصق\n$url',
      );
    });
  });

  group('share.storeUrl من إعدادات المتجر', () {
    test('يُقرأ من `share.storeUrl` بجانب روابط التواصل', () {
      final links = StoreSocialLinks.fromJson({
        'social': {'whatsapp': 'https://wa.me/9647700000000'},
        'share': {'storeUrl': ' $url '},
      });
      expect(links.shareUrl, url);
      expect(links.whatsapp, 'https://wa.me/9647700000000');
    });

    test('خادمٌ أقدم بلا `share` — فارغ، لا استثناء', () {
      expect(StoreSocialLinks.fromJson(const {}).shareUrl, '');
      expect(
        StoreSocialLinks.fromJson(const {
          'share': {'storeUrl': null},
        }).shareUrl,
        '',
      );
    });
  });

  // [CRITICAL] «كل مداخل المشاركة»: طبقة المشاركة تُستدعى من مكانٍ واحد في
  // التطبيق، ونصّه من [productShareText] — لا نسخةٌ تعيد السعر.
  test(
    '[CRITICAL] every share call in lib/ builds its text with productShareText',
    () {
      final callers = <String>[];
      for (final file in Directory(
        'lib',
      ).listSync(recursive: true).whereType<File>()) {
        if (!file.path.endsWith('.dart')) continue;
        final source = file.readAsStringSync();
        if (RegExp(
          r'SharePlus\.instance\.share\(|Share\.share\(',
        ).hasMatch(source)) {
          callers.add(file.path);
          expect(source, contains('productShareText('), reason: file.path);
          expect(
            source,
            isNot(contains("'price': product.price")),
            reason: '${file.path} still passes the price to the share text',
          );
        }
      }
      expect(callers, [
        'lib/features/product_detail/presentation/screens/product_detail_screen.dart',
      ]);
      final source = File(
        'lib/features/product_detail/presentation/screens/product_detail_screen.dart',
      ).readAsStringSync();
      expect(
        source,
        isNot(contains('https://')),
        reason: 'no hardcoded store URL',
      );
    },
  );
}
