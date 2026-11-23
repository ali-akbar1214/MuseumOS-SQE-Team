import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const ADMIN_SESSION_CACHE = path.join(os.tmpdir(), 'museumos-sqe-admin-session.json');

export const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
export const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
export const VIEWER_EMAIL = process.env.TEST_VIEWER_EMAIL;
export const VIEWER_PASSWORD = process.env.TEST_VIEWER_PASSWORD;
export const CURATOR_EMAIL = process.env.TEST_CURATOR_EMAIL;
export const CURATOR_PASSWORD = process.env.TEST_CURATOR_PASSWORD;

export const EVIDENCE_A11Y_DIR = path.resolve('docs/team/evidence/accessibility');
export const EVIDENCE_SEC_DIR = path.resolve('docs/team/evidence/security');
fs.mkdirSync(EVIDENCE_A11Y_DIR, { recursive: true });
fs.mkdirSync(EVIDENCE_SEC_DIR, { recursive: true });

export async function loginAs(page: Page, identifier: string | undefined, secret: string | undefined) {
  if (!identifier || !secret) {
    throw new Error('Set the matching TEST_*_EMAIL and TEST_*_PASSWORD values for browser tests');
  }
  await page.addInitScript(() => localStorage.setItem('lang', 'en'));
  await page.goto('/login');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill(secret);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForTimeout(800);
}

export async function loginAdmin(page: Page) {
  if (fs.existsSync(ADMIN_SESSION_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(ADMIN_SESSION_CACHE, 'utf8'));
      if (Array.isArray(cached.cookies) && cached.cookies.length > 0) {
        await page.addInitScript(() => localStorage.setItem('lang', 'en'));
        await page.context().addCookies(cached.cookies);
        await page.goto('/');
        const probe = await apiRequest(page, 'GET', '/api/exhibits?limit=1');
        if (probe.status === 200) return;
      }
    } catch {
      // Fall through to full UI login
    }
  }
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  const cookies = await page.context().cookies();
  const sid = cookies.find((c) => c.name === 'museumos.sid');
  if (sid) {
    fs.writeFileSync(ADMIN_SESSION_CACHE, JSON.stringify({ sidValue: sid.value, cookies: [sid] }));
  }
}

export async function logoutViaApi(page: Page) {
  const cookies = await page.context().cookies();
  const currentSid = cookies.find((c) => c.name === 'museumos.sid')?.value;
  if (currentSid && fs.existsSync(ADMIN_SESSION_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(ADMIN_SESSION_CACHE, 'utf8'));
      if (cached.sidValue === currentSid) fs.unlinkSync(ADMIN_SESSION_CACHE);
    } catch {
      // ignore
    }
  }
  await apiRequest(page, 'POST', '/api/auth/logout');
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
}

export async function apiRequest(page: Page, method: string, route: string, body?: unknown) {
  return page.evaluate(
    async ({ requestMethod, requestRoute, requestBody }) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const response = await fetch(requestRoute, {
        method: requestMethod,
        credentials: 'include',
        headers: requestBody === undefined ? {} : { 'content-type': 'application/json' },
        body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      return { status: response.status, body: parsed };
    },
    { requestMethod: method, requestRoute: route, requestBody: body },
  );
}

export async function createDraftThroughApi(
  page: Page,
  name: string,
  cleanupIds: string[],
  overrides: Record<string, unknown> = {},
) {
  const created = await page.evaluate(
    async ({ exhibitName, extra }) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const categoriesResponse = await fetch('/api/categories');
      const categories = (await categoriesResponse.json()) as Array<{ id: string; code: string }>;
      const response = await fetch('/api/exhibits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          categoryId: categories[0]!.id,
          exhibitName,
          year: 2000,
          collectiblePrice: 25,
          attributes: {},
          ...extra,
        }),
      });
      return { status: response.status, body: await response.json() };
    },
    { exhibitName: name, extra: overrides },
  );
  expect(created.status).toBe(201);
  cleanupIds.push(created.body.id as string);
  return created.body as {
    id: string;
    displayId: string;
    exhibitName: string;
    categoryId: string;
    year: number | null;
    collectiblePrice: number | null;
    validated: boolean;
    published: boolean;
  };
}

export async function cleanupExhibits(page: Page, cleanupIds: string[]) {
  if (cleanupIds.length === 0) return;
  for (const id of cleanupIds.splice(0)) {
    await page
      .evaluate(async (exhibitId) => {
        await fetch(`/api/exhibits/${exhibitId}`, { method: 'DELETE', credentials: 'include' });
      }, id)
      .catch(() => undefined);
  }
}

export async function captureAxe(page: Page, filename: string) {
  const result = await new AxeBuilder({ page }).analyze();
  const report = {
    capturedAt: new Date().toISOString(),
    url: page.url(),
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        impact: node.impact,
        html: node.html,
        summary: node.failureSummary,
      })),
    })),
    passes: result.passes.length,
    incomplete: result.incomplete.length,
  };
  fs.writeFileSync(path.join(EVIDENCE_A11Y_DIR, filename), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
