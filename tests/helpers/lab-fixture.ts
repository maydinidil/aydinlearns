// tests/helpers/lab-fixture.ts: GA4 lab fixtures (sprint 5b, Task B1). tests/fixtures/labs/ mirrors a content root's lab files:
// three invented labs (LAB-07, LAB-12, LAB-20) in ga4/labs/, their keys in keys/ga4/labs/ (each structural part keyed and
// blind-solved for version 1), and a short guide in ga4/lab-guide.json. Between them they hold every answer kind, every check,
// every rule kind and every date kind. Their structural questions and keys are invented, so no real lab key appears in a test.
// makeLabRoot copies them into a temporary content root beside the files loadContent needs (the SQL curriculum and error
// feedback, and the real GA4 concepts that C42 checks a lab's concept and topic against). Every file it writes is under os.tmpdir().
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAB_FIXTURES = fileURLToPath(new URL('../fixtures/labs/', import.meta.url));
export const LAB_IDS = ['LAB-07', 'LAB-12', 'LAB-20'] as const;

// Fixture files are edited freely by the tests, so they are typed loosely.
export type Json = Record<string, any>;
export interface LabFiles { labs: Record<string, Json>; keys: Record<string, Json>; guide: Json | null }

const readJson = async (rel: string): Promise<Json> => JSON.parse(await readFile(join(LAB_FIXTURES, rel), 'utf8')) as Json;

/** A fresh copy of a fixture lab. */
export const fixtureLab = (id: string): Promise<Json> => readJson(`ga4/labs/${id}.json`);
/** A fresh copy of a fixture lab's key. */
export const fixtureKey = (id: string): Promise<Json> => readJson(`keys/ga4/labs/${id}.json`);

/** Every fixture file, fresh, keyed by lab ID; the guide or null. */
export async function labFiles(): Promise<LabFiles> {
  const labs: Record<string, Json> = {};
  const keys: Record<string, Json> = {};
  for (const id of LAB_IDS) { labs[id] = await fixtureLab(id); keys[id] = await fixtureKey(id); }
  return { labs, keys, guide: await readJson('ga4/lab-guide.json') };
}

/**
 * A temporary content root holding the fixture labs, keys and guide, after `edit` has changed them: delete a lab or a key to
 * leave its file out, set the guide to null to leave the guide out. Each lab and key file is named after its entry.
 */
export async function makeLabRoot(edit: (f: LabFiles) => void = () => {}): Promise<string> {
  const files = await labFiles();
  edit(files);
  const root = await mkdtemp(join(tmpdir(), 'al-labs-'));
  for (const d of ['sql', 'ga4/labs', 'keys/ga4/labs']) await mkdir(join(root, d), { recursive: true });
  for (const f of ['sql/curriculum.json', 'sql/error-feedback.json', 'ga4/concepts.json']) await writeFile(join(root, f), await readFile(join('content', f), 'utf8'));
  for (const [id, lab] of Object.entries(files.labs)) await writeFile(join(root, 'ga4/labs', `${id}.json`), JSON.stringify(lab, null, 2) + '\n');
  for (const [id, key] of Object.entries(files.keys)) await writeFile(join(root, 'keys/ga4/labs', `${id}.json`), JSON.stringify(key, null, 2) + '\n');
  if (files.guide) await writeFile(join(root, 'ga4/lab-guide.json'), JSON.stringify(files.guide, null, 2) + '\n');
  return root;
}
