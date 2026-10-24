plugins {
    id("com.igorwojda.showcase.convention.test.library")
}

android {
    namespace = "com.igorwojda.showcase.konsist.test"
}

dependencies {
    implementation(projects.feature.base)

    testImplementation(projects.library.testUtils)
    testImplementation(libs.bundles.test)
    testImplementation(libs.konsist)
    testImplementation(libs.viewmodel.ktx)
}

tasks.withType<Test>().configureEach {
    systemProperty("showcase.projectRoot", rootProject.projectDir.absolutePath)
    // Konsist scans other modules too; their source edits must invalidate these results.
    inputs.files(
        rootProject.fileTree(rootProject.projectDir) {
            include("**/*.kt")
            exclude("**/build/**", "**/.gradle/**", "**/.tmp/**", "**/node_modules/**")
        }.files,
    ).withPropertyName("architectureSources").withPathSensitivity(PathSensitivity.RELATIVE)
}
