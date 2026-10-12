plugins { kotlin("jvm"); application }
kotlin { jvmToolchain(17) }
dependencies {
    implementation(project(":core")); implementation(project(":io")); implementation("com.google.code.gson:gson:2.11.0")
    testImplementation(kotlin("test", "2.1.20"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.4")
}
application { mainClass.set("adipredictor.production.MainKt"); applicationDefaultJvmArgs = listOf("-Xmx768m", "-Dfile.encoding=UTF-8") }
tasks.test { useJUnitPlatform() }
