// أيقونة البحث الموحّدة، وأيقونات التواصل التي يضبطها المسؤول.
//
// موضوعان يجمعهما شيء واحد: كلاهما «أيقونة يجب أن تأتي من مصدرٍ واحد» —
// الأولى من ثابتٍ في نظام التصميم، والثانية من لوحة التحكم لا من الحزمة.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/managed_artwork.dart';

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

  group('أيقونات التواصل المُدارة', () {
    test('[CRITICAL] للمنصات الثلاث فتحاتٌ يعرفها التطبيق', () {
      // بلا مفتاحٍ في `VisualSlots` لا سبيل للوحة أن تصل إلى الأيقونة.
      expect(VisualSlots.socialTiktok, 'social_tiktok');
      expect(VisualSlots.socialInstagram, 'social_instagram');
      expect(VisualSlots.socialWhatsapp, 'social_whatsapp');
      expect(
        VisualSlots.all,
        containsAll(<String>[
          VisualSlots.socialTiktok,
          VisualSlots.socialInstagram,
          VisualSlots.socialWhatsapp,
        ]),
      );
    });

    testWidgets('[CRITICAL] بلا أيقونة مضبوطة تظهر البديلة لا فراغ', (
      tester,
    ) async {
      // حاوية الاعتماديات غير مهيّأة هنا، وهو بالضبط أسوأ حالة: يجب أن
      // يبقى الصفّ مرئياً لا مربّعاً مكسوراً.
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ManagedArtwork.orWidget(
              slot: VisualSlots.socialTiktok,
              fallback: Icon(Icons.music_note_rounded, size: 17),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.byIcon(Icons.music_note_rounded), findsOneWidget);
      expect(tester.takeException(), isNull);
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
