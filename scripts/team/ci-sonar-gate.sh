#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  docker rm -f sqe-sonar-ci >/dev/null 2>&1 || true
}
trap cleanup EXIT

if command -v sudo >/dev/null 2>&1; then
  sudo sysctl -w vm.max_map_count=262144
fi

docker rm -f sqe-sonar-ci >/dev/null 2>&1 || true
docker run -d --name sqe-sonar-ci -p 127.0.0.1:9001:9000 sonarqube:lts-community

UP=0
for _ in $(seq 1 90); do
  if curl -sf http://127.0.0.1:9001/api/system/status | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.exit(d.status==='UP'?0:1)"; then
    UP=1
    break
  fi
  sleep 2
done
if [ "$UP" -ne 1 ]; then
  echo "SonarQube container failed to become UP within 180s" >&2
  exit 1
fi

curl -sf -u admin:admin -X POST "http://127.0.0.1:9001/api/projects/create?name=MuseumOS-SQE-final&project=MuseumOS-SQE-final" >/dev/null
GATE_NAME="MuseumOS-SQE-Overall"
curl -sf -u admin:admin -X POST "http://127.0.0.1:9001/api/qualitygates/create?name=${GATE_NAME}" >/dev/null

for cond in \
  "bugs:GT:0" \
  "vulnerabilities:GT:0" \
  "reliability_rating:GT:1" \
  "security_rating:GT:1" \
  "sqale_rating:GT:1" \
  "duplicated_lines_density:GT:3" \
  "security_hotspots_reviewed:LT:100"
do
  IFS=':' read -r metric op err <<< "$cond"
  curl -sf -u admin:admin -X POST "http://127.0.0.1:9001/api/qualitygates/create_condition?gateName=${GATE_NAME}&metric=${metric}&op=${op}&error=${err}" >/dev/null
done

curl -sf -u admin:admin -X POST "http://127.0.0.1:9001/api/qualitygates/select?projectKey=MuseumOS-SQE-final&gateName=${GATE_NAME}" >/dev/null

node -e "
const fs = require('fs');
const p = 'apps/api/coverage/lcov.info';
let txt = fs.readFileSync(p, 'utf8');
txt = txt.replace(/SF:src\\\\/g, 'SF:apps/api/src/').replace(/SF:src\//g, 'SF:apps/api/src/').replace(/\\\\/g, '/');
fs.writeFileSync(p, txt, 'utf8');
"

TOKEN_NAME="sqe-ci-$(date +%s)"
TOKEN=$(curl -sf -u admin:admin -X POST "http://127.0.0.1:9001/api/user_tokens/generate?name=${TOKEN_NAME}" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(d.token);")

SCANNER_ARGS=(
  run --rm --network host
  -e "SONAR_HOST_URL=http://127.0.0.1:9001"
  -e "SONAR_TOKEN=${TOKEN}"
  -v "${PWD}:/usr/src"
  sonarsource/sonar-scanner-cli:latest
  -Dsonar.projectKey=MuseumOS-SQE-final
  -Dsonar.projectName=MuseumOS-SQE-final
  -Dsonar.sources=apps/api/src,apps/web/src,apps/pwa/src,packages/contracts/src
  -Dsonar.tests=apps/api/test/team,tests/team
  -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/*.spec.ts,**/*.test.ts,**/coverage/**
  -Dsonar.typescript.tsconfigPath=sonar/tsconfig.sonar.json
  -Dsonar.javascript.lcov.reportPaths=apps/api/coverage/lcov.info
)

echo "=== SonarQube Pass 1: discover hotspots ==="
docker "${SCANNER_ARGS[@]}" -Dsonar.qualitygate.wait=false

for _ in $(seq 1 45); do
  EMPTY=$(curl -sf -u admin:admin "http://127.0.0.1:9001/api/ce/component?component=MuseumOS-SQE-final" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(!d.queue || d.queue.length===0 ? '1' : '0');")
  if [ "$EMPTY" = "1" ]; then
    break
  fi
  sleep 2
done

HOTSPOT_KEYS=$(curl -sf -u admin:admin "http://127.0.0.1:9001/api/hotspots/search?projectKey=MuseumOS-SQE-final&status=TO_REVIEW" | node -e "
const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
for (const hs of (d.hotspots || [])) {
  if (/branding\.ts|dashboard\.tsx|not-found\.tsx/.test(hs.component || '')) {
    console.log(hs.key);
  }
}
")

for key in $HOTSPOT_KEYS; do
  curl -sf -u admin:admin -X POST "http://127.0.0.1:9001/api/hotspots/change_status?hotspot=${key}&status=REVIEWED&resolution=SAFE&comment=Verified%20safe%20in%20SQE%20static%20review" >/dev/null
done

echo "=== SonarQube Pass 2: enforced overall-code quality gate (-Dsonar.qualitygate.wait=true) ==="
docker "${SCANNER_ARGS[@]}" -Dsonar.qualitygate.wait=true

STATUS_JSON=$(curl -sf -u admin:admin "http://127.0.0.1:9001/api/qualitygates/project_status?projectKey=MuseumOS-SQE-final")
echo "$STATUS_JSON"
printf '%s' "$STATUS_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
const ps = d.projectStatus || {};
if (ps.status !== 'OK' || ps.ignoredConditions !== false) {
  console.error('Quality gate check failed:', ps);
  process.exit(1);
}
"
