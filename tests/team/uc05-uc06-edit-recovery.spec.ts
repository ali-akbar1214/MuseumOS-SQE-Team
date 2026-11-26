import { test, expect } from '@playwright/test';
import {
  apiRequest,
  cleanupExhibits,
  createDraftThroughApi,
  loginAdmin,
  loginRole,
} from './helpers';

const cleanupIds: string[] = [];
test.setTimeout(60_000);

test.afterEach(async ({ page }) => {
  await cleanupExhibits(page, cleanupIds);
});

test.describe('UC-05: Correct exhibit data before validation (Ali Akbar)', () => {
  test('UC-05 Main: curator edits draft metadata in UI and preserves unvalidated draft state', async ({ page }) => {
    await loginAdmin(page);
    const draft = await createDraftThroughApi(page, `SQE UC05 Main ${Date.now()}`, cleanupIds, {
      year: 1991,
      collectiblePrice: 40,
    });

    await loginRole(page, 'curator');
    await page.goto(`/exhibits/${draft.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^edit$/i }).click();

    const updatedName = `SQE UC05 Main Updated ${Date.now()}`;
    await page.locator('input').first().fill(updatedName);
    await page.getByPlaceholder('1985').fill('1994');
    await page.getByPlaceholder('0.00').fill('125');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('heading', { name: updatedName })).toBeVisible();

    const readback = await apiRequest(page, 'GET', `/api/exhibits/${draft.id}`);
    expect(readback.status).toBe(200);
    expect((readback.body as Record<string, unknown>).exhibitName).toBe(updatedName);
    expect((readback.body as Record<string, unknown>).year).toBe(1994);
    expect(Number((readback.body as Record<string, unknown>).collectiblePrice)).toBe(125);
    expect((readback.body as Record<string, unknown>).validated).toBe(false);
    expect((readback.body as Record<string, unknown>).published).toBe(false);
  });

  test('UC-05-A1: curator clears optional year and collectible price to null via UI', async ({ page }) => {
    await loginAdmin(page);
    const draft = await createDraftThroughApi(page, `SQE UC05 A1 Clear ${Date.now()}`, cleanupIds, {
      year: 1995,
      collectiblePrice: 80,
    });

    await loginRole(page, 'curator');
    await page.goto(`/exhibits/${draft.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.getByPlaceholder('1985').fill('');
    await page.getByPlaceholder('0.00').fill('');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('button', { name: /^edit$/i })).toBeVisible();

    const readback = await apiRequest(page, 'GET', `/api/exhibits/${draft.id}`);
    expect(readback.status).toBe(200);
    expect((readback.body as Record<string, unknown>).year).toBeNull();
    expect((readback.body as Record<string, unknown>).collectiblePrice).toBeNull();
  });

  test('UC-05-A2: curator renames exhibit within limits and confirms read-back', async ({ page }) => {
    await loginAdmin(page);
    const draft = await createDraftThroughApi(page, `SQE UC05 A2 Initial ${Date.now()}`, cleanupIds);

    await loginRole(page, 'curator');
    await page.goto(`/exhibits/${draft.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^edit$/i }).click();

    const renamed = `SQE UC05 A2 Renamed ${Date.now()}`;
    await page.locator('input').first().fill(renamed);
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('heading', { name: renamed })).toBeVisible();

    const readback = await apiRequest(page, 'GET', `/api/exhibits/${draft.id}`);
    expect(readback.status).toBe(200);
    expect((readback.body as Record<string, unknown>).exhibitName).toBe(renamed);
  });

  test('UC-05-E1: out-of-range year 1799 is rejected with 400 error feedback and prior data remains unchanged', async ({
    page,
  }) => {
    await loginAdmin(page);
    const draft = await createDraftThroughApi(page, `SQE UC05 E1 BadYear ${Date.now()}`, cleanupIds, {
      year: 1995,
    });

    await loginRole(page, 'curator');
    await page.goto(`/exhibits/${draft.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.getByPlaceholder('1985').fill('1799');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.locator('.text-destructive').first()).toBeVisible();

    const readback = await apiRequest(page, 'GET', `/api/exhibits/${draft.id}`);
    expect(readback.status).toBe(200);
    expect((readback.body as Record<string, unknown>).year).toBe(1995);
  });

  test('UC-05-E2: curator cannot force lifecycle escalation via PATCH and record stays unvalidated', async ({
    page,
  }) => {
    await loginAdmin(page);
    const draft = await createDraftThroughApi(page, `SQE UC05 E2 Lifecycle ${Date.now()}`, cleanupIds);

    await loginRole(page, 'curator');
    const resp = await apiRequest(page, 'PATCH', `/api/exhibits/${draft.id}`, {
      validated: true,
      published: true,
    });
    expect(resp.status).toBe(403);

    await loginAdmin(page);
    const readback = await apiRequest(page, 'GET', `/api/exhibits/${draft.id}`);
    expect(readback.status).toBe(200);
    expect((readback.body as Record<string, unknown>).validated).toBe(false);
    expect((readback.body as Record<string, unknown>).published).toBe(false);
  });
});

test.describe('UC-06: Recover safely from a failed write (Huzaifa Ali)', () => {
  test('UC-06 Main: failed PATCH preserves initial state and subsequent retry persists updated value', async ({
    page,
  }) => {
    await loginAdmin(page);
    const exhibit = await createDraftThroughApi(page, `SQE UC06 Main ${Date.now()}`, cleanupIds, { year: 1988 });

    await page.goto(`/exhibits/${exhibit.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^edit$/i }).click();

    let failOnce = true;
    await page.route(`**/api/exhibits/${exhibit.id}`, async (route) => {
      if (route.request().method() === 'PATCH' && failOnce) {
        failOnce = false;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    await page.getByPlaceholder('1985').fill('1999');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.locator('.text-destructive').first()).toBeVisible();

    let persisted = await apiRequest(page, 'GET', `/api/exhibits/${exhibit.id}`);
    expect((persisted.body as Record<string, unknown>).year).toBe(1988);

    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('button', { name: /^edit$/i })).toBeVisible();

    persisted = await apiRequest(page, 'GET', `/api/exhibits/${exhibit.id}`);
    expect((persisted.body as Record<string, unknown>).year).toBe(1999);
  });

  test('UC-06-A1: immediate retry after transient failure saves on same ID and exits edit mode', async ({ page }) => {
    await loginAdmin(page);
    const exhibit = await createDraftThroughApi(page, `SQE UC06 A1 Retry ${Date.now()}`, cleanupIds, { year: 1982 });

    await page.goto(`/exhibits/${exhibit.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^edit$/i }).click();

    let failFirst = true;
    await page.route(`**/api/exhibits/${exhibit.id}`, async (route) => {
      if (route.request().method() === 'PATCH' && failFirst) {
        failFirst = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Temporary outage"}' });
        return;
      }
      await route.continue();
    });

    await page.getByPlaceholder('1985').fill('2001');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.locator('.text-destructive').first()).toBeVisible();

    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('button', { name: /^edit$/i })).toBeVisible();

    const persisted = await apiRequest(page, 'GET', `/api/exhibits/${exhibit.id}`);
    expect((persisted.body as Record<string, unknown>).id).toBe(exhibit.id);
    expect((persisted.body as Record<string, unknown>).year).toBe(2001);
  });

  test('UC-06-A2: repeating identical PATCH request is idempotent with exactly one record', async ({ page }) => {
    await loginAdmin(page);
    const exhibit = await createDraftThroughApi(page, `SQE UC06 A2 Repeat ${Date.now()}`, cleanupIds, { year: 1990 });

    expect((await apiRequest(page, 'PATCH', `/api/exhibits/${exhibit.id}`, { year: 2005 })).status).toBe(200);
    expect((await apiRequest(page, 'PATCH', `/api/exhibits/${exhibit.id}`, { year: 2005 })).status).toBe(200);

    const search = await apiRequest(
      page,
      'GET',
      `/api/exhibits?q=${encodeURIComponent(exhibit.exhibitName)}`,
    );
    expect(search.status).toBe(200);
    const matches = ((search.body as { items?: Array<{ id: string }> }).items ?? []).filter((r) => r.id === exhibit.id);
    expect(matches).toHaveLength(1);
  });

  test('UC-06-E1: transient 503 failure shows error banner and leaves old DB value untouched', async ({ page }) => {
    await loginAdmin(page);
    const exhibit = await createDraftThroughApi(page, `SQE UC06 E1 Abort ${Date.now()}`, cleanupIds, { year: 1988 });

    await page.goto(`/exhibits/${exhibit.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^edit$/i }).click();

    await page.route(`**/api/exhibits/${exhibit.id}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Service unavailable"}' });
        return;
      }
      await route.continue();
    });

    await page.getByPlaceholder('1985').fill('2010');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.locator('.text-destructive').first()).toBeVisible();

    const persisted = await apiRequest(page, 'GET', `/api/exhibits/${exhibit.id}`);
    expect(persisted.status).toBe(200);
    expect((persisted.body as Record<string, unknown>).year).toBe(1988);
  });

  test('UC-06-E2: soft-delete cleanup removes synthetic test fixture so subsequent read returns 404', async ({
    page,
  }) => {
    await loginAdmin(page);
    const transientIds: string[] = [];
    const fixture = await createDraftThroughApi(page, `SQE UC06 E2 Cleanup ${Date.now()}`, transientIds, { year: 1985 });
    await cleanupExhibits(page, transientIds);

    const afterDelete = await apiRequest(page, 'GET', `/api/exhibits/${fixture.id}`);
    expect(afterDelete.status).toBe(404);
  });
});
