import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const sourcePath = 'apps/api/src/exhibits/exhibit-workflow.ts';
const original = fs.readFileSync(sourcePath, 'utf8');

const operators = [
  { id: 'PRICE-INCLUSIVE-ZERO', pattern: 'price >= 0', replacement: 'price > 0' },
  { id: 'YEAR-INCLUSIVE-LOWER', pattern: 'year >= 1800', replacement: 'year > 1800' },
  { id: 'YEAR-INCLUSIVE-UPPER', pattern: 'year <= 2100', replacement: 'year < 2100' },
  {
    id: 'PUBLISH-AND-OR',
    pattern: 'record.validated && record.exhibitName.trim().length > 0 && record.categoryId !== null',
    replacement: 'record.validated || record.exhibitName.trim().length > 0 && record.categoryId !== null',
  },
];

const outcomes = [];
try {
  for (const operator of operators) {
    if (!original.includes(operator.pattern)) {
      throw new Error(`Mutation anchor missing: ${operator.id}`);
    }
    const mutated = original.replace(operator.pattern, operator.replacement);
    fs.writeFileSync(sourcePath, mutated, 'utf8');
    const result = spawnSync(
      'pnpm --filter @museumos/api exec vitest run test/team/exhibit-workflow.test.ts test/team/exhibit-contracts.test.ts',
      { encoding: 'utf8', shell: true },
    );
    const killed = result.status !== 0;
    outcomes.push({
      id: operator.id,
      exitCode: result.status,
      outcome: killed ? 'KILLED' : 'SURVIVED',
    });
  }
} finally {
  fs.writeFileSync(sourcePath, original, 'utf8');
}

const killedCount = outcomes.filter((item) => item.outcome === 'KILLED').length;
const report = {
  capturedAt: new Date().toISOString(),
  source: sourcePath,
  method: 'source-level domain mutation evaluated directly against the real Vitest team unit suite with guaranteed original-source restoration',
  suiteCommand: 'pnpm --filter @museumos/api exec vitest run test/team/exhibit-workflow.test.ts test/team/exhibit-contracts.test.ts',
  customOperators: ['inclusive numeric boundary to exclusive', 'boolean conjunction to disjunction'],
  total: outcomes.length,
  killed: killedCount,
  score: `${((100 * killedCount) / outcomes.length).toFixed(2)}%`,
  outcomes,
};

fs.mkdirSync('docs/team/evidence/mutation', { recursive: true });
fs.writeFileSync('docs/team/evidence/mutation/custom-mutators.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.killed !== report.total) process.exitCode = 1;
