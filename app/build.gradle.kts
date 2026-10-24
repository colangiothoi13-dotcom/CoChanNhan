import com.igorwojda.showcase.buildlogic.ext.buildConfigFieldFromGradleProperty

plugins {
    id("com.igorwojda.showcase.convention.application")
}

android {
    namespace = "com.igorwojda.showcase.app"

    defaultConfig {
        applicationId = "com.igorwojda.showcase"

        versionCode = 1
        versionName = "0.0.1" // SemVer (Major.Minor.Patch)

        buildConfigFieldFromGradleProperty(project, "apiBaseUrl")
        buildConfigFieldFromGradleProperty(project, "apiToken")
        buildConfigField("String", "GRADLE_SUPABASE_URL", "\"${providers.gradleProperty("supabaseUrl").orElse("").get()}\"")
        buildConfigField("String", "GRADLE_SUPABASE_ANON_KEY", "\"${providers.gradleProperty("supabaseAnonKey").orElse("").get()}\"")
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            proguardFiles("proguard-android.txt", "proguard-rules.pro")
        }
    }
}

dependencies {
    implementation(platform(libs.supabase.bom))
    implementation(libs.bundles.supabase)
    implementation(libs.ktor.client.okhttp)
    // "projects." Syntax utilizes Gradle TYPESAFE_PROJECT_ACCESSORS feature
    implementation(projects.feature.base)
    implementation(projects.feature.album)
    implementation(projects.feature.settings)
    implementation(projects.feature.favourite)
}

val buildCoTienLoWeb = tasks.register<Exec>("buildCoTienLoWeb") {
    group = "build"
    description = "Builds and synchronizes the offline Co Tien Lo web game. Run npm ci in cotienlo-game first."
    val gameDirectory = rootProject.layout.projectDirectory.dir("cotienlo-game")
    workingDir(gameDirectory)
    inputs.dir(gameDirectory.dir("src"))
    inputs.dir(gameDirectory.dir("scripts"))
    inputs.files(
        gameDirectory.file("index.html"),
        gameDirectory.file("package.json"),
        gameDirectory.file("package-lock.json"),
        gameDirectory.file("tsconfig.json"),
        gameDirectory.file("vite.config.ts"),
    )
    outputs.dir(layout.projectDirectory.dir("src/main/assets/cotienlo"))
    if (System.getProperty("os.name").startsWith("Windows", ignoreCase = true)) {
        commandLine("cmd", "/d", "/c", "npm.cmd", "run", "build:android")
    } else {
        commandLine("npm", "run", "build:android")
    }
}

tasks.named("preBuild") {
    dependsOn(buildCoTienLoWeb)
}
