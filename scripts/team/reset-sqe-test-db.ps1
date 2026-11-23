$ErrorActionPreference = 'Stop'

if (-not $env:DATABASE_URL) {
  throw 'Set DATABASE_URL to the dedicated museumos_sqe_test database before resetting.'
}

$databaseUri = [System.Uri]$env:DATABASE_URL
$databaseName = $databaseUri.AbsolutePath.Trim('/').Split('/')[0]
if ($databaseName -ne 'museumos_sqe_test') {
  throw "Refusing destructive reset: DATABASE_URL targets '$databaseName'. Required database name: museumos_sqe_test."
}

Write-Host 'Resetting isolated database museumos_sqe_test with Prisma migrations.'
pnpm --filter @museumos/db exec prisma migrate reset --force
if ($LASTEXITCODE -ne 0) { throw "Prisma reset failed with exit code $LASTEXITCODE" }

pnpm db:seed
if ($LASTEXITCODE -ne 0) { throw "Seed failed with exit code $LASTEXITCODE" }

Write-Host 'Isolated SQE test database reset and seeded.'
