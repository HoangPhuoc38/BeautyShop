$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\scripts\Import-BeautyShopEnv.ps1')
Import-BeautyShopEnv

$baseUrl = $env:COUCHDB_URL.TrimEnd('/')
$database = if ($env:COUCHDB_DATABASE) { $env:COUCHDB_DATABASE } else { 'beauty_shop' }
$credential = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$($env:COUCHDB_USERNAME):$($env:COUCHDB_PASSWORD)"))
$headers = @{ Authorization = "Basic $credential" }
$dbUrl = "$baseUrl/$database"

try {
    Invoke-RestMethod -Uri $dbUrl -Headers $headers -Method Get | Out-Null
} catch {
    throw "Khong truy cap duoc database '$database'. Hay kiem tra CouchDB, ten database va thong tin trong backend/.env."
}

$indexFiles = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..\indexes') -Filter '*.json' -File
if (-not $indexFiles) { throw 'Khong co file index JSON nao.' }

foreach ($file in $indexFiles) {
    Write-Host "Creating index: $($file.Name)" -ForegroundColor Cyan
    $body = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
    $result = Invoke-RestMethod -Uri "$dbUrl/_index" -Headers $headers -Method Post -ContentType 'application/json' -Body $body
    Write-Host "  $($result.result) - $($result.id) / $($result.name)" -ForegroundColor Green
}

Write-Host 'Mango indexes completed.' -ForegroundColor Green
