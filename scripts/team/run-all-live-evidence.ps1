$ErrorActionPreference = 'Stop'

Write-Host '=== 1. Checking Docker & Postgres ==='
docker compose up -d postgres
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop must be running first.' }

pnpm db:generate
pnpm --filter @museumos/db migrate:deploy
pnpm db:seed

Write-Host '=== 2. Checking API health (start pnpm dev:api and pnpm dev:web in separate terminals if not running) ==='
$health = Invoke-RestMethod -Uri 'http://localhost:3000/api/health' -TimeoutSec 5
if ($health.status -ne 'ok') { throw 'API health check did not return ok.' }

Write-Host '=== 3. Running Live API EP/BVA & Lifecycle Suite ==='
pnpm test:api

Write-Host '=== 4. Running Real PostgreSQL Failure-and-Recovery Integration Test ==='
New-Item -ItemType Directory -Force -Path 'docs/team/evidence/api' | Out-Null
pnpm test:recovery:db | Tee-Object -FilePath 'docs/team/evidence/api/db-recovery-run.json'

Write-Host '=== 5. Running Full 6-Use-Case Playwright Suite ==='
pnpm test:e2e --reporter=line

Write-Host '=== 6. Running OWASP ZAP Passive Scan ==='
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/team/run-zap-passive.ps1

Write-Host '=== 7. Regenerating Charts, Final PDF, and Submission ZIP ==='
python -B docs/team/generators/generate-charts.py
python -B docs/team/generators/generate-report.py
python -B scripts/team/create-submission-zip.py

Write-Host 'ALL LIVE EVIDENCE RUNS COMPLETE!'
