import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  apiRequest,
  cleanupExhibits,
  clearSessionContext,
  createDraftThroughApi,
  EVIDENCE_SEC_DIR,
  loginAdmin,
  loginRole,
  recordAccessChecks,
  resetAccessChecks,
} from './helpers';

const cleanupIds: string[] = [];
test.setTimeout(60_000);

test.afterEach(async ({ page }) => {
  await cleanupExhibits(page, cleanupIds);
});

test.describe('UC-03: Access control and role boundaries (Huzaifa Ali)', () => {
  test.beforeAll(() => {
    resetAccessChecks();
  });

  test('UC-03 Main: authenticated viewer sees viewer role in UI and reads catalogue (200)', async ({ page }) => {
    await loginRole(page, 'viewer');
    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /exhibits/i })).toBeVisible();
    await expect(page.getByText('viewer', { exact: true })).toBeVisible();

    const viewerRead = await apiRequest(page, 'GET', '/api/exhibits');
    expect(viewerRead.status).toBe(200);

    recordAccessChecks([
      {
        role: 'viewer',
        action: 'read exhibit catalogue',
        endpoint: 'GET /api/exhibits',
        expected: 200,
        observed: viewerRead.status,
        statePreserved: true,
      },
    ]);
  });

  test('UC-03-A1: curator creates draft exhibit and administrator completes validation in UI', async ({ page }) => {
    await loginRole(page, 'curator');
    const curatorRead = await apiRequest(page, 'GET', '/api/exhibits');
    expect(curatorRead.status).toBe(200);

    const draft = await createDraftThroughApi(page, `SQE UC03 Handoff ${Date.now()}`, cleanupIds);

    await loginAdmin(page);
    await page.goto(`/exhibits/${draft.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.getByRole('switch', { name: 'Validated' }).click();
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('switch', { name: 'Validated' })).toHaveCount(0);

    const readback = await apiRequest(page, 'GET', `/api/exhibits/${draft.id}`);
    expect(readback.status).toBe(200);
    expect((readback.body as Record<string, unknown>).validated).toBe(true);

    recordAccessChecks([
      { role: 'curator', action: 'read exhibit catalogue', endpoint: 'GET /api/exhibits', expected: 200, observed: curatorRead.status, statePreserved: true },
      { role: 'curator', action: 'create draft exhibit', endpoint: 'POST /api/exhibits', expected: 201, observed: 201, statePreserved: true },
      { role: 'admin', action: 'validate exhibit', endpoint: 'PATCH /api/exhibits/:id', expected: 200, observed: 200, statePreserved: true },
    ]);
  });

  test('UC-03-A2: verifies httpOnly/SameSite session cookie and enforces 401 unauthenticated redirect and API denials', async ({
    page,
  }) => {
    await loginAdmin(page);
    const target = await createDraftThroughApi(page, `SQE UC03 Unauth Target ${Date.now()}`, cleanupIds);

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

    // Clear session without touching server cache key and verify UI redirects /exhibits -> /login
    await clearSessionContext(page);
    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('#identifier')).toBeVisible();

    const unauthGet = await apiRequest(page, 'GET', '/api/exhibits');
    expect(unauthGet.status).toBe(401);
    const unauthPost = await apiRequest(page, 'POST', '/api/exhibits', {
      categoryId: target.categoryId,
      exhibitName: `SQE Unauth Create ${Date.now()}`,
      attributes: {},
    });
    expect(unauthPost.status).toBe(401);
    const unauthPatch = await apiRequest(page, 'PATCH', `/api/exhibits/${target.id}`, { validated: true });
    expect(unauthPatch.status).toBe(401);

    await loginAdmin(page);
    const afterUnauth = await apiRequest(page, 'GET', `/api/exhibits/${target.id}`);
    expect(afterUnauth.status).toBe(200);
    expect((afterUnauth.body as Record<string, unknown>).validated).toBe(false);

    recordAccessChecks([
      { role: 'unauthenticated', action: 'read exhibit catalogue', endpoint: 'GET /api/exhibits', expected: 401, observed: unauthGet.status, statePreserved: true },
      { role: 'unauthenticated', action: 'create exhibit', endpoint: 'POST /api/exhibits', expected: 401, observed: unauthPost.status, statePreserved: true },
      { role: 'unauthenticated', action: 'validate exhibit', endpoint: 'PATCH /api/exhibits/:id', expected: 401, observed: unauthPatch.status, statePreserved: true },
    ]);
  });

  test('UC-03-E1: viewer create/validate and curator validate/publish return 403 with read-back proving zero state change', async ({
    page,
  }) => {
    await loginAdmin(page);
    const target = await createDraftThroughApi(page, `SQE UC03 E1 Target ${Date.now()}`, cleanupIds);

    // Viewer RBAC checks + UI create denial + read-back verification
    await loginRole(page, 'viewer');
    const deniedName = `SQE Viewer Denied ${Date.now()}`;
    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /add exhibit/i }).click();
    const form = page.locator('form').last();
    const firstOpt = await form.locator('#new-exhibit-category option').nth(1).getAttribute('value');
    await form.locator('#new-exhibit-category').selectOption(firstOpt!);
    await form.locator('#new-exhibit-name').fill(deniedName);
    await form.getByRole('button', { name: /^create$/i }).click();
    await expect(form.locator('.text-destructive')).toBeVisible();

    const viewerCreate = await apiRequest(page, 'POST', '/api/exhibits', {
      categoryId: target.categoryId,
      exhibitName: deniedName,
      attributes: {},
    });
    expect(viewerCreate.status).toBe(403);
    const searchAfterViewerCreate = await apiRequest(page, 'GET', `/api/exhibits?q=${encodeURIComponent(deniedName)}`);
    expect(searchAfterViewerCreate.status).toBe(200);
    expect(((searchAfterViewerCreate.body as { items?: unknown[] }).items ?? [])).toHaveLength(0);

    const viewerValidate = await apiRequest(page, 'PATCH', `/api/exhibits/${target.id}`, { validated: true });
    expect(viewerValidate.status).toBe(403);

    await loginAdmin(page);
    let readback = await apiRequest(page, 'GET', `/api/exhibits/${target.id}`);
    expect(readback.status).toBe(200);
    expect((readback.body as Record<string, unknown>).validated).toBe(false);
    expect((readback.body as Record<string, unknown>).published).toBe(false);

    // Curator validate/publish denial checks + read-back verification
    await loginRole(page, 'curator');
    const curatorValidate = await apiRequest(page, 'PATCH', `/api/exhibits/${target.id}`, { validated: true });
    expect(curatorValidate.status).toBe(403);

    await loginAdmin(page);
    readback = await apiRequest(page, 'GET', `/api/exhibits/${target.id}`);
    expect(readback.status).toBe(200);
    expect((readback.body as Record<string, unknown>).validated).toBe(false);
    expect((readback.body as Record<string, unknown>).published).toBe(false);

    await loginRole(page, 'curator');
    const curatorPublish = await apiRequest(page, 'PATCH', `/api/exhibits/${target.id}`, { published: true });
    expect(curatorPublish.status).toBe(403);

    await loginAdmin(page);
    readback = await apiRequest(page, 'GET', `/api/exhibits/${target.id}`);
    expect(readback.status).toBe(200);
    expect((readback.body as Record<string, unknown>).validated).toBe(false);
    expect((readback.body as Record<string, unknown>).published).toBe(false);

    recordAccessChecks([
      { role: 'viewer', action: 'create exhibit', endpoint: 'POST /api/exhibits', expected: 403, observed: viewerCreate.status, statePreserved: true },
      { role: 'viewer', action: 'validate exhibit', endpoint: 'PATCH /api/exhibits/:id', expected: 403, observed: viewerValidate.status, statePreserved: true },
      { role: 'curator', action: 'validate exhibit', endpoint: 'PATCH /api/exhibits/:id', expected: 403, observed: curatorValidate.status, statePreserved: true },
      { role: 'curator', action: 'publish exhibit', endpoint: 'PATCH /api/exhibits/:id', expected: 403, observed: curatorPublish.status, statePreserved: true },
    ]);
  });

  test('UC-03-E2: requesting a nonexistent exhibit returns 404 and displays Exhibit not found UI', async ({ page }) => {
    await loginAdmin(page);
    const missingId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const missingResp = await apiRequest(page, 'GET', `/api/exhibits/${missingId}`);
    expect(missingResp.status).toBe(404);

    await page.goto(`/exhibits/${missingId}`, { waitUntil: 'networkidle' });
    await expect(page.getByText(/exhibit not found/i)).toBeVisible();
  });
});

test.describe('UC-04: Search and inspect an exhibit (Burhan Ahmed)', () => {
  test('UC-04 Main: searches by unique exhibit name in UI, opens detail, and confirms read-only postcondition', async ({
    page,
  }) => {
    await loginAdmin(page);
    const uniqueToken = `SQEFind${Date.now()}`;
    const created = await createDraftThroughApi(page, `${uniqueToken} Retro Machine`, cleanupIds);

    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    const searchInput = page.getByPlaceholder(/search exhibits/i);
    await expect(searchInput).toBeVisible();

    const searchPromise = page.waitForResponse(
      (res) => res.url().includes('/api/exhibits') && res.url().includes(encodeURIComponent(uniqueToken)),
    );
    await searchInput.fill(uniqueToken);
    const searchResp = await searchPromise;
    expect(searchResp.status()).toBe(200);
    await expect(page.getByText(created.exhibitName)).toBeVisible({ timeout: 10_000 });

    await page.getByText(created.exhibitName).click();
    await expect(page).toHaveURL(new RegExp(`/exhibits/${created.id}$`));
    await expect(page.getByRole('heading', { name: created.exhibitName })).toBeVisible();
    await expect(page.getByText(created.displayId)).toBeVisible();

    const readback = await apiRequest(page, 'GET', `/api/exhibits/${created.id}`);
    expect(readback.status).toBe(200);
    expect((readback.body as Record<string, unknown>).updatedAt).toBe(created.updatedAt);
  });

  test('UC-04-A1: category filter narrows visible exhibits to matching category in UI', async ({ page }) => {
    await loginAdmin(page);
    const uniqueToken = `SQECat${Date.now()}`;
    const created = await createDraftThroughApi(page, `${uniqueToken} Scoped Exhibit`, cleanupIds);
    const catsResp = await apiRequest(page, 'GET', '/api/categories');
    const categories = catsResp.body as Array<{ id: string }>;
    const otherCat = categories.find((c) => c.id !== created.categoryId);
    expect(otherCat).toBeTruthy();

    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    const searchPromise = page.waitForResponse(
      (res) => res.url().includes('/api/exhibits') && res.url().includes(encodeURIComponent(uniqueToken)) && res.status() === 200,
    );
    await page.getByPlaceholder(/search exhibits/i).fill(uniqueToken);
    await searchPromise;
    await expect(page.getByText(created.exhibitName)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /filters/i }).click();
    const categorySelect = page.locator('select').first();
    await categorySelect.selectOption(created.categoryId);
    await expect(categorySelect).toHaveValue(created.categoryId);
    await expect(page.getByText(created.exhibitName)).toBeVisible();

    await categorySelect.selectOption(otherCat!.id);
    await expect(categorySelect).toHaveValue(otherCat!.id);
    await expect(page.getByText(/no exhibits found/i)).toBeVisible({ timeout: 10_000 });
  });

  test('UC-04-A2: unmatched search renders No exhibits found empty state cleanly', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    await page.getByPlaceholder(/search exhibits/i).fill(`NoMatchTokenXYZ${Date.now()}`);
    await expect(page.getByText(/no exhibits found/i)).toBeVisible({ timeout: 10_000 });
  });

  test('UC-04-E1: special characters in search and invalid numeric filter return safe 400/empty without 500', async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.goto('/exhibits', { waitUntil: 'networkidle' });
    await page.getByPlaceholder(/search exhibits/i).fill('!!!@@@###$$$');
    await expect(page.getByText(/no exhibits found/i)).toBeVisible({ timeout: 10_000 });

    const badFilterApi = await apiRequest(page, 'GET', '/api/exhibits?yearFrom=notanumber');
    expect(badFilterApi.status).toBe(400);
  });

  test('UC-04-E2: nonexistent exhibit ID displays Exhibit not found UI state cleanly', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/exhibits/ffffffff-ffff-4fff-8fff-ffffffffffff', { waitUntil: 'networkidle' });
    await expect(page.getByText(/exhibit not found/i)).toBeVisible({ timeout: 10_000 });
  });
});
