param(
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\scripts\Import-BeautyShopEnv.ps1')
Import-BeautyShopEnv

$baseUrl = $env:COUCHDB_URL.TrimEnd('/')
$database = if ($env:COUCHDB_DATABASE) { $env:COUCHDB_DATABASE } else { 'beauty_shop' }
$credential = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$($env:COUCHDB_USERNAME):$($env:COUCHDB_PASSWORD)"))
$headers = @{ Authorization = "Basic $credential" }
$dbUrl = "$baseUrl/$database"

Invoke-RestMethod -Uri $dbUrl -Headers $headers -Method Get | Out-Null

$seedDirectory = Join-Path $PSScriptRoot '..\seed'
$seedFiles = @(
    'products.sample.json',
    'services.sample.json',
    'customers.sample.json',
    'employees.sample.json'
)

$toCreate = @()
foreach ($fileName in $seedFiles) {
    $filePath = Join-Path $seedDirectory $fileName
    $payload = Get-Content -LiteralPath $filePath -Raw -Encoding UTF8 | ConvertFrom-Json

    foreach ($doc in $payload.docs) {
        $docId = [string]$doc._id
        $exists = $false
        try {
            Invoke-RestMethod -Uri "$dbUrl/$docId" -Headers $headers -Method Get | Out-Null
            $exists = $true
        } catch {
            $statusCode = $null
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }
            if ($statusCode -ne 404) { throw }
        }

        if ($exists) {
            Write-Host "SKIP (already exists): $docId" -ForegroundColor Yellow
        } else {
            Write-Host "ADD: $docId" -ForegroundColor Green
            $toCreate += $doc
        }
    }
}

if ($WhatIf) {
    Write-Host "WhatIf: se tao moi $($toCreate.Count) document; khong co du lieu nao duoc ghi." -ForegroundColor Cyan
    return
}

if ($toCreate.Count -eq 0) {
    Write-Host 'Khong co sample document moi can import.' -ForegroundColor Yellow
    return
}

$bulkBody = @{ docs = $toCreate } | ConvertTo-Json -Depth 30
$result = Invoke-RestMethod -Uri "$dbUrl/_bulk_docs" -Headers $headers -Method Post -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($bulkBody))
$result | Format-Table id, ok, error, reason -AutoSize
Write-Host "Da gui $($toCreate.Count) sample document. Hay kiem tra ket qua tung document o bang tren." -ForegroundColor Green
