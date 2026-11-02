import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// ── توقيع الإصدار (خطة الإنتاج، 2026-11-01) ──
//
// مفتاح الرفع خارج المستودع كلياً: `android/key.properties` (في .gitignore)
// يحمل مسار المخزن واسم المفتاح فقط، وكلمتا المرور تأتيان من بيئة أمر
// البناء وحده — لا ملف ولا سجلّ يحملهما:
//
//   storeFile=/home/<user>/Passwords/otaku-galaxy-upload.jks
//   keyAlias=upload
//
//   OG_UPLOAD_STORE_PASSWORD=… OG_UPLOAD_KEY_PASSWORD=… \
//     flutter build appbundle --flavor prod -t lib/main_prod.dart
//
// [CRITICAL] إصدار الإنتاج لا يُوقَّع بمفتاح التطوير أبداً: بلا المفتاح يفشل
// البناء برسالة صريحة بدل أن يخرج ملفٌّ موقّع بمفتاح debug يرفضه Google Play
// أو يُثبَّت على أجهزة الزبائن بهويةٍ لا يمكن تحديثها.
val uploadKeyFile = rootProject.file("key.properties")
val uploadKey = Properties().apply {
    if (uploadKeyFile.isFile) uploadKeyFile.inputStream().use { load(it) }
}
val uploadStorePassword: String? = System.getenv("OG_UPLOAD_STORE_PASSWORD")
val uploadKeyPassword: String? = System.getenv("OG_UPLOAD_KEY_PASSWORD")
val uploadKeyMissing: String? = when {
    !uploadKeyFile.isFile -> "android/key.properties غير موجود"
    uploadKey.getProperty("storeFile").isNullOrBlank() -> "storeFile فارغ في key.properties"
    uploadKey.getProperty("keyAlias").isNullOrBlank() -> "keyAlias فارغ في key.properties"
    !file(uploadKey.getProperty("storeFile")).isFile -> "مخزن المفاتيح المذكور في key.properties غير موجود"
    uploadStorePassword.isNullOrEmpty() -> "OG_UPLOAD_STORE_PASSWORD غير مضبوط"
    uploadKeyPassword.isNullOrEmpty() -> "OG_UPLOAD_KEY_PASSWORD غير مضبوط"
    else -> null
}

android {
    namespace = "com.otakugalaxy.otaku_galaxy"
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // flutter_local_notifications (الإشعارات الفورية، STEP 64) يشترطه.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.otakugalaxy.otaku_galaxy"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // `resValue` معطّل افتراضياً في هذه النسخة من AGP؛ نفعّله كي يحصل كل
    // نكهة على اسم تطبيق خاص بها (`app_name`).
    buildFeatures {
        resValues = true
    }

    // ── نكهات البيئات ──
    //
    // [CRITICAL] معرّف الإنتاج يبقى كما هو: com.otakugalaxy.otaku_galaxy
    //
    // تغييرُه يُنشئ تطبيقاً جديداً في Google Play ويقطع التحديثات عن كل من
    // ثبّت النسخة الحالية. لذلك يأخذ الإنتاج المعرّف الأصلي بلا لاحقة،
    // بينما تُضاف لاحقة للتطوير والاختبار وحدهما ليتعايشا معه على الجهاز.
    flavorDimensions += "env"

    signingConfigs {
        if (uploadKeyMissing == null) {
            create("upload") {
                storeFile = file(uploadKey.getProperty("storeFile"))
                storePassword = uploadStorePassword
                keyAlias = uploadKey.getProperty("keyAlias")
                keyPassword = uploadKeyPassword
            }
        }
    }

    productFlavors {
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "Otaku Galaxy DEV")
            signingConfig = signingConfigs.getByName("debug")
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            resValue("string", "app_name", "Otaku Galaxy STAGING")
            // نسخ الاختبار تبقى موقّعة بمفتاح التطوير كما كانت: معرّفها مختلف
            // (`.staging`) فلا تختلط بتطبيق الإنتاج ولا تُرفع إلى Play.
            signingConfig = signingConfigs.getByName("debug")
        }
        create("prod") {
            dimension = "env"
            // بلا لاحقة عمداً — هوية التطبيق المنشور.
            resValue("string", "app_name", "Otaku Galaxy")
            // مفتاح الرفع وحده. نوع البناء debug يبقى على مفتاح التطوير لأن
            // توقيع نوع البناء يتقدّم على توقيع النكهة (`flutter run --flavor prod`).
            if (uploadKeyMissing == null) signingConfig = signingConfigs.getByName("upload")
        }
    }

    // لا `signingConfig` على نوع release: لو وُضع هنا لتقدّم على النكهة
    // ووقّع الإنتاج بمفتاح التطوير — وهو ما كان يحدث قبل هذا التغيير.
}

// يفشل أي بناء لإصدار الإنتاج قبل أن يبدأ إن غاب المفتاح. على مستوى المهمة لا
// الإعداد، فبناء dev/staging لا يتأثّر بغياب المفتاح.
tasks.matching { it.name == "preProdReleaseBuild" }.configureEach {
    doFirst {
        if (uploadKeyMissing != null) {
            throw GradleException(
                "إصدار الإنتاج يحتاج مفتاح الرفع ولن يُوقَّع بمفتاح التطوير: $uploadKeyMissing.",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
