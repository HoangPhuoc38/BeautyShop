function Import-BeautyShopEnv {
    param(
        [string]$EnvPath = (Join-Path $PSScriptRoot "..\backend\.env"),
        [switch]$AllowMissing
    )

    $resolvedPath = [System.IO.Path]::GetFullPath($EnvPath)

    if (-not (Test-Path -LiteralPath $resolvedPath)) {
        if ($AllowMissing) { return }
        throw "Khong tim thay file moi truong: $resolvedPath. Hay copy backend/.env.example thanh backend/.env va dien thong tin CouchDB."
    }

    foreach ($line in Get-Content -LiteralPath $resolvedPath) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith('#')) {
            continue
        }

        $separator = $trimmed.IndexOf('=')
        if ($separator -le 0) { continue }

        $key = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim()
        $value = $value.Trim('"').Trim("'")

        if ($key -match '^[A-Za-z_][A-Za-z0-9_]*$') {
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }

    if ([string]::IsNullOrWhiteSpace($env:COUCHDB_PASSWORD)) {
        throw "COUCHDB_PASSWORD chua duoc cau hinh trong backend/.env hoac bien moi truong."
    }
}
