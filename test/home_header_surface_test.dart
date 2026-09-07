// ترويسة الرئيسية — بلا سطحٍ محيط.
//
// [CRITICAL] هذا اختبار **بكسلي** لا هيكلي. السطح الذي كان هنا لم يكن
// حاويةً ملوّنة يكشفها البحث في الشيفرة: كان هالةً دائرية ناعمة موضوعةً
// خارج الحدود، تقصّها الحاوية الأم بـ`Clip.hardEdge` — فتتحوّل عند الحافة
// إلى **مستطيلٍ شفافٍ مائل للبنفسجي** يحيط بالترويسة كلها. و
// `decoration: BoxDecoration()` الفارغة كانت تُوهم بالعكس تماماً.
//
// لذلك لا يكفي التأكد من غياب `Container` أو `Card`: الحكم الوحيد الصادق
// هو قراءة البكسلات المرسومة فعلاً.

import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart' show FontLoader;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/auth/data/datasources/auth_local_storage.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/auth_session.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/user.dart';
import 'package:otaku_galaxy/features/auth/domain/repositories/auth_repository.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/change_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/forgot_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/get_me_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/login_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/register_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/reset_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/send_otp_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/update_profile_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/verify_otp_usecase.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/home/presentation/screens/home_screen.dart';
import 'package:otaku_galaxy/features/notifications/domain/entities/app_notification.dart';
import 'package:otaku_galaxy/features/notifications/domain/repositories/notification_repository.dart';
import 'package:otaku_galaxy/features/notifications/presentation/cubit/notifications_cubit.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_page.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_sort.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_home_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_products_usecase.dart';

const _user = User(
  id: 'u1',
  username: 'مدقق',
  phone: '+9647701234567',
  role: 'customer',
);

/// مستودع يبقي طلب الرئيسية معلّقاً.
///
/// [CRITICAL] التعليق مقصود: يُبقي `FutureBuilder` في حالة الانتظار فلا
/// يُبنى جسم الشاشة، وتُقاس الترويسة وحدها. ولولاه لاختلط الحكم بعطبٍ
/// آخر لا صلة له بالترويسة — تجاوزُ تخطيطٍ حقيقي في بطاقة العروض
/// (`home_compositions.dart`)، مقيسٌ ومُبلَّغ عنه على حدة.
class _EmptyProducts implements ProductRepository {
  @override
  Future<HomeData> fetchHome() => Completer<HomeData>().future;
  @override
  Future<ProductPage> fetchProducts({
    int page = 1,
    int limit = 20,
    String? categoryId,
    String? subcategoryId,
  }) async => const ProductPage(items: [], hasMore: false);
  @override
  Future<List<Category>> fetchCategories() async => const [];
  @override
  Future<List<Product>> fetchCategoryProducts(
    String categoryId, {
    ProductSort? sort,
  }) async => const [];
  @override
  Future<ProductPage> searchProducts(
    String query, {
    int page = 1,
    int limit = 20,
    ProductSort? sort,
  }) async => const ProductPage(items: [], hasMore: false);
  @override
  Future<Product> fetchProductDetails(String id) async =>
      throw UnimplementedError();
}

class _NoNotifications implements NotificationRepository {
  @override
  Future<List<AppNotification>> fetchAll() async => const [];
  @override
  Future<void> markAllRead() async {}
  @override
  Future<void> markRead(String id) async {}
}

class _StubAuthRepository implements AuthRepository {
  @override
  Future<User> me() async => _user;
  @override
  Future<AuthSession> login(String phone, String password) async =>
      const AuthSession(token: 't', user: _user);
  @override
  Future<void> register({
    required String username,
    required String phone,
    required String password,
    required String gender,
  }) async {}
  @override
  Future<AuthSession> verifyOtp(String phone, String code) async =>
      const AuthSession(token: 't', user: _user);
  @override
  Future<void> sendOtp(String phone) async {}
  @override
  Future<void> forgotPassword(String phone) async {}
  @override
  Future<void> resetPassword(String p, String c, String n) async {}
  @override
  Future<User> updateProfile({
    String? username,
    String? avatarUrl,
    bool clearAvatar = false,
    String? gender,
  }) async => _user;
  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {}
}

class _InMemoryAuthStorage implements AuthLocalStorage {
  @override
  bool get isLoggedIn => false;
  @override
  String? get token => null;
  @override
  String? getUserJson() => null;
  @override
  Future<void> load() async {}
  @override
  Future<void> saveSession(String token, String userJson) async {}
  @override
  Future<void> updateUser(String userJson) async {}
  @override
  Future<void> logout() async {}
}

AuthCubit _authCubit() {
  final repo = _StubAuthRepository();
  return AuthCubit(
    localStorage: _InMemoryAuthStorage(),
    loginUsecase: LoginUsecase(repo),
    registerUsecase: RegisterUsecase(repo),
    sendOtpUsecase: SendOtpUsecase(repo),
    forgotPasswordUsecase: ForgotPasswordUsecase(repo),
    verifyOtpUsecase: VerifyOtpUsecase(repo),
    resetPasswordUsecase: ResetPasswordUsecase(repo),
    getMeUsecase: GetMeUsecase(repo),
    updateProfileUsecase: UpdateProfileUsecase(repo),
    changePasswordUsecase: ChangePasswordUsecase(repo),
  );
}

final _boundary = GlobalKey();

Future<void> _pumpHome(WidgetTester tester, {required bool dark}) async {
  const size = Size(412, 892);
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final products = _EmptyProducts();
  await tester.pumpWidget(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: FetchHomeUsecase(products)),
        RepositoryProvider.value(value: FetchProductsUsecase(products)),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: _authCubit()),
          BlocProvider<NotificationsCubit>.value(
            value: NotificationsCubit(_NoNotifications()),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: dark ? ThemeMode.dark : ThemeMode.light,
          // نفس تهيئة التطبيق: العربية مع مندوبي الترجمة، فيصير الاتجاه
          // RTL كما في الإنتاج لا LTR كما يفترض الاختبار بلا تهيئة.
          locale: const Locale('ar'),
          supportedLocales: const [Locale('ar')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: RepaintBoundary(
            key: _boundary,
            child: const Scaffold(body: HomeScreen()),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

/// يقرأ بكسلات الشاشة المرسومة فعلاً.
Future<(ByteData, int)> _pixels(WidgetTester tester) async {
  final boundary =
      _boundary.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  late ByteData data;
  late int width;
  await tester.runAsync(() async {
    final image = await boundary.toImage();
    width = image.width;
    data = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
  });
  return (data, width);
}

int _pixelAt(ByteData data, int width, int x, int y) {
  final offset = (y * width + x) * 4;
  return data.getUint32(offset);
}

/// يحمّل خطوط المشروع الحقيقية داخل بيئة الاختبار.
///
/// [CRITICAL] بدونها يرسم `flutter test` بخطٍّ بديل كل محارفه بعرضٍ واحد،
/// فتُقاس النصوص العربية بعرضٍ لا علاقة له بالواقع ويُبلَّغ عن تجاوزات
/// تخطيطٍ لا وجود لها في التطبيق. أي حكمٍ بكسليٍّ على شاشةٍ فيها نصّ يجب
/// أن يقع بالخط الحقيقي.
Future<void> _loadProjectFonts() async {
  for (final family in ['Tajawal', 'Cairo']) {
    final loader = FontLoader(family);
    final dir = Directory('fonts');
    for (final file in dir.listSync().whereType<File>()) {
      if (!file.path.contains(family)) continue;
      loader.addFont(
        file.readAsBytes().then((b) => ByteData.view(Uint8List.fromList(b).buffer)),
      );
    }
    await loader.load();
  }
}

void main() {
  setUpAll(_loadProjectFonts);

  for (final dark in [false, true]) {
    final mode = dark ? 'داكن' : 'فاتح';

    testWidgets('[CRITICAL] لا مستطيل محيط بترويسة الرئيسية — $mode', (
      tester,
    ) async {
      await _pumpHome(tester, dark: dark);
      final (data, width) = await _pixels(tester);

      // [CRITICAL] الشريط المقيس هو الفجوة الرأسية **بين** صفّ الهوية
      // وبطاقة البحث (١٥ نقطة، y ≈ ٦٥‑٧٩). اختيارُه ليس اعتباطاً:
      //
      // - لا عنصر واجهة فيه، فأي لون غير الخلفية هناك سطحٌ محيط لا مكوّن.
      // - وهو **داخل** المستطيل الذي كان يرسمه العطب: الهالة كانت مقصوصة
      //   بحدود `Stack` (تبدأ عند الحشوة ١٨ لا عند حافة الشاشة)، فالشريط
      //   العلوي فوق الـ١٨ كان نظيفاً في الحالتين ولا يميّز بينهما.
      //
      // مقيسٌ صفّاً صفّاً: y ٧١‑٨٢ خاليةٌ تماماً من عناصر الواجهة (صفّ
      // الهوية ينتهي عند ٧٠، وبطاقة البحث تبدأ عند ٨٣). وبإعادة الهالة
      // والقصّ يحمل هذا الشريط عشرات البكسلات الملوّنة؛ وبعد إزالتهما صفراً.
      final background = _pixelAt(data, width, 0, 0);
      final tinted = <String>[];
      for (var y = 71; y <= 82; y += 1) {
        for (var x = 0; x < width; x += 2) {
          if (_pixelAt(data, width, x, y) != background) {
            tinted.add('($x,$y)=${_pixelAt(data, width, x, y).toRadixString(16)}');
          }
        }
      }

      expect(
        tinted,
        isEmpty,
        reason:
            'الفجوة بين صفّ الهوية وبطاقة البحث يجب أن تكون خلفيةً خالصة — '
            'أي بكسل ملوّن فيها يعني سطحاً أو تلويناً يحيط بالترويسة',
      );

      // والشريط العلوي (فوق الحشوة) خلفيةٌ خالصة كذلك.
      for (var y = 0; y < 17; y += 4) {
        for (var x = 0; x < width; x += 3) {
          expect(_pixelAt(data, width, x, y), background, reason: 'أعلى ($x,$y)');
        }
      }
    });

    testWidgets('العناصر الأربعة باقية كما هي — $mode', (tester) async {
      await _pumpHome(tester, dark: dark);

      // الشعار، اسم المتجر، البحث، الإشعارات — لا يُزال أيٌّ منها.
      expect(find.byType(OtakuStoreLogoSimple), findsOneWidget);
      expect(find.text('مجرة الأوتاكو'), findsOneWidget);
      expect(find.text('أهلاً بك في'), findsOneWidget);
      expect(find.byTooltip('الإشعارات'), findsOneWidget);
      expect(find.text('ابحث عن منتجك المفضّل…'), findsOneWidget);
    });
  }

  testWidgets('سطحا البحث والإشعارات — زرّان مستقلّان يبقيان', (tester) async {
    // المطلوب إزالة السطح المحيط بالمجموعة، لا أسطح الأزرار نفسها: هي
    // ما يجعل البحث والإشعارات يبدوان قابلين للنقر.
    await _pumpHome(tester, dark: false);

    final bell = tester.getSize(find.byTooltip('الإشعارات'));
    expect(bell.width, 42, reason: 'مقاس الجرس في المرجع ٤٢×٤٢');
    expect(bell.height, 42);

    // بطاقة البحث ما تزال سطحاً قابلاً للنقر يمتدّ بعرض الترويسة.
    final cta = tester.getSize(find.text('ابحث عن منتجك المفضّل…'));
    expect(cta.width, greaterThan(0));
  });

  testWidgets('الترتيب أفقياً: الهوية في جهة البداية والأزرار في النهاية', (
    tester,
  ) async {
    await _pumpHome(tester, dark: false);

    // RTL: البداية يمين. الشعار يمين الجرس.
    final logo = tester.getRect(find.byType(OtakuStoreLogoSimple));
    final bell = tester.getRect(find.byTooltip('الإشعارات'));
    expect(logo.center.dx, greaterThan(bell.center.dx));

    // البحث تحت صفّ الهوية لا بجانبه.
    final search = tester.getRect(find.text('ابحث عن منتجك المفضّل…'));
    expect(search.top, greaterThan(logo.bottom));
  });
}
