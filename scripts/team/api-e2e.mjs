import fs from 'node:fs';

const base = process.env.API_URL ?? 'http://localhost:3000/api';
const generatedPath = process.env.API_CASES ?? 'docs/team/evidence/api/api-generated-cases.json';
if (!fs.existsSync(generatedPath)) throw new Error(`Generated test data not found at ${generatedPath}; run pnpm test:data first`);
const generated = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));
const baselineText = fs.readFileSync('docs/team/planning/baseline.txt', 'utf8');
const baselineCommit = process.env.BASELINE_COMMIT ?? baselineText.match(/Baseline commit:\s*([0-9a-f]{40})/i)?.[1];
if (!baselineCommit || !/^[0-9a-f]{40}$/i.test(baselineCommit)) {
  throw new Error('Provide a valid BASELINE_COMMIT or pin the 40-character commit in docs/team/planning/baseline.txt');
}
const runId = `SQE-${Date.now()}`;
let sessionCookie = '';
let cleanupId = null;
const outcomes = [];

async function request(route, options = {}) {
  await new Promise((resolve) => setTimeout(resolve, 65));
  const response = await fetch(base + route, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(sessionCookie ? { cookie: sessionCookie } : {}),
      ...(options.headers ?? {}),
    },
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) sessionCookie = setCookie.split(';', 1)[0];
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalize(field, value) {
  return field === 'collectiblePrice' && value !== null ? Number(value) : value;
}

function buildCoverageMatrix(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const endpoint = row.endpoint;
    const method = row.operation;
    const key = `${method} ${endpoint}`;
    if (!buckets.has(key)) {
      buckets.set(key, { method, endpoint, statuses: new Set(), parameters: new Set(), checks: 0 });
    }
    const entry = buckets.get(key);
    entry.statuses.add(row.observed);
    if (row.field) entry.parameters.add(row.field);
    entry.checks += 1;
  }
  return [...buckets.values()].map((entry) => ({
    method: entry.method,
    endpoint: entry.endpoint,
    statusesTested: [...entry.statuses].sort((a, b) => a - b),
    parametersTested: [...entry.parameters].sort(),
    executedCases: entry.checks,
  }));
}

async function main() {
  // 1. Unauthenticated checks across core routes + bad login (401)
  const badLogin = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'nobody@museumos.test', password: 'wrong' }),
  });
  assert(badLogin.status === 401, `Bad login expected 401, got ${badLogin.status}`);
  outcomes.push({ operation: 'POST', endpoint: '/auth/login', caseId: 'API-AUTH-LOGIN-401', field: 'identifier/password', expected: 401, observed: badLogin.status });

  const unauthMe = await fetch(base + '/auth/me');
  assert(unauthMe.status === 401, `Unauthenticated /auth/me expected 401, got ${unauthMe.status}`);
  outcomes.push({ operation: 'GET', endpoint: '/auth/me', caseId: 'API-AUTH-ME-401', expected: 401, observed: unauthMe.status });

  const unauthCats = await fetch(base + '/categories');
  assert(unauthCats.status === 401, `Unauthenticated /categories expected 401, got ${unauthCats.status}`);
  outcomes.push({ operation: 'GET', endpoint: '/categories', caseId: 'API-CATEGORIES-401', expected: 401, observed: unauthCats.status });

  const unauthRead = await fetch(base + '/exhibits');
  assert(unauthRead.status === 401, `Unauthenticated /exhibits expected 401, got ${unauthRead.status}`);
  outcomes.push({ operation: 'GET', endpoint: '/exhibits', caseId: 'API-EXHIBITS-LIST-401', expected: 401, observed: unauthRead.status });

  const unauthPost = await fetch(base + '/exhibits', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ categoryId: '10000000-0000-4000-8000-000000000001', exhibitName: 'Unauth', attributes: {} }),
  });
  assert(unauthPost.status === 401, `Unauthenticated POST /exhibits expected 401, got ${unauthPost.status}`);
  outcomes.push({ operation: 'POST', endpoint: '/exhibits', caseId: 'API-EXHIBITS-CREATE-401', expected: 401, observed: unauthPost.status });

  // 2. Admin login + health + /auth/me + categories
  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    }),
  });
  assert(login.status === 200, `Admin login failed (${login.status}); set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD`);
  outcomes.push({ operation: 'POST', endpoint: '/auth/login', caseId: 'API-AUTH-LOGIN-200', field: 'identifier/password', expected: 200, observed: login.status });

  const health = await request('/health');
  assert(health.status === 200, `API health failed (${health.status})`);
  outcomes.push({ operation: 'GET', endpoint: '/health', caseId: 'API-HEALTH-200', expected: 200, observed: health.status });

  const me = await request('/auth/me');
  assert(me.status === 200, `Authenticated /auth/me failed (${me.status})`);
  outcomes.push({ operation: 'GET', endpoint: '/auth/me', caseId: 'API-AUTH-ME-200', expected: 200, observed: me.status });

  const categoryResponse = await request('/categories');
  assert(categoryResponse.status === 200 && categoryResponse.body.length > 0, 'No seeded exhibit category is available');
  outcomes.push({ operation: 'GET', endpoint: '/categories', caseId: 'API-CATEGORIES-200', expected: 200, observed: categoryResponse.status });
  const categoryId = categoryResponse.body[0].id;

  // 3. Query parameter EP/BVA on GET /exhibits (generated SearchExhibitsQuery + filter rejections)
  for (const sortCase of (generated.queryProperties?.sortOrder?.cases ?? [])) {
    const res = await request(`/exhibits?sortOrder=${encodeURIComponent(String(sortCase.value))}&limit=5`);
    const exp = sortCase.valid ? 200 : 400;
    assert(res.status === exp, `GET /exhibits?sortOrder=${sortCase.value} expected ${exp}, got ${res.status}`);
    outcomes.push({ operation: 'GET', endpoint: '/exhibits', caseId: `API-GET-SORTORDER-${sortCase.value}`, field: 'sortOrder', partitions: sortCase.partitions, techniques: sortCase.techniques, expected: exp, observed: res.status });
  }
  for (const limitCase of (generated.queryProperties?.limit?.cases ?? [])) {
    const res = await request(`/exhibits?limit=${encodeURIComponent(String(limitCase.value))}`);
    const exp = limitCase.valid ? 200 : 400;
    assert(res.status === exp, `GET /exhibits?limit=${limitCase.value} expected ${exp}, got ${res.status}`);
    outcomes.push({ operation: 'GET', endpoint: '/exhibits', caseId: `API-GET-LIMIT-${limitCase.value}`, field: 'limit', partitions: limitCase.partitions, techniques: limitCase.techniques, expected: exp, observed: res.status });
  }
  const badYearFrom = await request('/exhibits?yearFrom=notanumber');
  assert(badYearFrom.status === 400, `GET /exhibits?yearFrom=notanumber expected 400, got ${badYearFrom.status}`);
  outcomes.push({ operation: 'GET', endpoint: '/exhibits', caseId: 'API-GET-YEARFROM-400', field: 'yearFrom', expected: 400, observed: badYearFrom.status });

  // 4. POST /exhibits generated EP & 3-point BVA with catalogue total count read-back after every rejection
  const baselineCountResp = await request('/exhibits?limit=1');
  assert(baselineCountResp.status === 200, 'Could not read initial catalogue count');
  const baselineTotal = baselineCountResp.body.total;

  const createBase = { categoryId, exhibitName: `${runId} generated create`, year: 2000, collectiblePrice: 25, attributes: {} };
  let createCaseIndex = 0;
  for (const field of ['exhibitName', 'categoryId', 'year', 'collectiblePrice']) {
    for (const item of generated.properties[field].cases) {
      createCaseIndex += 1;
      const body = { ...createBase, exhibitName: `${runId} generated create ${createCaseIndex}` };
      if (!item.exists) delete body[field];
      else body[field] = item.value === '__CATEGORY_ID__' ? categoryId : item.value;
      if (field === 'exhibitName' && item.valid) {
        const originalName = String(item.value);
        const suffix = `${runId}-${createCaseIndex}`;
        body.exhibitName = originalName.length > suffix.length
          ? `${'x'.repeat(originalName.length - suffix.length)}${suffix}`
          : originalName;
      }
      const result = await request('/exhibits', { method: 'POST', body: JSON.stringify(body) });
      cleanupId = result.body?.id ?? null;
      const expectedStatus = item.valid ? 201 : 400;
      assert(result.status === expectedStatus, `POST ${field} ${item.partitions.join('|')}: expected ${expectedStatus}, got ${result.status}`);
      let readbackVerified = true;
      if (item.valid) {
        assert(result.body?.id, `POST ${field} returned no record id`);
        const readCreated = await request(`/exhibits/${result.body.id}`);
        assert(readCreated.status === 200, `POST ${field} read-back failed (${readCreated.status})`);
        const removed = await request(`/exhibits/${result.body.id}`, { method: 'DELETE' });
        assert(removed.status === 204, `POST ${field} cleanup failed (${removed.status})`);
        cleanupId = null;
      } else {
        const afterRejectCount = await request('/exhibits?limit=1');
        assert(afterRejectCount.status === 200 && afterRejectCount.body.total === baselineTotal, `POST rejection for ${field} altered catalogue count!`);
      }
      outcomes.push({
        operation: 'POST',
        endpoint: '/exhibits',
        caseId: `API-POST-${field.toUpperCase()}-${createCaseIndex}`,
        field,
        partitions: item.partitions,
        techniques: item.techniques,
        expected: expectedStatus,
        observed: result.status,
        readbackVerified,
      });
    }
  }

  // 5. Create shared exhibit record + PATCH generated cases with read-back after EVERY outcome
  const created = await request('/exhibits', {
    method: 'POST',
    body: JSON.stringify({
      categoryId,
      exhibitName: `${runId} workflow record`,
      year: 2000,
      collectiblePrice: 25,
      attributes: {},
    }),
  });
  assert(created.status === 201, `Create failed (${created.status}): ${JSON.stringify(created.body)}`);
  const id = created.body.id;
  cleanupId = id;
  const createdReadback = await request(`/exhibits/${id}`);
  assert(createdReadback.status === 200 && createdReadback.body.id === id, 'GET /exhibits/{id} read-back failed');
  outcomes.push({ operation: 'POST', endpoint: '/exhibits', caseId: 'API-POST-READBACK-01', expected: 201, observed: created.status, readbackVerified: true });
  outcomes.push({ operation: 'GET', endpoint: '/exhibits/{id}', caseId: 'API-GET-BY-ID-200', field: 'id', expected: 200, observed: createdReadback.status });

  const persistedValues = { exhibitName: created.body.exhibitName, categoryId: created.body.categoryId, year: created.body.year, collectiblePrice: normalize('collectiblePrice', created.body.collectiblePrice) };

  let patchCaseIndex = 0;
  for (const field of ['exhibitName', 'categoryId', 'year', 'collectiblePrice']) {
    for (const item of generated.properties[field].cases) {
      if (!item.exists) continue;
      patchCaseIndex += 1;
      const value = item.value === '__CATEGORY_ID__' ? categoryId : item.value;
      const result = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) });
      const expectedStatus = item.valid ? 200 : 400;
      assert(result.status === expectedStatus, `PATCH ${field} ${item.partitions.join('|')}: expected ${expectedStatus}, got ${result.status}`);
      const readback = await request(`/exhibits/${id}`);
      assert(readback.status === 200, `${field} read-back failed (${readback.status})`);
      const expectedValue = normalize(field, item.valid ? value : persistedValues[field]);
      const observedValue = normalize(field, readback.body[field]);
      assert(observedValue === expectedValue, `PATCH ${field} persisted state mismatch: expected ${expectedValue}, got ${readback.body[field]}`);
      if (item.valid) persistedValues[field] = value;
      outcomes.push({ operation: 'PATCH', endpoint: '/exhibits/{id}', caseId: `API-PATCH-${field.toUpperCase()}-${patchCaseIndex}`, field, partitions: item.partitions, techniques: item.techniques, expected: expectedStatus, observed: result.status, readbackVerified: true, readback: readback.body[field] });
    }
  }

  const restoredName = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ exhibitName: `${runId} workflow record` }) });
  assert(restoredName.status === 200, `Could not restore unique name (${restoredName.status})`);

  // 6. Cross-workflow lifecycle checks with read-back on every transition/rejection
  const rejectedPublish = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ published: true }) });
  assert(rejectedPublish.status === 400, `Unvalidated publish expected 400, got ${rejectedPublish.status}`);
  let readback = await request(`/exhibits/${id}`);
  assert(readback.status === 200 && readback.body.validated === false && readback.body.published === false, 'Rejected publish mutated state');
  outcomes.push({ operation: 'PATCH', endpoint: '/exhibits/{id}', caseId: 'API-LIFECYCLE-REJECT-01', field: 'published', expected: 400, observed: rejectedPublish.status, readbackVerified: true });

  const validated = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ validated: true }) });
  assert(validated.status === 200 && validated.body.validated, `Validation failed (${validated.status})`);
  outcomes.push({ operation: 'PATCH', endpoint: '/exhibits/{id}', caseId: 'API-LIFECYCLE-VALIDATE-01', field: 'validated', expected: 200, observed: validated.status });

  const published = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ published: true }) });
  assert(published.status === 200 && published.body.published, `Publish failed (${published.status})`);
  outcomes.push({ operation: 'PATCH', endpoint: '/exhibits/{id}', caseId: 'API-LIFECYCLE-PUBLISH-01', field: 'published', expected: 200, observed: published.status });

  const terminal = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ validated: false, published: false }) });
  assert(terminal.status === 400, `Published-to-draft expected 400, got ${terminal.status}`);
  const terminalReadback = await request(`/exhibits/${id}`);
  assert(terminalReadback.status === 200 && terminalReadback.body.validated === true && terminalReadback.body.published === true, 'Terminal rejection mutated state');
  outcomes.push({ operation: 'PATCH', endpoint: '/exhibits/{id}', caseId: 'API-LIFECYCLE-PUBLISHED-TO-DRAFT', field: 'validated/published', expected: 400, observed: terminal.status, readbackVerified: true });

  const missingId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const missingGet = await request(`/exhibits/${missingId}`);
  assert(missingGet.status === 404, `Missing GET expected 404, got ${missingGet.status}`);
  outcomes.push({ operation: 'GET', endpoint: '/exhibits/{id}', caseId: 'API-GET-BY-ID-404', field: 'id', expected: 404, observed: missingGet.status });

  const missingPatch = await request(`/exhibits/${missingId}`, { method: 'PATCH', body: JSON.stringify({ exhibitName: 'Missing' }) });
  assert(missingPatch.status === 404, `Missing PATCH expected 404, got ${missingPatch.status}`);
  outcomes.push({ operation: 'PATCH', endpoint: '/exhibits/{id}', caseId: 'API-PATCH-BY-ID-404', field: 'id', expected: 404, observed: missingPatch.status });

  const missingDel = await request(`/exhibits/${missingId}`, { method: 'DELETE' });
  assert(missingDel.status === 404, `Missing DELETE expected 404, got ${missingDel.status}`);
  outcomes.push({ operation: 'DELETE', endpoint: '/exhibits/{id}', caseId: 'API-DELETE-BY-ID-404', field: 'id', expected: 404, observed: missingDel.status });

  const repeated = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ published: true }) });
  assert(repeated.status === 200 && repeated.body.id === id, 'Repeated publish did not resolve to same record');
  readback = await request(`/exhibits/${id}`);
  assert(readback.status === 200 && readback.body.validated && readback.body.published, 'Final state read-back failed');
  const search = await request(`/exhibits?categoryId=${encodeURIComponent(categoryId)}&limit=100`);
  const duplicateMatches = search.body?.items?.filter((item) => item.id === id).length ?? 0;
  assert(search.status === 200 && duplicateMatches === 1, `Duplicate record detected (${duplicateMatches})`);

  // 7. RBAC checks on API (viewer 403 create/validate/delete + unauthenticated PATCH/DELETE 401 + read-back proofs)
  const adminCookie = sessionCookie;
  const unauthPatch = await fetch(`${base}/exhibits/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ exhibitName: 'Unauth overwrite' }),
  });
  assert(unauthPatch.status === 401, `Unauthenticated PATCH expected 401, got ${unauthPatch.status}`);
  outcomes.push({ operation: 'PATCH', endpoint: '/exhibits/{id}', caseId: 'API-PATCH-401', field: 'id', expected: 401, observed: unauthPatch.status });

  const unauthDel = await fetch(`${base}/exhibits/${id}`, { method: 'DELETE' });
  assert(unauthDel.status === 401, `Unauthenticated DELETE expected 401, got ${unauthDel.status}`);
  outcomes.push({ operation: 'DELETE', endpoint: '/exhibits/{id}', caseId: 'API-DELETE-401', field: 'id', expected: 401, observed: unauthDel.status });

  const unauthGetOne = await fetch(`${base}/exhibits/${id}`);
  assert(unauthGetOne.status === 401, `Unauthenticated GET /exhibits/:id expected 401, got ${unauthGetOne.status}`);
  outcomes.push({ operation: 'GET', endpoint: '/exhibits/{id}', caseId: 'API-GET-BY-ID-401', field: 'id', expected: 401, observed: unauthGetOne.status });

  let viewerAccess = { status: 'not-run', reason: 'Set TEST_VIEWER_EMAIL and TEST_VIEWER_PASSWORD' };
  if (process.env.TEST_VIEWER_EMAIL && process.env.TEST_VIEWER_PASSWORD) {
    // Login without sending adminCookie so express-session does not regenerate/invalidate the admin session row
    sessionCookie = '';
    const viewerLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: process.env.TEST_VIEWER_EMAIL, password: process.env.TEST_VIEWER_PASSWORD }),
    });
    assert(viewerLogin.status === 200, `Viewer login failed (${viewerLogin.status})`);

    const deniedCreate = await request('/exhibits', {
      method: 'POST',
      body: JSON.stringify({ categoryId, exhibitName: `${runId} forbidden viewer create`, year: 2000, collectiblePrice: 1, attributes: {} }),
    });
    assert(deniedCreate.status === 403, `Viewer create expected 403, got ${deniedCreate.status}`);
    outcomes.push({ operation: 'POST', endpoint: '/exhibits', caseId: 'API-AUTH-403-CREATE', field: 'role', expected: 403, observed: deniedCreate.status });

    const deniedPatch = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ validated: false }) });
    assert(deniedPatch.status === 403, `Viewer PATCH expected 403, got ${deniedPatch.status}`);
    outcomes.push({ operation: 'PATCH', endpoint: '/exhibits/{id}', caseId: 'API-AUTH-403-PATCH', field: 'role', expected: 403, observed: deniedPatch.status });

    const deniedDel = await request(`/exhibits/${id}`, { method: 'DELETE' });
    assert(deniedDel.status === 403, `Viewer DELETE expected 403, got ${deniedDel.status}`);
    outcomes.push({ operation: 'DELETE', endpoint: '/exhibits/{id}', caseId: 'API-AUTH-403-DELETE', field: 'role', expected: 403, observed: deniedDel.status });

    viewerAccess = { login: viewerLogin.status, create: deniedCreate.status, patch: deniedPatch.status, delete: deniedDel.status };
  }

  // Restore saved admin cookie without consuming another /auth/login throttle token
  sessionCookie = adminCookie;
  const deleted = await request(`/exhibits/${id}`, { method: 'DELETE' });
  assert(deleted.status === 204, `Test record cleanup failed (${deleted.status})`);
  outcomes.push({ operation: 'DELETE', endpoint: '/exhibits/{id}', caseId: 'API-DELETE-BY-ID-204', field: 'id', expected: 204, observed: deleted.status });
  cleanupId = null;

  const afterDelRead = await request(`/exhibits/${id}`);
  assert(afterDelRead.status === 404, `Deleted exhibit still returned ${afterDelRead.status}`);

  const report = {
    capturedAt: new Date().toISOString(),
    baseline: { commit: baselineCommit, runId },
    setup: { login: login.status, health: health.status, categoryCount: categoryResponse.body.length, unauthenticatedRead: unauthRead.status, viewerAccess },
    created: { status: created.status, id, displayId: created.body.displayId },
    coverageMatrix: buildCoverageMatrix(outcomes),
    generatedCases: { source: generated.generatedFrom, total: outcomes.length, outcomes },
    lifecycle: { rejectedPublish: rejectedPublish.status, validate: validated.status, publish: published.status, repeatedPublish: repeated.status, recordsWithId: duplicateMatches, final: { validated: readback.body.validated, published: readback.body.published } },
    cleanup: { softDelete: deleted.status, postDeleteReadback: afterDelRead.status, testRecordId: id },
  };
  fs.writeFileSync('docs/team/evidence/api/api-run.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch(async (error) => {
  if (cleanupId) {
    try {
      const cleaned = await request(`/exhibits/${cleanupId}`, { method: 'DELETE' });
      console.error(`Cleanup after failure: ${cleaned.status}`);
    } catch (cleanupError) {
      console.error(`Could not clean up synthetic record ${cleanupId}: ${cleanupError}`);
    }
  }
  console.error(error);
  process.exitCode = 1;
});
