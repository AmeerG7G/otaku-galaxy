// أيقونة البحث الموحّدة، وأيقونات التواصل الثابتة.
//
// موضوعان يجمعهما شيء واحد: كلاهما «أيقونة يجب أن تأتي من مصدرٍ واحد» —
// الأولى من ثابتٍ في نظام التصميم، والثانية أصلٌ ثابت في التطبيق لا فتحةٌ
// تُدار من اللوحة (قرار 2026-09-15).

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';

void main() {
  group('أيقونة البحث الكلاسيكية', () {
    test('[CRITICAL] الثابت المشترك هو عدسة Material القياسية', () {
      // `Icons.search` لا `Icons.search_rounded`: الأولى هي الشكل الذي
      // يعرفه المستخدم كـ«بحث» في كل تطبيق.
      expect(AppIcons.search, Icons.search);
    });

    test('[CRITICAL] لا أيقونة بحث مكتوبة حرفياً خارج الثابت المشترك', () {
      // هذا ما يجعل التوحيد يصمد: أي موضع جديد يكتب `Icons.search*` مباشرةً
      // يعيد التطبيق إلى أيقونتَي بحث مختلفتين، ويسقط هنا قبل أن يُدمج.
      final offenders = <String>[];
      for (final file in Directory('lib').listSync(recursive: true)) {
        if (file is! File || !file.path.endsWith('.dart')) continue;
        // ملف الثوابت نفسه هو المكان الوحيد المسموح.
        if (file.path.endsWith('tokens/app_icons.dart')) continue;
        final lines = file.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          final line = lines[i];
          if (line.trimLeft().startsWith('//')) continue;
          // الحدّ قبل `Icons` ضروري: بدونه يطابق النمط `AppIcons.search`
          // نفسه — أي أن الاختبار كان سيبلّغ عن الحلّ بوصفه العطب.
          if (RegExp(r'(?<![A-Za-z])Icons\.(search|manage_search|travel_explore)\b')
              .hasMatch(line)) {
            offenders.add('${file.path}:${i + 1}');
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'استعمل AppIcons.search بدل كتابة الأيقونة حرفياً',
      );
    });

    testWidgets('الأيقونة تُرسم بمقاسها ولونها كما كانت', (tester) async {
      // التوحيد لا يجوز أن يغيّر المقاس أو اللون أو مساحة اللمس.
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Icon(AppIcons.search, size: 17, color: Colors.white),
          ),
        ),
      );
      final icon = tester.widget<Icon>(find.byType(Icon));
      expect(icon.icon, Icons.search);
      expect(icon.size, 17);
      expect(icon.color, Colors.white);
    });
  });

  group('أيقونات التواصل — أصولٌ ثابتة لا فتحات', () {
    // [PRODUCT] قرار 2026-09-15: تيك توك وإنستغرام وواتساب ليست شخصياتٍ
    // تُبدَّل من اللوحة. كانت فتحاتٍ (الهجرة ٠٣٢) وأُسقطت (الهجرة ٠٥٣)؛ الرابط
    // وحده يُدار من إعدادات المتجر. `visual-catalogue.test.ts` في الخادم
    // يحرس غيابها من القاعدة، وهذا يحرس غيابها من التطبيق.
    test('[CRITICAL] لا مفتاح فتحة لأي منصّة تواصل', () {
      expect(VisualSlots.all.where((k) => k.startsWith('social_')), isEmpty);
      expect(VisualSlots.all, isNot(contains('social_tiktok')));
      expect(VisualSlots.all, isNot(contains('social_instagram')));
      expect(VisualSlots.all, isNot(contains('social_whatsapp')));
    });

    test('[CRITICAL] شاشة الحساب ترسم أيقونات التواصل ثابتةً لا عبر رسمٍ مُدار', () {
      final source = File('lib/features/account/presentation/screens/account_screen.dart')
          .readAsStringSync();
      final socials = source.substring(
        source.indexOf('Widget _buildSocials'),
        source.indexOf('Future<void> _addBirthday'),
      );
      expect(socials, contains('Icons.music_note_rounded'));
      expect(socials, contains('Icons.camera_alt_outlined'));
      expect(socials, contains('Icons.chat_bubble_outline'));
      // لا `ManagedArtwork` ولا `VisualSlots` في صفوف التواصل.
      final rows = source.substring(source.indexOf('class _SocialRow'));
      expect(rows, isNot(contains('ManagedArtwork')));
      expect(rows, isNot(contains('VisualSlots')));
      expect(socials, isNot(contains('VisualSlots')));
    });

    test('ولا تُتاح نسخة `CharacterArtwork` ببديلٍ من الودجات — كل موضعٍ له أصل مضمَّن', () {
      final source = File('lib/features/visuals/presentation/character_artwork.dart').readAsStringSync();
      expect(source, isNot(contains('CharacterArtwork.orWidget(')));
      expect(source, isNot(contains('fallbackWidget')));
    });

    test('لا رابط صورة أيقونة مخبوز في الشيفرة', () {
      // الأيقونة تأتي من الخادم؛ أي رابط **صورة** مكتوب في `lib/` يعني
      // أصلاً لا يستطيع المسؤول تغييره.
      //
      // النمط محصور بروابط الصور عمداً: `https://wa.me/<رقم>` في
      // `account_screen` ليس أيقونةً مخبوزة، بل تحويلُ رقمِ واتساب الذي
      // ضبطه المسؤول إلى رابط محادثة — وحجبه كان سيكسر ميزةً قائمة.
      final offenders = <String>[];
      final hardcoded = RegExp(
        r'https?://\S+\.(png|jpe?g|svg|webp|gif)',
        caseSensitive: false,
      );
      for (final file in Directory('lib').listSync(recursive: true)) {
        if (file is! File || !file.path.endsWith('.dart')) continue;
        final lines = file.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].trimLeft().startsWith('//')) continue;
          if (hardcoded.hasMatch(lines[i])) {
            offenders.add('${file.path}:${i + 1}');
          }
        }
      }
      expect(offenders, isEmpty);
    });
  });
}
