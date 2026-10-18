import java.time.Duration

plugins { id("com.android.application"); kotlin("android"); id("org.jetbrains.kotlin.plugin.compose") }
val robolectricSdk by configurations.creating
val robolectricCompileSdk by configurations.creating
val prepareRobolectricSdk by tasks.registering(Copy::class) {
    from(robolectricSdk, robolectricCompileSdk); into(layout.buildDirectory.dir("robolectric-sdk"))
}
val candidate = providers.environmentVariable("ANDROID_BUILD_CHANNEL").orNull == "release-candidate"
val candidateCode = providers.environmentVariable("ANDROID_VERSION_CODE").orNull?.toIntOrNull()
val candidateName = providers.environmentVariable("ANDROID_VERSION_NAME").orNull
val sourceCommit = providers.environmentVariable("ANDROID_SOURCE_COMMIT").orNull ?: "LOCAL_UNVERIFIED"
val keystorePath = providers.environmentVariable("ANDROID_KEYSTORE_PATH").orNull
if (candidate) {
    require(candidateCode?.let { it in 100142..2100000000 } == true) { "Invalid reserved candidate versionCode" }
    require(candidateName?.matches(Regex("[0-9A-Za-z.+_-]+-native-rc[0-9]+")) == true) { "Invalid native RC versionName" }
    require(sourceCommit.matches(Regex("[0-9a-f]{40}"))) { "Candidate requires exact source SHA" }
    require(!keystorePath.isNullOrBlank() && listOf("ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD").all { !System.getenv(it).isNullOrBlank() }) { "Protected signing unavailable" }
}
android {
    namespace = "com.adipredictor.app"
    compileSdk = 35
    buildToolsVersion = "35.0.0"
    defaultConfig {
        applicationId = "com.adipredictor.app"; minSdk = 26; targetSdk = 35
        versionCode = if (candidate) candidateCode!! else 1
        versionName = if (candidate) candidateName!! else "4B-validation"
        buildConfigField("String", "BUILD_CHANNEL", "\"${if (candidate) "release-candidate" else "validation"}\"")
        buildConfigField("String", "SOURCE_COMMIT", "\"$sourceCommit\"")
        buildConfigField("boolean", "UPDATE_CHANNEL_READY", "false")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    if (candidate) signingConfigs.create("protectedRelease") {
        storeFile = file(keystorePath!!)
        storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
        keyAlias = System.getenv("ANDROID_KEY_ALIAS")
        keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
    }
    buildTypes { release {
        isDebuggable = false; isMinifyEnabled = false
        signingConfig = if (candidate) signingConfigs.getByName("protectedRelease") else null
    } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
    lint { abortOnError = true; warningsAsErrors = false }
    testOptions { unitTests.isIncludeAndroidResources = true; unitTests.all {
        it.timeout.set(Duration.ofMinutes(6))
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
// Compile the actual candidate-only SAF writer into the test classpath only.
// Capacitor and its exporter are never part of the native application's main UI.
val prepareLegacyExportContract by tasks.registering(Copy::class) {
    from(rootProject.projectDir.parentFile.resolve("scripts/android/LegacyExportDocument.java"))
    into(layout.buildDirectory.dir("generated/legacy-export-test"))
}
android.sourceSets["test"].java.srcDir(layout.buildDirectory.dir("generated/legacy-export-test"))
tasks.named("preBuild") { dependsOn(prepareLegacyExportContract) }
