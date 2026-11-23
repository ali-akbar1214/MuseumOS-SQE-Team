import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
const apiRequire = createRequire(path.resolve('apps/api/package.json'));
const ts = apiRequire('typescript');

const sourcePath = 'apps/api/src/exhibits/exhibit-workflow.ts';
const original = fs.readFileSync(sourcePath, 'utf8');
const cases = [
  { name: 'price-zero', fn: 'isCollectiblePriceAllowed', args: [0], expected: true },
  { name: 'year-minimum', fn: 'isAcquisitionYearAllowed', args: [1800], expected: true },
  { name: 'year-maximum', fn: 'isAcquisitionYearAllowed', args: [2100], expected: true },
  { name: 'publish-needs-validation', fn: 'isPublishAllowed', args: [{ validated: false, exhibitName: 'Valid name', categoryId: 'cat' }], expected: false },
];

const operators = [
  { id: 'PRICE-INCLUSIVE-ZERO', pattern: 'price >= 0', replacement: 'price > 0', caseName: 'price-zero' },
  { id: 'YEAR-INCLUSIVE-LOWER', pattern: 'year >= 1800', replacement: 'year > 1800', caseName: 'year-minimum' },
  { id: 'YEAR-INCLUSIVE-UPPER', pattern: 'year <= 2100', replacement: 'year < 2100', caseName: 'year-maximum' },
  { id: 'PUBLISH-AND-OR', pattern: 'record.validated && record.exhibitName.trim().length > 0 && record.categoryId !== null', replacement: 'record.validated || record.exhibitName.trim().length > 0 && record.categoryId !== null', caseName: 'publish-needs-validation' },
];

function load(mutatedSource) {
  const js = ts.transpileModule(mutatedSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, Number });
  return exports;
}

const outcomes = operators.map((operator) => {
  if (!original.includes(operator.pattern)) throw new Error(`Mutation anchor missing: ${operator.id}`);
  const mutant = load(original.replace(operator.pattern, operator.replacement));
  const test = cases.find((item) => item.name === operator.caseName);
  const survived = mutant[test.fn](...test.args) === test.expected;
  return { id: operator.id, test: test.name, outcome: survived ? 'SURVIVED' : 'KILLED' };
});

const report = {
  source: sourcePath,
  method: 'source-level domain mutation; each mutant compiled with TypeScript and checked against a named boundary oracle',
  customOperators: ['inclusive numeric boundary to exclusive', 'boolean conjunction to disjunction'],
  total: outcomes.length,
  killed: outcomes.filter((item) => item.outcome === 'KILLED').length,
  score: `${(100 * outcomes.filter((item) => item.outcome === 'KILLED').length / outcomes.length).toFixed(2)}%`,
  outcomes,
};

fs.mkdirSync('docs/team/evidence/mutation', { recursive: true });
fs.writeFileSync('docs/team/evidence/mutation/custom-mutators.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.killed !== report.total) process.exitCode = 1;
