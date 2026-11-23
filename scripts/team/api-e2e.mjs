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
  await new Promise((resolve) => setTimeout(resolve, 75));
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

async function main() {
  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    }),
  });
  assert(login.status === 200, `Admin login failed (${login.status}); set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD`);
  const health = await request('/health');
  assert(health.status === 200, `API health failed (${health.status})`);
  const categoryResponse = await request('/categories');
  assert(categoryResponse.status === 200 && categoryResponse.body.length > 0, 'No seeded exhibit category is available');
  const categoryId = categoryResponse.body[0].id;
  const unauthenticated = await fetch(base + '/exhibits');
  assert(unauthenticated.status === 401, `Unauthenticated exhibit read expected 401, got ${unauthenticated.status}`);
  outcomes.push({ operation: 'GET', caseId: 'API-AUTH-401', expected: 401, observed: unauthenticated.status });
  let viewerAccess = { status: 'not-run', reason: 'Set TEST_VIEWER_EMAIL and TEST_VIEWER_PASSWORD to execute the authenticated 403 checks' };

  // Run the same generated input partitions against the create contract (POST).
  // Unique synthetic names and immediate soft deletion keep this repeatable.
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
      assert(result.status === (item.valid ? 201 : 400), `POST ${field} ${item.partitions.join('|')}: expected ${item.valid ? 201 : 400}, got ${result.status} (${JSON.stringify(result.body)})`);
      if (item.valid) {
        assert(result.body?.id, `POST ${field} returned no record id`);
        const removed = await request(`/exhibits/${result.body.id}`, { method: 'DELETE' });
        assert(removed.status === 204, `POST ${field} cleanup failed (${removed.status})`);
        cleanupId = null;
      }
      outcomes.push({ operation: 'POST', caseId: `API-POST-${field.toUpperCase()}-${createCaseIndex}`, field, partitions: item.partitions, techniques: item.techniques, expected: item.valid ? 201 : 400, observed: result.status });
    }
  }
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
  outcomes.push({ operation: 'POST', caseId: 'API-POST-READBACK-01', expected: 201, observed: created.status, readback: 'verified below' });
  const id = created.body.id;
  cleanupId = id;
  const persistedValues = { exhibitName: created.body.exhibitName, categoryId: created.body.categoryId, year: created.body.year, collectiblePrice: normalize('collectiblePrice', created.body.collectiblePrice) };

  let patchCaseIndex = 0;
  for (const field of ['exhibitName', 'categoryId', 'year', 'collectiblePrice']) {
    for (const item of generated.properties[field].cases) {
      if (!item.exists) continue;
      patchCaseIndex += 1;
      const value = item.value === '__CATEGORY_ID__' ? categoryId : item.value;
      const result = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) });
      assert(result.status === (item.valid ? 200 : 400), `${field} ${item.partitions.join('|')}: expected ${item.valid ? 200 : 400}, got ${result.status} (${JSON.stringify(result.body)})`);
      const readback = await request(`/exhibits/${id}`);
      assert(readback.status === 200, `${field} ${item.partitions.join('|')}: exhibit read-back failed (${readback.status})`);
      const expectedValue = normalize(field, item.valid ? value : persistedValues[field]);
      const observedValue = normalize(field, readback.body[field]);
      assert(observedValue === expectedValue, `${field} ${item.partitions.join('|')}: persisted state changed unexpectedly (expected ${expectedValue}, got ${readback.body[field]})`);
      if (item.valid) persistedValues[field] = value;
      outcomes.push({ operation: 'PATCH', caseId: `API-PATCH-${field.toUpperCase()}-${patchCaseIndex}`, field, partitions: item.partitions, techniques: item.techniques, expected: item.valid ? 200 : 400, observed: result.status, readback: readback.body[field] });
    }
  }

  const restoredName = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ exhibitName: `${runId} workflow record` }) });
  assert(restoredName.status === 200, `Could not restore the unique name used for duplicate detection (${restoredName.status})`);

  const rejectedPublish = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ published: true }) });
  assert(rejectedPublish.status === 400, `Unvalidated publish should reject (got ${rejectedPublish.status})`);
  let readback = await request(`/exhibits/${id}`);
  assert(readback.status === 200 && readback.body.validated === false && readback.body.published === false, 'Rejected publish changed persisted state');
  outcomes.push({ operation: 'PATCH', caseId: 'API-LIFECYCLE-REJECT-01', expected: 400, observed: rejectedPublish.status });

  const validated = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ validated: true }) });
  assert(validated.status === 200 && validated.body.validated, `Validation failed (${validated.status})`);
  outcomes.push({ operation: 'PATCH', caseId: 'API-LIFECYCLE-VALIDATE-01', expected: 200, observed: validated.status });
  const published = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ published: true }) });
  assert(published.status === 200 && published.body.published, `Publish failed (${published.status})`);
  outcomes.push({ operation: 'PATCH', caseId: 'API-LIFECYCLE-PUBLISH-01', expected: 200, observed: published.status });
  const terminal = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ validated: false, published: false }) });
  assert(terminal.status === 400, `Published-to-draft transition expected 400, got ${terminal.status}`);
  const terminalReadback = await request(`/exhibits/${id}`);
  assert(terminalReadback.status === 200 && terminalReadback.body.published, 'Rejected published-to-draft transition changed state');
  outcomes.push({ operation: 'PATCH', caseId: 'API-LIFECYCLE-PUBLISHED-TO-DRAFT', expected: 400, observed: terminal.status });
  const missing = await request('/exhibits/ffffffff-ffff-4fff-8fff-ffffffffffff');
  assert(missing.status === 404, `Missing exhibit expected 404, got ${missing.status}`);
  outcomes.push({ operation: 'GET', caseId: 'API-EXHIBIT-404', expected: 404, observed: missing.status });
  const repeated = await request(`/exhibits/${id}`, { method: 'PATCH', body: JSON.stringify({ published: true }) });
  assert(repeated.status === 200 && repeated.body.id === id, 'Repeated publish request did not resolve to the same record');
  readback = await request(`/exhibits/${id}`);
  assert(readback.status === 200 && readback.body.validated && readback.body.published, 'Final state read-back failed');
  const search = await request(`/exhibits?categoryId=${encodeURIComponent(categoryId)}&limit=100`);
  const duplicateMatches = search.body?.items?.filter((item) => item.id === id).length ?? 0;
  assert(search.status === 200 && duplicateMatches === 1, `Repeated workflow request created a duplicate record: ${JSON.stringify(search)}`);

  // Run role-changing login checks after the admin workflow, then restore an
  // admin session for fixture cleanup.
  if (process.env.TEST_VIEWER_EMAIL && process.env.TEST_VIEWER_PASSWORD) {
    const viewerLogin = await request('/auth/login', { method: 'POST', body: JSON.stringify({ identifier: process.env.TEST_VIEWER_EMAIL, password: process.env.TEST_VIEWER_PASSWORD }) });
    assert(viewerLogin.status === 200, `Viewer login failed (${viewerLogin.status})`);
    const deniedCreate = await request('/exhibits', { method: 'POST', body: JSON.stringify({ categoryId, exhibitName: `${runId} forbidden viewer create`, year: 2000, collectiblePrice: 1, attributes: {} }) });
    assert(deniedCreate.status === 403, `Viewer create expected 403, got ${deniedCreate.status}`);
    outcomes.push({ operation: 'POST', caseId: 'API-AUTH-403-CREATE', expected: 403, observed: deniedCreate.status });
    viewerAccess = { login: viewerLogin.status, create: deniedCreate.status };
    const adminRestore = await request('/auth/login', { method: 'POST', body: JSON.stringify({ identifier: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD }) });
    assert(adminRestore.status === 200, `Admin re-login for cleanup failed (${adminRestore.status})`);
  }

  const report = {
    baseline: { commit: baselineCommit, runId },
    setup: { login: login.status, health: health.status, categoryCount: categoryResponse.body.length, unauthenticatedRead: unauthenticated.status, viewerAccess },
    created: { status: created.status, id, displayId: created.body.displayId },
    generatedCases: { source: generated.generatedFrom, total: outcomes.length, outcomes },
    lifecycle: { rejectedPublish: rejectedPublish.status, validate: validated.status, publish: published.status, repeatedPublish: repeated.status, recordsWithId: duplicateMatches, final: { validated: readback.body.validated, published: readback.body.published } },
    cleanup: { softDelete: 'pending' },
  };
  const deleted = await request(`/exhibits/${id}`, { method: 'DELETE' });
  assert(deleted.status === 204, `Test record cleanup failed (${deleted.status})`);
  cleanupId = null;
  report.cleanup = { softDelete: deleted.status, testRecordId: id };
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
