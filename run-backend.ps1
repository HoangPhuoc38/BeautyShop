$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\BeautyShop"
$EnvFile = Join-Path $ProjectRoot ".env"
$BackendPath = Join-Path $ProjectRoot "backend\beautyshop-backend"

if (!(Test-Path $EnvFile)) {
    Write-Host "Khong tim thay file .env" -ForegroundColor Red
    exit 1
}

Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()

    if ($line -match '^([^#][^=]*)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()

        [Environment]::SetEnvironmentVariable(
            $name,
            $value,
            "Process"
        )
    }
}

Set-Location $BackendPath

.\mvnw.cmd spring-boot:run