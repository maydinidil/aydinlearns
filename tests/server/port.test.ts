import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PORT, portFromEnv } from '../../server/port.ts';

// Owner decision D5 (sprint 2): AYDINLEARNS_PORT moves the server, the launcher, the Vite proxy and the smoke test together.
test('no AYDINLEARNS_PORT, or a blank one, means 5174', () => {
  assert.equal(DEFAULT_PORT, 5174);
  assert.equal(portFromEnv({}), 5174);
  assert.equal(portFromEnv({ AYDINLEARNS_PORT: '' }), 5174);
  assert.equal(portFromEnv({ AYDINLEARNS_PORT: '   ' }), 5174);
});
test('a whole number from 1024 to 65535 is the port', () => {
  for (const [raw, port] of [['1024', 1024], ['5184', 5184], ['5194', 5194], [' 5184 ', 5184], ['65535', 65535]] as const) {
    assert.equal(portFromEnv({ AYDINLEARNS_PORT: raw }), port, raw);
  }
});
test('anything else stops the start with a plain message that names the value and the fix', () => {
  for (const raw of ['80', '1023', '65536', '5184.5', '5e3', '-5184', '0x1450', 'abc', '5184abc']) {
    assert.throws(() => portFromEnv({ AYDINLEARNS_PORT: raw }), (e: unknown) => e instanceof Error
      && e.message === `AYDINLEARNS_PORT is "${raw}", but it must be a whole number from 1024 to 65535. Change it, or remove it to use 5174, then start again.`, raw);
  }
});
