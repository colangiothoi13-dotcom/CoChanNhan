param(
  [string]$ApkPath = (Join-Path $PSScriptRoot '..\app\build\outputs\apk\debug\app-debug.apk'),
  [string]$DistPath = (Join-Path $PSScriptRoot '..\cotienlo-game\dist'),
  [string]$ReportPath = (Join-Path $PSScriptRoot '..\.tmp\living-world\apk-verification.json')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$resolvedApk = (Resolve-Path -LiteralPath $ApkPath).Path
$resolvedDist = (Resolve-Path -LiteralPath $DistPath).Path
$archive = [IO.Compression.ZipFile]::OpenRead($resolvedApk)
$verified = @()
try {
  foreach ($asset in Get-ChildItem -LiteralPath $resolvedDist -File -Recurse) {
    $relativePath = $asset.FullName.Substring($resolvedDist.Length + 1).Replace('\', '/')
    $entry = $archive.GetEntry('assets/cotienlo/' + $relativePath)
    if ($null -eq $entry) { throw "Missing APK asset: $relativePath" }
    $stream = $entry.Open()
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $entryHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $sha.Dispose() }
    if ($entryHash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $asset.FullName).Hash) {
      throw "APK asset differs from dist: $relativePath"
    }
    $verified += $relativePath
  }
} finally { $archive.Dispose() }
if ($verified.Count -eq 0) { throw 'No game assets were verified.' }
$result = [PSCustomObject]@{
  path = $resolvedApk
  bytes = (Get-Item -LiteralPath $resolvedApk).Length
  sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedApk).Hash
  matchedAssets = $verified.Count
  files = $verified
}
$json = $result | ConvertTo-Json
$resolvedReport = [IO.Path]::GetFullPath($ReportPath)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolvedReport)) | Out-Null
[IO.File]::WriteAllText($resolvedReport, $json, [Text.UTF8Encoding]::new($false))
$json
