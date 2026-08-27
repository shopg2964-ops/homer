plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android { namespace = "com.summitjambo.mesh"; compileSdk = 35
    defaultConfig { applicationId = "com.summitjambo.mesh"; minSdk = 29; targetSdk = 35; versionCode = 1; versionName = "1.0.0" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.ui:ui:1.7.8")
    implementation("androidx.compose.ui:ui-tooling-preview:1.7.8")
    implementation("androidx.compose.material3:material3:1.3.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("io.livekit:livekit-android:2.28.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
}
