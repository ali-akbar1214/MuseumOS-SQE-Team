import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const OUT_DIR = path.resolve('docs/team/evidence/accessibility');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function runCliLighthouse(targetUrl, outFile, cookieHeader) {
  const headersFile = path.join(os.tmpdir(), `lighthouse-headers-${Date.now()}.json`);
  fs.writeFileSync(headersFile, JSON.stringify({ Cookie: cookieHeader }));
  try {
    const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
    const quote = (val) => `"${String(val)}"`;
    const args = [
      '--yes',
      'lighthouse',
      quote(targetUrl),
      '--output=json',
      `--output-path=${quote(outFile)}`,
      '--only-categories=accessibility,best-practices,seo',
      `--extra-headers=${quote(headersFile)}`,
      '--disable-storage-reset',
      `--chrome-path=${quote(chromePath)}`,
      '--chrome-flags="--headless=new --no-sandbox"',
    ];
    const result = spawnSync('npx', args, {
      encoding: 'utf8',
      shell: true,
    });
    if (result.status !== 0) {
      throw new Error(`Lighthouse CLI failed (${result.status}): ${result.stderr || result.stdout}`);
    }
    return JSON.parse(fs.readFileSync(outFile, 'utf8'));
  } finally {
    if (fs.existsSync(headersFile)) fs.unlinkSync(headersFile);
  }
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD before running Lighthouse.');
  }

  let lighthouse = null;
  try {
    ({ default: lighthouse } = await import('lighthouse'));
  } catch {
    lighthouse = null;
  }

  const browser = await chromium.launch({
    args: ['--remote-debugging-port=9222'],
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${WEB_URL}/login`);
    await page.locator('#identifier').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/$/);

    const cookieHeader = (await context.cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

    const firstExhibitId = await page.evaluate(async () => {
      const res = await fetch('/api/exhibits?limit=1');
      const data = await res.json();
      return data.items?.[0]?.id ?? null;
    });

    const targets = [
      { key: 'exhibits-list', url: `${WEB_URL}/exhibits` },
      ...(firstExhibitId ? [{ key: 'exhibit-detail', url: `${WEB_URL}/exhibits/${firstExhibitId}` }] : []),
    ];

    if (!lighthouse) {
      await browser.close();
    }

    const summary = [];
    for (const target of targets) {
      const outFile = path.join(OUT_DIR, `lighthouse-${target.key}-full.json`);
      let lhr;
      if (lighthouse) {
        const runnerResult = await lighthouse(target.url, {
          port: 9222,
          output: 'json',
          onlyCategories: ['accessibility', 'best-practices', 'seo'],
          extraHeaders: { Cookie: cookieHeader },
          disableStorageReset: true,
        });
        lhr = runnerResult.lhr;
        fs.writeFileSync(outFile, JSON.stringify(lhr, null, 2));
      } else {
        lhr = await runCliLighthouse(target.url, outFile, cookieHeader);
      }

      summary.push({
        screen: target.key,
        url: target.url,
        accessibility: lhr.categories.accessibility?.score ?? null,
        bestPractices: lhr.categories['best-practices']?.score ?? null,
        seo: lhr.categories.seo?.score ?? null,
      });
    }

    fs.writeFileSync(
      path.join(OUT_DIR, 'lighthouse-multi-screen.json'),
      `${JSON.stringify({ capturedAt: new Date().toISOString(), screens: summary }, null, 2)}\n`,
    );
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
