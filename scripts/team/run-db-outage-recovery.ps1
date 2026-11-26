$ErrorActionPreference = 'Stop'

$apiBase = if ($env:API_URL) { $env:API_URL.TrimEnd('/') } else { 'http://localhost:3000/api' }
$outPath = 'docs/team/evidence/api/db-outage-recovery-run.json'
if (-not $env:TEST_ADMIN_EMAIL -or -not $env:TEST_ADMIN_PASSWORD) {
  throw 'Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD first.'
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$fixtureId = $null
$dbStopped = $false

try {
  $loginBody = @{ identifier = $env:TEST_ADMIN_EMAIL; password = $env:TEST_ADMIN_PASSWORD } | ConvertTo-Json
  $loginResp = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody -WebSession $session
  if ($loginResp.StatusCode -ne 200) { throw "Login returned $($loginResp.StatusCode)" }

  $categories = Invoke-RestMethod -Uri "$apiBase/categories" -WebSession $session
  $catId = $categories[0].id
  $uniqueName = "SQE Outage Recovery $([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
  $createBody = @{ categoryId = $catId; exhibitName = $uniqueName; year = 1980; attributes = @{} } | ConvertTo-Json
  $created = Invoke-RestMethod -Uri "$apiBase/exhibits" -Method Post -ContentType 'application/json' -Body $createBody -WebSession $session
  $fixtureId = $created.id

  Write-Host "Stopping Docker PostgreSQL container museumos-db during live API write..."
  docker stop museumos-db | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to stop museumos-db.' }
  $dbStopped = $true

  $patchBody = @{ year = 2024 } | ConvertTo-Json
  $failureStatus = $null
  $failureDetail = $null
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/exhibits/$fixtureId" -Method Patch -ContentType 'application/json' -Body $patchBody -WebSession $session -TimeoutSec 15
    $failureStatus = $resp.StatusCode
  } catch {
    if ($_.Exception.Response) {
      $failureStatus = [int]$_.Exception.Response.StatusCode
    } else {
      $failureStatus = 500
    }
    $failureDetail = $_.Exception.Message
  }
  if ($failureStatus -lt 500) {
    throw "Expected 5xx database outage failure during PATCH while museumos-db was stopped, got $failureStatus"
  }

  Write-Host "Restarting Docker PostgreSQL container museumos-db..."
  docker start museumos-db | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to start museumos-db.' }
  $dbStopped = $false

  $pgReady = $false
  for ($i = 0; $i -lt 30; $i++) {
    docker exec museumos-db pg_isready -U museumos | Out-Null
    if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $pgReady) { throw 'PostgreSQL container did not become ready after restart.' }

  # Evict any dead pooled TCP socket from Prisma/pg-pool on first post-restart query if needed
  $afterFailure = $null
  $reconnectAttempts = 0
  for ($i = 0; $i -lt 6; $i++) {
    $reconnectAttempts = $i + 1
    try {
      $afterFailure = Invoke-RestMethod -Uri "$apiBase/exhibits/$fixtureId" -WebSession $session -TimeoutSec 5
      break
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  if (-not $afterFailure) { throw 'API did not reconnect to restarted PostgreSQL within 6 attempts.' }

  $searchAfterFailure = Invoke-RestMethod -Uri ("$apiBase/exhibits?q=" + [Uri]::EscapeDataString($uniqueName)) -WebSession $session
  $countAfterFailure = @($searchAfterFailure.items | Where-Object { $_.id -eq $fixtureId }).Count
  if ($afterFailure.year -ne 1980 -or $countAfterFailure -ne 1) {
    throw "Outage did not preserve pre-failure state cleanly (year=$($afterFailure.year), count=$countAfterFailure)."
  }

  $retry1 = Invoke-RestMethod -Uri "$apiBase/exhibits/$fixtureId" -Method Patch -ContentType 'application/json' -Body $patchBody -WebSession $session
  $retry2 = Invoke-RestMethod -Uri "$apiBase/exhibits/$fixtureId" -Method Patch -ContentType 'application/json' -Body $patchBody -WebSession $session
  $afterRetry = Invoke-RestMethod -Uri "$apiBase/exhibits/$fixtureId" -WebSession $session
  $searchAfterRetry = Invoke-RestMethod -Uri ("$apiBase/exhibits?q=" + [Uri]::EscapeDataString($uniqueName)) -WebSession $session
  $countAfterRetry = @($searchAfterRetry.items | Where-Object { $_.id -eq $fixtureId }).Count
  if ($afterRetry.year -ne 2024 -or $countAfterRetry -ne 1) {
    throw "Retry after PostgreSQL restart failed or duplicated record (year=$($afterRetry.year), count=$countAfterRetry)."
  }

  $summary = [ordered]@{
    capturedAt = (Get-Date).ToString('o')
    result = 'PASS'
    failureInjection = 'real Docker PostgreSQL outage (docker stop museumos-db -> PATCH -> docker start museumos-db)'
    outageWriteHttpStatus = $failureStatus
    outageWriteDetail = $failureDetail
    reconnectAttemptsAfterPgReady = $reconnectAttempts
    afterFailure = [ordered]@{ year = $afterFailure.year; recordsWithId = $countAfterFailure }
    retryResponses = @($retry1.year, $retry2.year)
    afterRetry = [ordered]@{ year = $afterRetry.year; recordsWithId = $countAfterRetry }
    fixtureCleanup = 'soft-delete via DELETE /api/exhibits/:id in finally block'
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $outPath) | Out-Null
  $json = $summary | ConvertTo-Json -Depth 5
  Set-Content -Path $outPath -Value $json -Encoding UTF8
  Write-Output $json
}
finally {
  if ($dbStopped) {
    docker start museumos-db 2>$null | Out-Null
    for ($i = 0; $i -lt 30; $i++) {
      docker exec museumos-db pg_isready -U museumos | Out-Null
      if ($LASTEXITCODE -eq 0) { break }
      Start-Sleep -Seconds 1
    }
    Start-Sleep -Seconds 2
  }
  if ($fixtureId) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/exhibits/$fixtureId" -Method Delete -WebSession $session | Out-Null
    } catch {
      # best-effort cleanup
    }
  }
}
