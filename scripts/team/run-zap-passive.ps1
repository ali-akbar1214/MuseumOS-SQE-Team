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

  $targetWeb = if ($env:ZAP_WEB_URL) { $env:ZAP_WEB_URL } else { 'http://host.docker.internal:4173' }
  $targetApi = if ($env:ZAP_API_URL) { $env:ZAP_API_URL } else { 'http://host.docker.internal:3000/api' }

  Write-Host "Running Playwright workflows through ZAP passive proxy against $targetWeb (production preview build)..."
  $env:PLAYWRIGHT_PROXY = 'http://127.0.0.1:8080'
  $env:WEB_URL = $targetWeb
  pnpm test:e2e --workers=1 --reporter=line
  if ($LASTEXITCODE -ne 0) { throw "Playwright failed with exit code $LASTEXITCODE" }

  Write-Host "Sending direct API requests through ZAP proxy to $targetApi ..."
  $env:ZAP_TARGET_API = $targetApi
  node -e "
    const http = require('node:http');
    const apiBase = new URL(process.env.ZAP_TARGET_API);
    function proxied(method, apiPath, body, cookie) {
      return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = { Host: apiBase.host };
        if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
        if (cookie) headers['Cookie'] = cookie;
        const req = http.request({
          host: '127.0.0.1',
          port: 8080,
          method,
          path: apiBase.origin + apiBase.pathname.replace(/\/$/, '') + apiPath,
          headers,
        }, (res) => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode, setCookie: res.headers['set-cookie'] || [] }));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
      });
    }
    (async () => {
      await proxied('GET', '/health');
      await proxied('GET', '/exhibits');
      const login = await proxied('POST', '/auth/login', {
        identifier: process.env.TEST_ADMIN_EMAIL,
        password: process.env.TEST_ADMIN_PASSWORD,
      });
      const cookie = (login.setCookie || []).map((c) => c.split(';')[0]).join('; ');
      await proxied('GET', '/auth/me', null, cookie);
      await proxied('GET', '/categories', null, cookie);
      await proxied('GET', '/exhibits?limit=5', null, cookie);
      console.log('ZAP direct API probes complete.');
    })().catch((err) => { console.error(err); process.exit(1); });
  "
  if ($LASTEXITCODE -ne 0) { throw "Direct API proxy probes failed with exit code $LASTEXITCODE" }

  Write-Host 'Waiting for passive scanner queue to drain...'
  for ($i = 0; $i -lt 30; $i++) {
    $scan = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/JSON/pscan/view/recordsToScan/' -TimeoutSec 5
    if ([int]$scan.recordsToScan -eq 0) { break }
    Start-Sleep -Seconds 1
  }

  Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/OTHER/core/other/htmlreport/' -OutFile (Join-Path $evidenceDir $reportHtml)
  Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/JSON/alert/view/alerts/?start=0&count=500' -OutFile (Join-Path $evidenceDir $reportJson)
  Write-Host "Saved ZAP passive reports (web production preview + direct API) to docs/team/evidence/security/$reportHtml and $reportJson"
}
finally {
  Remove-Item Env:PLAYWRIGHT_PROXY -ErrorAction SilentlyContinue
  Remove-Item Env:WEB_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ZAP_TARGET_API -ErrorAction SilentlyContinue
  docker rm -f museumos-zap 2>$null | Out-Null
}
