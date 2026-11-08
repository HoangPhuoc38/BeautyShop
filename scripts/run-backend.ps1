$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Import-BeautyShopEnv.ps1')
Import-BeautyShopEnv

$backendPath = Join-Path $PSScriptRoot '..\backend\beautyshop-backend'
$backendPath = [System.IO.Path]::GetFullPath($backendPath)
$mavenWrapper = Join-Path $backendPath 'mvnw.cmd'

if (-not (Test-Path -LiteralPath $mavenWrapper)) {
    throw "Khong tim thay Maven Wrapper: $mavenWrapper"
}

Push-Location $backendPath
try {
    & $mavenWrapper spring-boot:run
    if ($LASTEXITCODE -ne 0) {
        throw "Spring Boot dung voi ma loi $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
