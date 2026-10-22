// tests/helpers/register-tsx.ts: lets the tests import the web app's .tsx (and .ts) files (S7-28, D113). Run with
// `node --import ./tests/helpers/register-tsx.ts --test <file>`; `npm test` does this for every test. The compile step is in
// tsx-hooks.ts, which Node runs on its loader thread.
import { register } from 'node:module';

register('./tsx-hooks.ts', import.meta.url);
