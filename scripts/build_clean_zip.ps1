$staging = "scratch/handoff_staging"
$destination = "appnutri_codex_handoff_etapa8.zip"

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
if (Test-Path $destination) { Remove-Item $destination -Force }

New-Item -ItemType Directory -Path "$staging/appnutri" -Force | Out-Null

$excludeFolders = @("node_modules", ".next", "scratch", ".git")
$excludeFiles = @(".env.local", "tsconfig.tsbuildinfo", "appnutri_codex_handoff_etapa8.zip")

$root = (Get-Item .).FullName

Get-ChildItem -Path . -Recurse | ForEach-Object {
    $item = $_
    $rel = $item.FullName.Substring($root.Length).TrimStart("\", "/")
    
    $skip = $false
    foreach ($ef in $excludeFolders) {
        if ($rel -match "^$ef(\\|/|$)" -or $rel -match "(\\|/)$ef(\\|/|$)") {
            $skip = $true
            break
        }
    }
    
    foreach ($eff in $excludeFiles) {
        if ($item.Name -eq $eff -or $item.Name.EndsWith(".log")) {
            $skip = $true
            break
        }
    }
    
    if (-not $skip) {
        $target = Join-Path "$staging/appnutri" $rel
        if ($item.PSIsContainer) {
            if (-not (Test-Path $target)) {
                New-Item -ItemType Directory -Path $target -Force | Out-Null
            }
        } else {
            $parent = Split-Path $target -Parent
            if (-not (Test-Path $parent)) {
                New-Item -ItemType Directory -Path $parent -Force | Out-Null
            }
            Copy-Item $item.FullName -Destination $target -Force
        }
    }
}

Compress-Archive -Path "$staging/appnutri/*" -DestinationPath $destination -Force
Remove-Item $staging -Recurse -Force

$zipItem = Get-Item $destination
Write-Output "Zip archive created: $($zipItem.Name) - Size: $($zipItem.Length) bytes ($([math]::Round($zipItem.Length / 1MB, 2)) MB)"
