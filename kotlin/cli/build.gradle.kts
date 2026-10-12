plugins { kotlin("jvm"); application }
kotlin { jvmToolchain(17) }
dependencies { implementation(project(":core")); implementation("com.google.code.gson:gson:2.11.0") }
application { mainClass.set("adipredictor.cli.MainKt"); applicationDefaultJvmArgs = listOf("-Xmx768m", "-Dfile.encoding=UTF-8") }
tasks.named<JavaExec>("run") { workingDir = rootProject.projectDir }
