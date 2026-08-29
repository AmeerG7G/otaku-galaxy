plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.otakugalaxy.otaku_galaxy"
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
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

    productFlavors {
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "Otaku Galaxy DEV")
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            resValue("string", "app_name", "Otaku Galaxy STAGING")
        }
        create("prod") {
            dimension = "env"
            // بلا لاحقة عمداً — هوية التطبيق المنشور.
            resValue("string", "app_name", "Otaku Galaxy")
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
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
