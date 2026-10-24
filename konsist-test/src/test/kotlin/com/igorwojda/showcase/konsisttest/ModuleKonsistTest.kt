package com.igorwojda.showcase.konsisttest

import com.lemonappdev.konsist.api.Konsist
import com.lemonappdev.konsist.api.verify.assertTrue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

// Check architecture coding rules.
class ModuleKonsistTest {
    @Test
    fun `every file in module reside in module specific package`() {
        val projectRoot = requireNotNull(System.getProperty("showcase.projectRoot"))
        Konsist
            .scopeFromProject()
            .files
            .assertTrue {
                val expected = modulePackageFor(projectRoot, it.path)
                it.packagee?.name?.let { name -> name == expected || name.startsWith("$expected.") }
            }
    }

    @Test
    fun `module packages support Windows and Unix source paths`() {
        assertEquals(
            "com.igorwojda.showcase.feature.album",
            modulePackageFor("D:\\projects\\showcase", "D:\\projects\\showcase\\feature\\album\\src\\main\\kotlin\\Album.kt"),
        )
        assertEquals(
            "com.igorwojda.showcase.library.testutils",
            modulePackageFor("/projects/showcase/", "/projects/showcase/library/test-utils/src/main/kotlin/Test.kt"),
        )
    }
}

private fun modulePackageFor(projectRoot: String, filePath: String): String {
    val root = projectRoot.replace('\\', '/').trimEnd('/')
    val path = filePath.replace('\\', '/')
    require(path.startsWith("$root/")) { "Source file is outside the project: $filePath" }
    val relativePath = path.removePrefix("$root/")
    require("/src/" in relativePath) { "Source file is outside a module source directory: $filePath" }
    val moduleName = relativePath.substringBefore("/src/").lowercase().replace('/', '.').replace("-", "")
    return "com.igorwojda.showcase.$moduleName"
}
