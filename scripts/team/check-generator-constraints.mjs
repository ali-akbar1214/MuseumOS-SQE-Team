import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';

const evidenceDir = 'docs/team/evidence/api/constraint-change';
fs.mkdirSync(evidenceDir, { recursive: true });
const originalPath = 'docs/team/planning/openapi.yaml';
const original = parse(fs.readFileSync(originalPath, 'utf8'));
const changed = structuredClone(original);

// 1. Numeric range change
const year = changed.components.schemas.CreateExhibit.properties.year;
if (year.minimum !== 1800 || year.maximum !== 2100) {
  throw new Error('Expected baseline year limits 1800..2100');
}
year.minimum = 1810;
year.maximum = 2090;

// 2. String length change
const exhibitName = changed.components.schemas.CreateExhibit.properties.exhibitName;
if (exhibitName.minLength !== 1 || exhibitName.maxLength !== 500) {
  throw new Error('Expected baseline exhibitName length limits 1..500');
}
exhibitName.maxLength = 120;

// 3. Property type change (number -> integer)
const price = changed.components.schemas.CreateExhibit.properties.collectiblePrice;
if (price.type !== 'number') {
  throw new Error('Expected baseline collectiblePrice type number');
}
price.type = 'integer';

// 4. Enum constraint change (['asc', 'desc'] -> ['asc', 'desc', 'relevance'])
const sortOrder = changed.components.schemas.SearchExhibitsQuery.properties.sortOrder;
if (!Array.isArray(sortOrder.enum) || sortOrder.enum.join(',') !== 'asc,desc') {
  throw new Error('Expected baseline SearchExhibitsQuery.sortOrder.enum [asc, desc]');
}
sortOrder.enum = ['asc', 'desc', 'relevance'];

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

const getPriceValues = (data) => data.properties.collectiblePrice.cases.map((item) => item.value);
const getSortOrderValues = (data) => data.queryProperties.sortOrder.cases.map((item) => item.value);

const yearBefore = getYearBva(baselineCases);
const yearAfter = getYearBva(updatedCases);
if (yearBefore.join(',') === yearAfter.join(',')) throw new Error('Year change did not alter BVA values');

const nameBefore = getNameLengths(baselineCases);
const nameAfter = getNameLengths(updatedCases);
if (nameBefore.join(',') === nameAfter.join(',')) throw new Error('exhibitName maxLength change did not alter BVA lengths');

const priceBefore = getPriceValues(baselineCases);
const priceAfter = getPriceValues(updatedCases);
if (priceBefore.join(',') === priceAfter.join(',') || !priceAfter.includes(0.5)) {
  throw new Error('collectiblePrice type change number -> integer did not emit integer non-integer rejection and step 1 BVA');
}

const sortBefore = getSortOrderValues(baselineCases);
const sortAfter = getSortOrderValues(updatedCases);
if (sortBefore.join(',') === sortAfter.join(',') || !sortAfter.includes('relevance')) {
  throw new Error('sortOrder enum change did not emit new enum case');
}

const summary = {
  capturedAt: new Date().toISOString(),
  changedConstraints: [
    {
      field: 'CreateExhibit.year',
      kind: 'numeric range',
      change: 'minimum 1800 -> 1810, maximum 2100 -> 2090',
      baselineBva: yearBefore,
      changedBva: yearAfter,
    },
    {
      field: 'CreateExhibit.exhibitName',
      kind: 'string length',
      change: 'maxLength 500 -> 120',
      baselineBvaLengths: nameBefore,
      changedBvaLengths: nameAfter,
    },
    {
      field: 'CreateExhibit.collectiblePrice',
      kind: 'type change',
      change: 'type number -> integer',
      baselineValues: priceBefore,
      changedValues: priceAfter,
    },
    {
      field: 'SearchExhibitsQuery.sortOrder',
      kind: 'enum extension',
      change: "enum ['asc', 'desc'] -> ['asc', 'desc', 'relevance']",
      baselineValues: sortBefore,
      changedValues: sortAfter,
    },
  ],
  proof: {
    changedSpecification: changedSpecPath,
    regeneratedCases: changedCasesPath,
  },
};
fs.writeFileSync(path.join(evidenceDir, 'change-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
