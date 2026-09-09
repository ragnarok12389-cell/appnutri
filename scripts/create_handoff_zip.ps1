$destination = "appnutri_codex_handoff_etapa8.zip"
if (Test-Path $destination) {
    Remove-Item $destination -Force
}

$baseDir = (Get-Item .).FullName
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($destination, [System.IO.Compression.ZipArchiveMode]::Create)

$excludeSubstrings = @(
    "\node_modules\",
    "\.next\",
    "\scratch\",
    "\.env.local",
    "tsconfig.tsbuildinfo",
    ".log",
    "appnutri_codex_handoff_etapa8.zip"
)

$files = Get-ChildItem -Path . -Recurse -File

$count = 0
foreach ($file in $files) {
    $fullPath = $file.FullName
    $relativePath = $fullPath.Substring($baseDir.Length).TrimStart("\", "/")

    $shouldExclude = $false
    foreach ($pattern in $excludeSubstrings) {
        if ($fullPath -like "*$pattern*" -or $fullPath.EndsWith($pattern)) {
            $shouldExclude = $true
            break
        }
    }

    if (-not $shouldExclude) {
        $entryName = $relativePath.Replace("\", "/")
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $fullPath, $entryName)
        $count++
    }
}

$zip.Dispose()
Write-Output "Zip archive created successfully: $destination with $count files."
