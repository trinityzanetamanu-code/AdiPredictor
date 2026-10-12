plugins { kotlin("jvm") }
kotlin { jvmToolchain(17) }
dependencies { testImplementation("com.google.code.gson:gson:2.11.0"); testImplementation(kotlin("test", "2.1.20")); testImplementation("org.junit.jupiter:junit-jupiter:5.11.4") }
tasks.test { useJUnitPlatform() }
