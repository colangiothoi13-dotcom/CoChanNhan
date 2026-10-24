param(
    [string]$GradleUserHome = $(
        if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME }
        else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.gradle' }
    )
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$wrapper = Get-Content -LiteralPath (Join-Path $projectRoot 'gradle\wrapper\gradle-wrapper.properties')
$distribution = $wrapper | Where-Object { $_ -match '^distributionUrl=' }
if ($distribution -notmatch 'gradle-([0-9.]+)-bin\.zip') { throw 'Could not find the Gradle wrapper version.' }
$gradleVersion = $Matches[1]
$distributionRoot = Join-Path $GradleUserHome "wrapper\dists\gradle-$gradleVersion-bin"
$gradleLibrary = Get-ChildItem -LiteralPath $distributionRoot -Directory | ForEach-Object {
    Join-Path $_.FullName "gradle-$gradleVersion\lib"
} | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (!$gradleLibrary) { throw 'Run the Gradle wrapper once to cache its Kotlin compiler, or pass -GradleUserHome.' }
$stdlib = Get-ChildItem -LiteralPath $gradleLibrary -Filter 'kotlin-stdlib-*.jar' |
    Where-Object { $_.Name -match '^kotlin-stdlib-[0-9]' } | Select-Object -First 1
if (!$stdlib) { throw 'The cached Gradle distribution does not contain the Kotlin standard library.' }
$java = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { (Get-Command java).Source }
$outputDirectory = Join-Path $projectRoot '.tmp\game-asset-routes-check'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$temporarySourceDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('cotienlo-route-check-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporarySourceDirectory | Out-Null
$temporarySource = Join-Path $temporarySourceDirectory 'GameAssetRoutesCheck.kt'
try {
    Copy-Item -LiteralPath (Join-Path $projectRoot 'tools\checks\GameAssetRoutesCheck.kt.txt') -Destination $temporarySource
    $sources = @(
        (Join-Path $projectRoot 'app\src\main\kotlin\com\igorwojda\showcase\app\presentation\game\GameAssetRoutes.kt'),
        $temporarySource
    )
    & $java -cp "$gradleLibrary\*" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -classpath $stdlib.FullName -d $outputDirectory @sources
    $checkExitCode = $LASTEXITCODE
    if ($checkExitCode -eq 0) {
        & $java -cp "$outputDirectory;$($stdlib.FullName)" com.igorwojda.showcase.app.presentation.game.GameAssetRoutesCheckKt
        $checkExitCode = $LASTEXITCODE
    }
} finally {
    if (Test-Path -LiteralPath $temporarySource) { Remove-Item -LiteralPath $temporarySource -Force }
    Remove-Item -LiteralPath $temporarySourceDirectory -Force
}
exit $checkExitCode
