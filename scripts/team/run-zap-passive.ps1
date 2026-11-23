$ErrorActionPreference = 'Stop'

$evidenceDir = Resolve-Path 'docs/team/evidence/security'
$reportHtml = 'zap-passive-report.html'
$reportJson = 'zap-passive-report.json'

if (-not $env:TEST_ADMIN_EMAIL -or -not $env:TEST_ADMIN_PASSWORD) {
  throw 'Set TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_CURATOR_EMAIL, TEST_CURATOR_PASSWORD, TEST_VIEWER_EMAIL, and TEST_VIEWER_PASSWORD first.'
}

Write-Host 'Starting OWASP ZAP passive proxy container on port 8080...'
docker rm -f museumos-zap 2>$null | Out-Null
docker run -d --name museumos-zap --add-host=host.docker.internal:host-gateway -p 8080:8080 -v "${evidenceDir}:/zap/wrk:rw" ghcr.io/zaproxy/zaproxy:stable zap.sh -daemon -host 0.0.0.0 -port 8080 -config api.disablekey=true -config api.addrs.addr.name=.* -config api.addrs.addr.regex=true | Out-Null

try {
  Write-Host 'Waiting for ZAP API on http://127.0.0.1:8080 ...'
  $zapReady = $false
  for ($i = 0; $i -lt 45; $i++) {
    try {
      $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/JSON/core/view/version/' -TimeoutSec 2
      if ($resp.version) { $zapReady = $true; break }
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  if (-not $zapReady) { throw 'OWASP ZAP API did not become ready on port 8080.' }

  Write-Host 'Running Playwright workflows through ZAP passive proxy...'
  $env:PLAYWRIGHT_PROXY = 'http://127.0.0.1:8080'
  $env:WEB_URL = 'http://host.docker.internal:5173'
  pnpm test:e2e --workers=1 --reporter=line
  if ($LASTEXITCODE -ne 0) { throw "Playwright failed with exit code $LASTEXITCODE" }

  Write-Host 'Waiting for passive scanner queue to drain...'
  for ($i = 0; $i -lt 30; $i++) {
    $scan = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/JSON/pscan/view/recordsToScan/' -TimeoutSec 5
    if ([int]$scan.recordsToScan -eq 0) { break }
    Start-Sleep -Seconds 1
  }

  Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/OTHER/core/other/htmlreport/' -OutFile (Join-Path $evidenceDir $reportHtml)
  Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/JSON/alert/view/alerts/?baseurl=http://host.docker.internal:5173' -OutFile (Join-Path $evidenceDir $reportJson)
  Write-Host "Saved ZAP passive reports to docs/team/evidence/security/$reportHtml and $reportJson"
}
finally {
  Remove-Item Env:PLAYWRIGHT_PROXY -ErrorAction SilentlyContinue
  Remove-Item Env:WEB_URL -ErrorAction SilentlyContinue
  docker rm -f museumos-zap 2>$null | Out-Null
}
