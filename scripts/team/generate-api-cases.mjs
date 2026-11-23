import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const specPath = path.resolve(process.argv[2] ?? 'docs/team/planning/openapi.yaml');
const outputPath = path.resolve(process.argv[3] ?? 'docs/team/evidence/api/api-generated-cases.json');
const document = parse(fs.readFileSync(specPath, 'utf8'));
const schema = document.components?.schemas?.CreateExhibit;
if (!schema?.properties) throw new Error('OpenAPI document must define components.schemas.CreateExhibit.properties');

const required = new Set(schema.required ?? []);
const validSamples = { string: 'SQE generated exhibit', integer: 2000, number: 25, boolean: true };

function add(cases, value, valid, partition, technique) {
  const key = JSON.stringify(value);
  const existing = cases.find((item) => JSON.stringify(item.value) === key && item.exists);
  if (existing) {
    if (!existing.techniques.includes(technique)) existing.techniques.push(technique);
    existing.partitions.push(partition);
    return;
  }
  cases.push({ exists: true, value, valid, partitions: [partition], techniques: [technique] });
}

function generatePropertyCases(name, property) {
  const cases = [];
  const type = Array.isArray(property.type) ? property.type.find((item) => item !== 'null') : property.type;
  const nullable = property.nullable === true || (Array.isArray(property.type) && property.type.includes('null'));

  if (type === 'string' && property.format === 'uuid') {
    add(cases, '__CATEGORY_ID__', true, 'valid-uuid', 'EP');
    add(cases, 'not-a-uuid', false, 'invalid-format', 'EP');
    if (nullable) add(cases, null, false, 'invalid-null', 'EP');
  } else if (type === 'string') {
    const minimum = property.minLength ?? 0;
    const maximum = property.maxLength;
    const sampleAt = (length) => 'x'.repeat(Math.max(0, length));
    add(cases, sampleAt(Math.max(minimum, 1)), true, 'valid-minimum', 'EP');
    if (maximum !== undefined) add(cases, sampleAt(maximum), true, 'valid-maximum', 'EP');
    if (minimum > 0) add(cases, sampleAt(minimum - 1), false, 'invalid-too-short', 'EP');
    if (maximum !== undefined) add(cases, sampleAt(maximum + 1), false, 'invalid-too-long', 'EP');
    const boundaries = new Set([minimum - 1, minimum, minimum + 1]);
    if (maximum !== undefined) [maximum - 1, maximum, maximum + 1].forEach((value) => boundaries.add(value));
    for (const length of boundaries) {
      if (length < 0) continue;
      add(cases, sampleAt(length), length >= minimum && (maximum === undefined || length <= maximum), `length-${length}`, '3-point BVA');
    }
  } else if (type === 'integer' || type === 'number') {
    const minimum = property.minimum;
    const maximum = property.maximum;
    if (minimum !== undefined && maximum !== undefined) {
      add(cases, minimum - 1, false, 'invalid-below-minimum', 'EP');
      add(cases, minimum, true, 'valid-lower-boundary', 'EP');
      add(cases, Math.floor((minimum + maximum) / 2), true, 'valid-middle', 'EP');
      add(cases, maximum, true, 'valid-upper-boundary', 'EP');
      add(cases, maximum + 1, false, 'invalid-above-maximum', 'EP');
      for (const value of [minimum - 1, minimum, minimum + 1, maximum - 1, maximum, maximum + 1]) {
        add(cases, value, Number.isInteger(value) && value >= minimum && value <= maximum, `value-${value}`, '3-point BVA');
      }
    } else if (minimum !== undefined) {
      const delta = type === 'number' ? 0.01 : 1;
      add(cases, minimum - 1, false, 'invalid-below-minimum', 'EP');
      add(cases, minimum, true, 'valid-at-minimum', 'EP');
      add(cases, minimum + delta, true, 'valid-above-minimum', 'EP');
      for (const value of [minimum - delta, minimum, minimum + delta]) {
        add(cases, value, value >= minimum, `value-${value}`, '3-point BVA');
      }
    } else {
      add(cases, validSamples[type], true, 'valid-number', 'EP');
    }
    if (type === 'integer') add(cases, (minimum ?? 0) + 0.5, false, 'invalid-non-integer', 'EP');
    if (nullable) add(cases, null, true, 'valid-null', 'EP');
  } else if (type === 'boolean') {
    add(cases, true, true, 'true', 'EP');
    add(cases, false, true, 'false', 'EP');
    add(cases, 'not-a-boolean', false, 'invalid-type', 'EP');
  } else {
    throw new Error(`No data generator is defined for ${name} (${JSON.stringify(property)})`);
  }

  if (type === 'string') add(cases, 42, false, 'wrong-type-number', 'EP');
  if (type === 'integer' || type === 'number') add(cases, 'not-a-number', false, 'wrong-type-string', 'EP');
  if (required.has(name)) cases.push({ exists: false, value: null, valid: false, partitions: ['missing-required'], techniques: ['EP'] });
  return cases;
}

const properties = Object.fromEntries(
  Object.entries(schema.properties).map(([name, property]) => [name, {
    required: required.has(name),
    type: property.type,
    minimum: property.minimum,
    maximum: property.maximum,
    minLength: property.minLength,
    maxLength: property.maxLength,
    cases: generatePropertyCases(name, property),
  }]),
);

const generated = {
  generatedFrom: path.relative(process.cwd(), specPath),
  openapiVersion: document.openapi,
  schema: 'CreateExhibit',
  generatedAt: new Date().toISOString(),
  properties,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(generated, null, 2)}\n`);
console.log(`Generated ${Object.values(properties).reduce((count, item) => count + item.cases.length, 0)} cases for ${Object.keys(properties).length} OpenAPI inputs -> ${outputPath}`);
