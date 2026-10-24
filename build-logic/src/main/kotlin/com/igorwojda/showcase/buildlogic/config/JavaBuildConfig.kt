package com.igorwojda.showcase.buildlogic.config

import com.igorwojda.showcase.buildlogic.ext.versions
import org.gradle.api.JavaVersion
import org.gradle.api.Project

/** Resolves the owning project's catalog without depending on the Gradle daemon's working directory. */
class JavaBuildConfig(project: Project) {
    val jvmToolchainVersion: Int = project.versions.java.get().toInt()
    val javaVersion: JavaVersion = JavaVersion.toVersion(jvmToolchainVersion)
}
