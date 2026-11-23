import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';

const evidenceDir = 'docs/team/evidence/api/constraint-change';
fs.mkdirSync(evidenceDir, { recursive: true });
const originalPath = 'docs/team/planning/openapi.yaml';
const original = parse(fs.readFileSync(originalPath, 'utf8'));
const changed = structuredClone(original);

const year = changed.components.schemas.CreateExhibit.properties.year;
if (year.minimum !== 1800 || year.maximum !== 2100) {
  throw new Error('Expected baseline year limits 1800..2100');
}
year.minimum = 1810;
year.maximum = 2090;

const exhibitName = changed.components.schemas.CreateExhibit.properties.exhibitName;
if (exhibitName.minLength !== 1 || exhibitName.maxLength !== 500) {
  throw new Error('Expected baseline exhibitName length limits 1..500');
}
exhibitName.maxLength = 120;

const changedSpecPath = path.join(evidenceDir, 'openapi-changed.yaml');
const changedCasesPath = path.join(evidenceDir, 'api-generated-cases-changed.json');
fs.writeFileSync(changedSpecPath, stringify(changed));
const result = spawnSync(
  process.execPath,
  ['scripts/team/generate-api-cases.mjs', changedSpecPath, changedCasesPath],
  { encoding: 'utf8' },
);
if (result.status !== 0) {
  throw new Error(result.stderr || result.stdout || `Generator exited ${result.status}`);
}

const baselineCases = JSON.parse(fs.readFileSync('docs/team/evidence/api/api-generated-cases.json', 'utf8'));
const updatedCases = JSON.parse(fs.readFileSync(changedCasesPath, 'utf8'));

const getYearBva = (data) =>
  data.properties.year.cases
    .filter((item) => item.techniques.includes('3-point BVA'))
    .map((item) => item.value);

const getNameLengths = (data) =>
  data.properties.exhibitName.cases
    .filter((item) => item.techniques.includes('3-point BVA') && typeof item.value === 'string')
    .map((item) => item.value.length);

const yearBefore = getYearBva(baselineCases);
const yearAfter = getYearBva(updatedCases);
if (yearBefore.join(',') === yearAfter.join(',')) {
  throw new Error('Changing year constraints did not change generated BVA values');
}

const nameBefore = getNameLengths(baselineCases);
const nameAfter = getNameLengths(updatedCases);
if (nameBefore.join(',') === nameAfter.join(',')) {
  throw new Error('Changing exhibitName maxLength did not change generated BVA lengths');
}

const summary = {
  changedConstraints: [
    {
      field: 'CreateExhibit.year',
      change: 'minimum 1800 -> 1810, maximum 2100 -> 2090',
      baselineBva: yearBefore,
      changedBva: yearAfter,
    },
    {
      field: 'CreateExhibit.exhibitName',
      change: 'maxLength 500 -> 120',
      baselineBvaLengths: nameBefore,
      changedBvaLengths: nameAfter,
    },
  ],
  proof: {
    changedSpecification: changedSpecPath,
    regeneratedCases: changedCasesPath,
  },
};
fs.writeFileSync(path.join(evidenceDir, 'change-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
