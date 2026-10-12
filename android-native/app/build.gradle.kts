plugins { id("com.android.application"); kotlin("android"); id("org.jetbrains.kotlin.plugin.compose") }
val robolectricSdk by configurations.creating
val robolectricCompileSdk by configurations.creating
val prepareRobolectricSdk by tasks.registering(Copy::class) {
    from(robolectricSdk, robolectricCompileSdk); into(layout.buildDirectory.dir("robolectric-sdk"))
}
android {
    namespace = "com.adipredictor.app"
    compileSdk = 35
    buildToolsVersion = "35.0.0"
    defaultConfig { applicationId = "com.adipredictor.app"; minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "4A-preview"; testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner" }
    buildTypes { release { isMinifyEnabled = false; signingConfig = null } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
    lint { abortOnError = true; warningsAsErrors = false }
    testOptions { unitTests.isIncludeAndroidResources = true; unitTests.all {
        it.dependsOn(prepareRobolectricSdk)
        it.systemProperty("repo.root", rootProject.projectDir.parentFile.absolutePath)
        it.systemProperty("robolectric.offline", "true")
        it.systemProperty("robolectric.dependency.dir", layout.buildDirectory.dir("robolectric-sdk").get().asFile.absolutePath)
    } }
}
dependencies {
    robolectricSdk("org.robolectric:android-all-instrumented:14-robolectric-10818077-i7") { isTransitive = false }
    robolectricCompileSdk("org.robolectric:android-all-instrumented:15-robolectric-12650502-i7") { isTransitive = false }
    implementation(project(":data"))
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.compose.material3:material3:1.3.1")
    implementation("androidx.compose.ui:ui-tooling-preview:1.7.5")
    implementation("com.caverock:androidsvg-aar:1.4")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.compose.ui:ui-test-junit4:1.7.5")
    testImplementation("androidx.test:core-ktx:1.6.1")
    debugImplementation("androidx.compose.ui:ui-test-manifest:1.7.5")
}
val bundlePublic by tasks.registering(Sync::class) {
    from(rootProject.projectDir.parentFile.resolve("public")) {
        include("data/*.json", "predictions/**", "app-release.json")
    }
    into(layout.buildDirectory.dir("generated/assets/public"))
}
android.sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/assets"))
tasks.named("preBuild") { dependsOn(bundlePublic) }
