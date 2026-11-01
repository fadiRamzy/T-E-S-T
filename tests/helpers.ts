import seed from '../src/data/seed.json';
import { buildFixtureWorkbook, type Seed } from '../src/xlsx/fixture';
import { seedToModel } from '../src/xlsx/seed';

export const SEED = seed as unknown as Seed;
export const seedModel = () => seedToModel(SEED);
let cache: Uint8Array | null = null;
export async function fixtureBytes(): Promise<Uint8Array> {
  if (!cache) cache = await buildFixtureWorkbook(SEED);
  return cache;
}
