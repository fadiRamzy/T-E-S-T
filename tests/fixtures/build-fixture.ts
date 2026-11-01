// Usage: npm run fixture  → writes tests/fixtures/synthetic-template.xlsx
import { writeFileSync } from 'node:fs';
import seed from '../../src/data/seed.json';
import { buildFixtureWorkbook, type Seed } from '../../src/xlsx/fixture';

const bytes = await buildFixtureWorkbook(seed as unknown as Seed);
writeFileSync(new URL('./synthetic-template.xlsx', import.meta.url), bytes);
console.log(`wrote tests/fixtures/synthetic-template.xlsx (${bytes.length} bytes)`);
