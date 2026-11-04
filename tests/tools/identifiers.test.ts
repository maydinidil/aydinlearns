// tests/tools/identifiers.test.ts: the new public name (Grondig, D130) leaves the internal names alone (S9-17 class B; Review Focus 6).
// Anything that persists or that another program reads keeps "aydinlearns": changing one would orphan a learner's saved choices, logs,
// backups or dashboards. Class A (what a learner sees) takes the new name; the last tests pin that too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p: string): string => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const SERVER_AND_TOOLS = ['server/main.ts', 'server/app.ts', 'server/state.ts', 'server/telemetry.ts', 'server/journey.ts', 'server/port.ts', 'server/tutor/config.ts',
  'server/tutor/keys.ts', 'server/tutor/startup.ts', 'tools/launch.ts', 'tools/journey.ts', 'server/tutor/providers/fake.ts'];

test('class B: the AYDINLEARNS_* variables stay in .env.example and are still read by the code', () => {
  const env = read('.env.example');
  const code = SERVER_AND_TOOLS.map(read).join('\n');
  for (const name of ['AYDINLEARNS_JOURNEY', 'AYDINLEARNS_JOURNEY_DIR', 'AYDINLEARNS_KEYS_FILE']) assert.ok(env.includes(name), `.env.example names ${name}`);
  for (const name of ['AYDINLEARNS_JOURNEY', 'AYDINLEARNS_JOURNEY_DIR', 'AYDINLEARNS_KEYS_FILE', 'AYDINLEARNS_LOGS_DIR', 'AYDINLEARNS_PORT', 'AYDINLEARNS_TUTOR_PROVIDER']) {
    assert.ok(code.includes(name), `the code reads ${name}`);
  }
  assert.ok(!/GRONDIG_/.test(env + code), 'no GRONDIG_ variable was introduced');
});

test('class B: telemetry service.name and the six metric names are unchanged', () => {
  assert.match(read('server/telemetry.ts'), /'service\.name': 'aydinlearns'/);
  const metrics = read('server/observe.ts') + read('server/journey.ts');
  for (const m of ['aydinlearns.funnel.steps', 'aydinlearns.answer.time', 'aydinlearns.tutor.questions', 'aydinlearns.tutor.tokens', 'aydinlearns.session.duration',
    'aydinlearns.journey.events']) assert.ok(metrics.includes(`'${m}'`), m);
  assert.ok(!/grondig\./i.test(metrics), 'no metric or meter was renamed');
});

test('class B: the localStorage keys, the log app value, the backup prefix and the venv marker are unchanged', () => {
  assert.match(read('web/src/lib/theme.ts'), /THEME_KEY = 'aydinlearns\.theme'/);
  assert.ok(read('web/src/lib/labels.ts').includes('`aydinlearns.lesson-position.${conceptId}`'));
  assert.ok(read('web/index.html').includes("'aydinlearns.theme'"));
  assert.ok(read('server/app.ts').includes("app: 'aydinlearns'"));
  assert.ok(read('server/routes/cases.ts').includes("app: 'aydinlearns'"));
  assert.ok(read('server/routes/choice.ts').includes("app: 'aydinlearns'"));
  assert.match(read('core/envelope.ts'), /app: 'aydinlearns' \| 'aydindutch'/);
  assert.ok(read('server/backup.ts').includes('`aydinlearns-logs-${stamp}`'));
  assert.ok(read('tools/launch.ts').includes("'pipeline/.venv/.aydinlearns-requirements'"));
});

test('class B: the folder, the release skill name and the temp prefixes keep the old name', () => {
  assert.ok(existsSync(new URL('../../.claude/skills/aydinlearns-release/SKILL.md', import.meta.url)), 'the skill folder');
  assert.match(read('.claude/skills/aydinlearns-release/SKILL.md'), /^name: aydinlearns-release$/m);
  assert.ok(read('tools/release-check.ts').includes("'aydinlearns-release-'"));
});

test('class A: the learner sees Grondig (tab title, console prefix, launcher, shim, prompt, package name)', () => {
  assert.match(read('web/index.html'), /<title>Grondig<\/title>/);
  const main = read('server/main.ts');
  assert.ok(main.includes('`grondig on http://127.0.0.1:'), 'the start line the smoke test parses');
  assert.ok(main.includes('`grondig: replay: ${w}`'), 'the replay warning prefix the smoke test parses');
  assert.ok(!/`aydinlearns[: ]/.test(main), 'no console line still starts with the old name');
  assert.match(read('Start Grondig.bat'), /^title Grondig\r?$/m);
  const shim = read('Start aydinlearns.bat').trim().split(/\r?\n/).filter((l) => l.trim() !== '');
  assert.ok(shim.length <= 3 && shim.some((l) => /Start Grondig\.bat/.test(l)), 'the old launcher is a short shim that starts the new one');
  assert.ok(read('server/tutor/prompt.ts').includes('the tutor inside Grondig'));
  assert.equal((JSON.parse(read('package.json')) as { name: string }).name, 'grondig');
  assert.equal((JSON.parse(read('package-lock.json')) as { name: string }).name, 'grondig');
  assert.match(read('tools/export-public.sh'), /^PUBLIC_REPO=maydinidil\/grondig$/m);
});

test('class A: the wordmark is the calm mole at 32 px beside "Grondig", decorative, and the tab icon is the calm PNG', () => {
  const shell = read('web/src/components/AppShell.tsx');
  assert.match(shell, /<img className="mascot" src=\{moleCalm\} alt="" width=\{32\} height=\{32\} \/>/);
  assert.ok(shell.includes('Grondig') && !/aydin<span>/.test(shell));
  for (const f of ['mole-calm.png', 'mole-thinking.png', 'mole-pleased.png']) assert.ok(existsSync(new URL(`../../web/src/assets/mascot/${f}`, import.meta.url)), f);
  assert.ok(!existsSync(new URL('../../web/src/assets/mascot/mole-calm-with-shadow.png', import.meta.url)));
  assert.match(read('web/index.html'), /<link rel="icon" type="image\/png" href="\/src\/assets\/mascot\/mole-calm\.png"/);
  const css = read('web/src/styles/components.css');
  assert.match(css, /\.mascot \{[^}]*image-rendering: pixelated/);
  assert.match(css, /\[data-theme="dark"\] \.mascot \{ filter: drop-shadow\(0 0 1px var\(--mascot-rim\)\)/);
  assert.match(read('web/src/styles/tokens.css'), /--mascot-rim:/);
  assert.ok(read('web/src/screens/SetupScreen.tsx').includes('placeholder="D:\\Backups\\Grondig"'), 'the Setup backup placeholder');
  const smoke = read('tests/e2e/smoke.ts');
  assert.ok(smoke.includes('`grondig on ${BASE}`'), 'the smoke parser expects the launcher ready line');
  assert.ok(smoke.includes("'grondig: replay:'"), 'the smoke test looks for the replay warning prefix');
  assert.ok(!/aydinlearns on |aydinlearns: replay:/.test(smoke), 'no smoke parser still expects the old prefix');
});
