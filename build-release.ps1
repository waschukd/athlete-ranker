# Signed Android release build — prompts for keystore password, never saves it.
# Usage (from project root):
#   .\build-release.ps1

$ErrorActionPreference = 'Stop'

$ProjectRoot = $PSScriptRoot
$JavaHome = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot'
$AndroidHome = 'C:\Android'
$Keystore = Join-Path $ProjectRoot 'android\app\sidelinestar-release.keystore'

if (-not (Test-Path $Keystore)) {
    Write-Host "ERROR: Keystore missing at $Keystore" -ForegroundColor Red
    Write-Host "Restore it from your backup before continuing." -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host 'Sideline Star Evaluator — signed release build' -ForegroundColor Cyan
Write-Host '------------------------------------------------'
Write-Host ''

$secure = Read-Host 'Keystore password (hidden input)' -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
} finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$env:SIDELINESTAR_KEYSTORE_PASSWORD = $plain
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
$env:ANDROID_SDK_ROOT = $AndroidHome
$env:Path = "$JavaHome\bin;$AndroidHome\platform-tools;$env:Path"

try {
    Write-Host ''
    Write-Host '[1/2] Running npx cap sync android ...' -ForegroundColor Yellow
    Push-Location $ProjectRoot
    try {
        npx cap sync android
        if ($LASTEXITCODE -ne 0) { throw "cap sync failed" }
    } finally {
        Pop-Location
    }

    Write-Host ''
    Write-Host '[2/2] Building signed release AAB ...' -ForegroundColor Yellow
    Push-Location (Join-Path $ProjectRoot 'android')
    try {
        .\gradlew.bat bundleRelease --console=plain
        if ($LASTEXITCODE -ne 0) { throw "Gradle build failed" }
    } finally {
        Pop-Location
    }

    $aab = Join-Path $ProjectRoot 'android\app\build\outputs\bundle\release\app-release.aab'
    if (Test-Path $aab) {
        $sizeMB = [math]::Round((Get-Item $aab).Length / 1MB, 2)
        Write-Host ''
        Write-Host "SUCCESS: app-release.aab built ($sizeMB MB)" -ForegroundColor Green
        Write-Host "  $aab" -ForegroundColor Green
        Write-Host ''
        Write-Host 'Upload this file to Play Console -> Internal Testing -> Create new release.' -ForegroundColor Cyan
    } else {
        Write-Host "WARN: Build reported success but AAB not found at expected path." -ForegroundColor Yellow
    }
}
finally {
    # Wipe password from memory regardless of success/failure
    $plain = $null
    Remove-Item Env:\SIDELINESTAR_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
    [System.GC]::Collect()
}
