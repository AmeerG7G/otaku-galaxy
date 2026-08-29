import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import '../errors/app_exception.dart';
import 'media_url.dart';

/// عميل الـ API المركزي على [Dio].
///
/// يقرأ التوكن تلقائياً عبر [tokenProvider] ويضيفه لرؤوس الطلبات،
/// وعند رفض الجلسة (401، أو 403 لحساب موقوف) ينظّف الجلسة عبر
/// [onUnauthorized] ثم يرمي [AppException].
/// جميع الإجابات تمر عبر المغلف الموحّد `{ success, data, message }`.
class ApiClient {
  ApiClient({
    AppConfig? config,
    this.tokenProvider,
    this.onUnauthorized,
    Dio? dio,
  }) : _dio =
           dio ??
           Dio(
             BaseOptions(
               baseUrl:
                   config?.effectiveApiBaseUrl ??
                   AppConfig.development.effectiveApiBaseUrl,
               connectTimeout: const Duration(seconds: 15),
               receiveTimeout: const Duration(seconds: 15),
               sendTimeout: const Duration(seconds: 15),
               headers: {
                 'Content-Type': 'application/json',
                 'Accept': 'application/json',
               },
             ),
           ) {
    // أصل الوسائط يتبع العنوان الفعلي لهذا العميل دائماً — انظر
    // [configureMediaOriginFromBaseUrl]. بدون هذا السطر يمكن أن ينجح الـAPI
    // وتفشل الصور وحدها حين يُضبط العنوان من خارج حقن الاعتماديات.
    configureMediaOriginFromBaseUrl(_dio.options.baseUrl);

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = tokenProvider?.call();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          _log(
            '▶ [$platformLabel] base=${_dio.options.baseUrl} '
            '${options.method} ${options.uri}',
          );
          handler.next(options);
        },
        onError: (error, handler) {
          final response = error.response;
          _log(
            '✖ [$platformLabel] DioException '
            'type=${error.type.name} '
            'error=${error.error} '
            'message="${error.message ?? 'no message'}" '
            'url=${error.requestOptions.uri} '
            'method=${error.requestOptions.method} '
            'status=${response?.statusCode} '
            'response=${response?.data}',
          );
          if (_endsSession(response?.statusCode, response?.data)) {
            onUnauthorized?.call();
          }
          handler.next(error);
        },
      ),
    );
  }


  /// هل تعني هذه الاستجابة أن الجلسة انتهت فعلاً؟
  ///
  /// 401 = رفض التوكن (منتهٍ، أو أُبطل بعد تغيير كلمة المرور).
  /// 403 مع `ACCOUNT_SUSPENDED` = الحساب أُوقف بعد إصدار التوكن؛ بدون هذه
  /// الحالة يبقى المستخدم «مسجّلاً» شكلاً بينما يُرفض كل طلب، فيرى أخطاءً
  /// متكررة بلا تفسير. أما 403 الأخرى (نقص صلاحية، رقم غير مفعَّل) فليست
  /// نهايةَ جلسة ولا يجوز أن تُخرجه.
  bool _endsSession(int? status, dynamic data) {
    if (status == 401) return true;
    if (status != 403) return false;
    if (data is! Map<String, dynamic>) return false;
    final error = data['error'];
    return error is Map && error['code'] == 'ACCOUNT_SUSPENDED';
  }

  /// وصف منصة التشغيل الحالية للتشخيص (ويب / أندرويد / آيفون / سطح مكتب).
  String get platformLabel {
    if (kIsWeb) return 'web';
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'android';
      case TargetPlatform.iOS:
        return 'ios';
      case TargetPlatform.linux:
        return 'linux';
      case TargetPlatform.macOS:
        return 'macos';
      case TargetPlatform.windows:
        return 'windows';
      case TargetPlatform.fuchsia:
        return 'fuchsia';
    }
  }

  /// عنوان قاعدة الـ API الفعلي داخل Dio — للطباعة في سجلات التشخيص.
  String get probeBaseUrl => _dio.options.baseUrl;

  /// سجل تطويري يظهر العنوان الكامل والخطأ الحقيقي قبل أي تعميم.
  void _log(String message) {
    if (kDebugMode) debugPrint(message);
  }

  final Dio _dio;

  /// مزوّد التوكن الحالي (يُقرأ عند كل طلب).
  String? Function()? tokenProvider;

  /// استدعاء عند انتهاء الجلسة (401).
  void Function()? onUnauthorized;

  /// ربط الجلسة بعد بناء العميل (لتجنب الاعتماد الدائري في DI).
  void attachAuth({
    String? Function()? tokenProvider,
    void Function()? onUnauthorized,
  }) {
    this.tokenProvider = tokenProvider ?? this.tokenProvider;
    this.onUnauthorized = onUnauthorized ?? this.onUnauthorized;
  }

  /// GET — يعيد حقل `data` من المغلف الموحّد.
  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _request(() => _dio.get<dynamic>(path, queryParameters: query));

  /// POST — يعيد حقل `data` من المغلف الموحّد.
  Future<dynamic> post(String path, {Object? body}) =>
      _request(() => _dio.post<dynamic>(path, data: body));

  /// PUT — يعيد حقل `data` من المغلف الموحّد.
  Future<dynamic> put(String path, {Object? body}) =>
      _request(() => _dio.put<dynamic>(path, data: body));

  /// PATCH — يعيد حقل `data` من المغلف الموحّد.
  Future<dynamic> patch(String path, {Object? body}) =>
      _request(() => _dio.patch<dynamic>(path, data: body));

  /// DELETE — يعيد حقل `data` من المغلف الموحّد.
  /// يرفع ملفاً واحداً كـ multipart ويعيد جسم الاستجابة.
  ///
  /// الغرض (`purpose`) يحدّد وجهة التخزين على الخادم؛ العميل مسموح له
  /// برفع صور التقييمات والصورة الشخصية فقط.
  Future<dynamic> uploadFile(
    String path, {
    required String filePath,
    required String purpose,
    String field = 'file',
  }) {
    return _request(() async {
      final form = FormData.fromMap({
        field: await MultipartFile.fromFile(filePath),
        'purpose': purpose,
      });
      return _dio.post<dynamic>(path, data: form);
    });
  }

  Future<dynamic> delete(String path) =>
      _request(() => _dio.delete<dynamic>(path));

  /// فحص اتصال مباشر بـ /health (بدون أي تعديل على معالجة الأخطاء).
  Future<HealthProbe> probeHealth() async {
    final base = _dio.options.baseUrl;
    final origin = base.endsWith('/api')
        ? base.substring(0, base.length - 4)
        : base;
    final url = '$origin/health';
    _log('▶ [$platformLabel] base=${_dio.options.baseUrl} GET $url (probe)');
    try {
      final response = await _dio.get<dynamic>(
        url,
        options: Options(
          headers: {'Accept': 'application/json'},
          extra: {'skipEnvelope': true},
        ),
      );
      return HealthProbe(
        url: url,
        reachable: true,
        statusCode: response.statusCode,
        rawBody: response.data?.toString(),
      );
    } on DioException catch (e) {
      return HealthProbe(
        url: url,
        reachable: false,
        dioType: e.type.name,
        dioError: e.error?.toString(),
        dioMessage: e.message,
        statusCode: e.response?.statusCode,
      );
    } catch (e) {
      return HealthProbe(url: url, reachable: false, rawError: '$e');
    }
  }

  Future<dynamic> _request(Future<Response<dynamic>> Function() send) async {
    try {
      final response = await send();
      return _unwrap(response.statusCode ?? 0, response.data);
    } on DioException catch (e) {
      if (_endsSession(e.response?.statusCode, e.response?.data)) {
        onUnauthorized?.call();
      }
      throw _toAppException(e);
    }
  }

  /// فكّ المغلف الموحّد: نجاح = `data`، فشل = [AppException] برسالة الخادم.
  dynamic _unwrap(int statusCode, dynamic data) {
    if (_endsSession(statusCode, data)) {
      onUnauthorized?.call();
    }
    if (data is! Map<String, dynamic>) {
      throw AppException(
        'استجابة غير متوقعة من الخادم',
        statusCode: statusCode,
      );
    }
    if (data['success'] == true) {
      return data['data'];
    }
    throw AppException(
      _messageFrom(data, statusCode),
      statusCode: statusCode,
      code: _codeFrom(data),
    );
  }

  /// رمز الخطأ من مغلف الخادم: `{ error: { code } }`.
  String? _codeFrom(Map<String, dynamic> data) {
    final error = data['error'];
    if (error is Map<String, dynamic>) {
      final code = error['code'];
      if (code is String && code.trim().isNotEmpty) return code;
    }
    return null;
  }

  String _messageFrom(Map<String, dynamic> data, int statusCode) {
    final message = data['message'];
    if (message is String && message.trim().isNotEmpty) return message;
    switch (statusCode) {
      case 400:
        return 'طلب غير صالح';
      case 401:
        return 'انتهت الجلسة — سجّل الدخول مجدداً';
      case 403:
        return 'لا تملك صلاحية تنفيذ هذا الإجراء';
      case 404:
        return 'غير موجود';
      case 409:
        return 'تعارض مع البيانات الحالية';
      case 429:
        return 'طلبات كثيرة جداً — حاول لاحقاً';
      default:
        return 'تعذر الاتصال بالخادم';
    }
  }

  AppException _toAppException(DioException error) {
    final response = error.response;
    if (response != null) {
      final data = response.data;
      final status = response.statusCode ?? 500;
      if (data is Map<String, dynamic>) {
        return AppException(
          _messageFrom(data, status),
          statusCode: status,
          code: _codeFrom(data),
        );
      }
      return AppException(
        'خطأ من الخادم (${response.statusCode})',
        statusCode: status,
      );
    }
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return AppException(
          'انتهت مهلة الاتصال — حاول مرة أخرى (${error.message ?? 'timeout'})',
        );
      case DioExceptionType.connectionError:
        return AppException(
          'تعذر الاتصال بالخادم — تحقق من الإنترنت '
          '(${error.message ?? 'connection error'})',
        );
      default:
        return AppException(error.message ?? 'حدث خطأ غير متوقع');
    }
  }
}

/// نتيجة فحص الاتصال بـ /health — تعرض الخطأ الخام دون ترجمة/إخفاء.
class HealthProbe {
  const HealthProbe({
    required this.url,
    required this.reachable,
    this.statusCode,
    this.rawBody,
    this.dioType,
    this.dioError,
    this.dioMessage,
    this.rawError,
  });

  final String url;
  final bool reachable;
  final int? statusCode;
  final String? rawBody;
  final String? dioType;
  final String? dioError;
  final String? dioMessage;
  final String? rawError;

  @override
  String toString() {
    if (reachable) {
      return 'REACHABLE: $url -> HTTP ${statusCode ?? '?'} $rawBody';
    }
    return 'UNREACHABLE: $url -> '
        'DioException[${dioType ?? '?'}] '
        'error=${dioError ?? '?'} '
        'message=${dioMessage ?? '?'} '
        'status=${statusCode ?? '?'} '
        'raw=${rawError ?? '?'}';
  }
}
