import { test, expect } from '@playwright/test';
import {
  apiRequest,
  cleanupExhibits,
  createDraftThroughApi,
  CURATOR_EMAIL,
  CURATOR_PASSWORD,
  loginAdmin,
  loginAs,
  logoutViaApi,
} from './helpers';

const cleanupIds: string[] = [];
test.setTimeout(60_000);

test.afterEach(async ({ page }) => {
  await cleanupExhibits(page, cleanupIds);
});

test.describe('UC-05: Correct exhibit data before validation (Ali Akbar)', () => {
  test('UC-05 Main + A1 + A2 + E1 + E2: curator updates metadata, clears nullable fields, and rejects out-of-range or published edits', async ({
    page,
  }) => {
    await loginAdmin(page);
    const draft = await createDraftThroughApi(page, `SQE UC05 Draft ${Date.now()}`, cleanupIds, {
      year: 1995,
      collectiblePrice: 80,
    });
    await logoutViaApi(page);

    // Curator edits draft metadata (UC-05 Main + A2)
    await loginAs(page, CURATOR_EMAIL, CURATOR_PASSWORD);
    await page.goto(`/exhibits/${draft.id}`);
    await page.getByRole('button', { name: /^edit$/i }).click();

    const nameInput = page.locator('input').first();
    const updatedName = `SQE UC05 Renamed ${Date.now()}`;
    await nameInput.fill(updatedName);

    // UC-05-A1: clear optional year and collectible price to null
    await page.getByPlaceholder('1985').fill('');
    await page.getByPlaceholder('0.00').fill('');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('heading', { name: updatedName })).toBeVisible();

    let readback = await apiRequest(page, 'GET', `/api/exhibits/${draft.id}`);
    expect(readback.status).toBe(200);
    expect((readback.body as Record<string, unknown>).exhibitName).toBe(updatedName);
    expect((readback.body as Record<string, unknown>).year).toBeNull();
    expect((readback.body as Record<string, unknown>).collectiblePrice).toBeNull();
    expect((readback.body as Record<string, unknown>).validated).toBe(false);

    // UC-05-E1: invalid out-of-range year (1799) is rejected with 400 and leaves DB unchanged
    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.getByPlaceholder('1985').fill('1799');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.locator('.text-destructive').first()).toBeVisible();

    readback = await apiRequest(page, 'GET', `/api/exhibits/${draft.id}`);
    expect((readback.body as Record<string, unknown>).year).toBeNull();

    // UC-05-E2: curator cannot force lifecycle changes via API
    const curatorLifecycle = await apiRequest(page, 'PATCH', `/api/exhibits/${draft.id}`, {
      validated: true,
      published: true,
    });
    expect(curatorLifecycle.status).toBe(403);

    // Log back in as admin for afterEach soft-delete cleanup (curator lacks exhibit:delete)
    await logoutViaApi(page);
    await loginAdmin(page);
  });
});

test.describe('UC-06: Recover safely from a failed write (Huzaifa Ali)', () => {
  test('UC-06 Main + A1 + A2 + E1: transient write failure keeps old persisted state, retry succeeds without duplicates', async ({
    page,
  }) => {
    await loginAdmin(page);
    const exhibit = await createDraftThroughApi(page, `SQE UC06 Recovery ${Date.now()}`, cleanupIds, {
      year: 1988,
    });

    await page.goto(`/exhibits/${exhibit.id}`);
    await page.getByRole('button', { name: /^edit$/i }).click();

    // UC-06-E1 / Main: intercept PATCH to simulate transient connection drop before write completes
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

    // Error feedback shown and old DB state (year=1988) remains intact
    await expect(page.locator('.text-destructive').first()).toBeVisible();
    let persisted = await apiRequest(page, 'GET', `/api/exhibits/${exhibit.id}`);
    expect(persisted.status).toBe(200);
    expect((persisted.body as Record<string, unknown>).year).toBe(1988);

    // UC-06-A1: retry save after dependency/network restores
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('button', { name: /^edit$/i })).toBeVisible();

    persisted = await apiRequest(page, 'GET', `/api/exhibits/${exhibit.id}`);
    expect((persisted.body as Record<string, unknown>).year).toBe(1999);

    // UC-06-A2: repeat identical PATCH and confirm exactly 1 matching record exists
    const repeat = await apiRequest(page, 'PATCH', `/api/exhibits/${exhibit.id}`, { year: 1999 });
    expect(repeat.status).toBe(200);
    const search = await apiRequest(
      page,
      'GET',
      `/api/exhibits?categoryId=${encodeURIComponent(exhibit.categoryId)}&limit=100`,
    );
    const items = ((search.body as { items?: Array<{ id: string }> }).items ?? []).filter((r) => r.id === exhibit.id);
    expect(items).toHaveLength(1);
  });
});
