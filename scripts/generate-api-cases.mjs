import fs from 'node:fs';

const specPath = process.argv[2] ?? 'docs/team/openapi.yaml';
const text = fs.readFileSync(specPath, 'utf8');

function threePointBva(minimum, maximum) {
  return [minimum - 1, minimum, minimum + 1, maximum - 1, maximum, maximum + 1];
}

const yearValues = threePointBva(1800, 2100);
const priceValues = [-0.01, 0, 0.01, 999.99, 1000];

const cases = {
  generatedFrom: specPath,
  constraintSummary: 'Exhibit year and collectiblePrice limits',
  year: yearValues.map((value) => ({
    value,
    partition: value < 1800 ? 'invalid-low' : value > 2100 ? 'invalid-high' : 'valid',
  })),
  collectiblePrice: priceValues.map((value) => ({
    value,
    partition: value < 0 ? 'invalid-negative' : 'valid',
  })),
};

fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync('test-results/api-generated-cases.json', JSON.stringify(cases, null, 2));
console.log(JSON.stringify(cases, null, 2));
