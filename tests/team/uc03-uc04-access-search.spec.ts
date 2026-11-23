import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  apiRequest,
  cleanupExhibits,
  createDraftThroughApi,
  CURATOR_EMAIL,
  CURATOR_PASSWORD,
  EVIDENCE_SEC_DIR,
  loginAdmin,
  loginAs,
  logoutViaApi,
  VIEWER_EMAIL,
  VIEWER_PASSWORD,
} from './helpers';

const cleanupIds: string[] = [];
test.setTimeout(60_000);

test.afterEach(async ({ page }) => {
  await cleanupExhibits(page, cleanupIds);
});

test.describe('UC-03: Access control and role boundaries (Huzaifa Ali)', () => {
  test('UC-03 Main + A1 + E1 + E2: verifies viewer/curator/admin RBAC matrix, cookie attributes, and 404 handling', async ({
    page,
  }) => {
    const checks: Array<{ role: string; action: string; expected: number; observed: number; evidence: string }> = [];

    // Viewer role checks
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD);

    // Inspect session cookie attributes in browser context
    const cookies = await page.context().cookies();
    const sidCookie = cookies.find((c) => c.name === 'museumos.sid');
    expect(sidCookie).toBeTruthy();
    expect(sidCookie!.httpOnly).toBe(true);
    expect(sidCookie!.sameSite).toBe('Lax');
    fs.writeFileSync(
      path.join(EVIDENCE_SEC_DIR, 'cookie-security-check.json'),
      `${JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          cookieName: sidCookie!.name,
          httpOnly: sidCookie!.httpOnly,
          sameSite: sidCookie!.sameSite,
          secure: sidCookie!.secure,
          path: sidCookie!.path,
        },
        null,
        2,
      )}\n`,
    );

    const viewerRead = await apiRequest(page, 'GET', '/api/exhibits');
    checks.push({ role: 'viewer', action: 'read exhibit catalogue', expected: 200, observed: viewerRead.status, evidence: 'GET /api/exhibits' });
    expect(viewerRead.status).toBe(200);

    const viewerCreate = await apiRequest(page, 'POST', '/api/exhibits', {
      categoryId: '10000000-0000-4000-8000-000000000001',
      exhibitName: `SQE Viewer Denied ${Date.now()}`,
      attributes: {},
    });
    checks.push({ role: 'viewer', action: 'create exhibit', expected: 403, observed: viewerCreate.status, evidence: 'POST /api/exhibits' });
    expect(viewerCreate.status).toBe(403);

    await logoutViaApi(page);

    // Curator role checks (UC-03-A1 handoff create + UC-03-E1 lifecycle denial)
    await loginAs(page, CURATOR_EMAIL, CURATOR_PASSWORD);
    const curatorRead = await apiRequest(page, 'GET', '/api/exhibits');
    checks.push({ role: 'curator', action: 'read exhibit catalogue', expected: 200, observed: curatorRead.status, evidence: 'GET /api/exhibits' });
    expect(curatorRead.status).toBe(200);

    const categories = await apiRequest(page, 'GET', '/api/categories');
    expect(categories.status).toBe(200);
    const catList = categories.body as Array<{ id: string }>;

    const curatorCreate = await apiRequest(page, 'POST', '/api/exhibits', {
      categoryId: catList[0]!.id,
      exhibitName: `SQE Curator Handoff ${Date.now()}`,
      attributes: {},
    });
    checks.push({ role: 'curator', action: 'create exhibit', expected: 201, observed: curatorCreate.status, evidence: 'POST /api/exhibits' });
    expect(curatorCreate.status).toBe(201);
    const createdId = (curatorCreate.body as { id: string }).id;
    cleanupIds.push(createdId);

    const curatorValidate = await apiRequest(page, 'PATCH', `/api/exhibits/${createdId}`, { validated: true });
    checks.push({ role: 'curator', action: 'validate exhibit', expected: 403, observed: curatorValidate.status, evidence: `PATCH /api/exhibits/${createdId}` });
    expect(curatorValidate.status).toBe(403);

    const curatorPublish = await apiRequest(page, 'PATCH', `/api/exhibits/${createdId}`, { published: true });
    checks.push({ role: 'curator', action: 'publish exhibit', expected: 403, observed: curatorPublish.status, evidence: `PATCH /api/exhibits/${createdId}` });
    expect(curatorPublish.status).toBe(403);

    await logoutViaApi(page);

    // Admin completes handoff validation & tests 404 (UC-03-E2)
    await loginAdmin(page);
    const adminValidate = await apiRequest(page, 'PATCH', `/api/exhibits/${createdId}`, { validated: true });
    checks.push({ role: 'admin', action: 'validate exhibit', expected: 200, observed: adminValidate.status, evidence: `PATCH /api/exhibits/${createdId}` });
    expect(adminValidate.status).toBe(200);

    const missingResp = await apiRequest(page, 'GET', '/api/exhibits/ffffffff-ffff-4fff-8fff-ffffffffffff');
    expect(missingResp.status).toBe(404);

    fs.writeFileSync(
      path.join(EVIDENCE_SEC_DIR, 'access-checks.json'),
      `${JSON.stringify({ capturedAt: new Date().toISOString(), checks }, null, 2)}\n`,
    );
  });
});

test.describe('UC-04: Search and inspect an exhibit (Burhan Ahmed)', () => {
  test('UC-04 Main + A1 + A2 + E1 + E2: search, category filter, empty state, invalid query, and unknown ID 404', async ({
    page,
  }) => {
    // Allow the 10 s medium ThrottlerGuard window to drain after UC-03's 3-role login burst without weakening production rate limits.
    await page.waitForTimeout(6_000);
    await loginAdmin(page);
    const uniqueToken = `SQEFind${Date.now()}`;
    const created = await createDraftThroughApi(page, `${uniqueToken} Retro Machine`, cleanupIds);

    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    const searchInput = page.getByPlaceholder(/search exhibits/i);
    await expect(searchInput).toBeVisible();

    // UC-04 Main: search by unique name and inspect detail
    const searchPromise = page.waitForResponse(
      (res) => res.url().includes('/api/exhibits') && res.url().includes(encodeURIComponent(uniqueToken)),
    );
    await searchInput.fill(uniqueToken);
    const searchResp = await searchPromise;
    expect(searchResp.status()).toBe(200);
    await expect(page.getByText(created.exhibitName)).toBeVisible({ timeout: 10_000 });

    // UC-04-A1: narrow with category filter
    await page.getByRole('button', { name: /filters/i }).click();
    const categorySelect = page.locator('select').first();
    await categorySelect.selectOption(created.categoryId);
    await expect(page.getByText(created.exhibitName)).toBeVisible();

    // Open detail and verify displayId and postcondition (read-only)
    await page.getByText(created.exhibitName).click();
    await expect(page).toHaveURL(new RegExp(`/exhibits/${created.id}$`));
    await expect(page.getByText(created.displayId)).toBeVisible();

    // UC-04-A2: no matching result shows understandable empty state
    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    await searchInput.fill(`NoMatchTokenXYZ${Date.now()}`);
    await expect(page.getByText(/no exhibits found/i)).toBeVisible({ timeout: 10_000 });

    // UC-04-E1: special/invalid search text does not trigger 500
    await searchInput.fill('!!!@@@###$$$');
    await page.waitForTimeout(500);
    const badFilterApi = await apiRequest(page, 'GET', '/api/exhibits?yearFrom=notanumber');
    expect(badFilterApi.status).toBe(400);

    // UC-04-E2: nonexistent exhibit ID displays not-found UI cleanly
    await page.goto('/exhibits/ffffffff-ffff-4fff-8fff-ffffffffffff');
    await expect(page.getByText(/exhibit not found/i)).toBeVisible({ timeout: 10_000 });
  });
});
