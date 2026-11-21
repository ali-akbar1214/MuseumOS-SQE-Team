import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel(/email|name/i).fill(process.env.TEST_ADMIN_EMAIL ?? 'admin@museumos.local');
  await page.getByLabel(/password/i).fill(process.env.TEST_ADMIN_PASSWORD ?? 'TestAdmin!2026');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('catalogue workflow login and keyboard navigation', async ({ page }) => {
  await login(page);
  await page.goto('/exhibits');
  await expect(page).toHaveURL(/\/exhibits/);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('keyboard form order reaches identifier, password, and submit', async ({ page }) => {
  await page.goto('/login');
  await page.keyboard.press('Tab');
  await expect(page.locator('#identifier')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#password')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /sign in/i })).toBeFocused();
});
