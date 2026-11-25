// -----------------------------------------------------------------------------
// Scene actions, the connection test and the widget, through the SDK's fake
// Gladys: what a success says (green), what a failure throws (red, in the
// four languages), and a widget content the core accepts.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { statusContent } from '../src/widgets.js';
import { createCalaos } from './helpers/fakeCalaos.js';
import { baseConfig, createWorld, until } from './helpers/world.js';

const world = async (t, options) => {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
};

const failed = (ack, pattern) => {
  assert.equal(ack.success, false);
  for (const lang of ['en', 'fr', 'de', 'es']) {
    assert.ok(ack.error?.[lang], `error in ${lang}`);
  }
  assert.match(ack.error.fr, pattern);
};

test('start_scenario: by its name, accents and case ignored; a light is not a scenario', async (t) => {
  const w = await world(t);
  const ack = await w.fake.sceneAction('start_scenario', { scenario: 'tout eteindre' });
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  assert.deepEqual(w.calaos.commands.at(-1), ['io_scenario', 'true']);
  failed(
    await w.fake.sceneAction('start_scenario', { scenario: 'Volet baie' }),
    /n'est pas un scénario/,
  );
  failed(await w.fake.sceneAction('start_scenario', { scenario: 'Nope' }), /Aucune IO/);
  failed(await w.fake.sceneAction('start_scenario', {}), /Indiquez le nom/);
});

test('set_state: by name or id; two IOs of the same name ask for the id', async (t) => {
  const w = await world(t);
  assert.equal(
    (await w.fake.sceneAction('set_state', { io: 'io_bool', value: 'toggle' })).success,
    true,
  );
  assert.deepEqual(w.calaos.commands.at(-1), ['io_bool', 'toggle']);
  assert.equal(
    (await w.fake.sceneAction('set_state', { io: 'Volet chambre', value: 'set 20' })).success,
    true,
  );
  assert.deepEqual(w.calaos.commands.at(-1), ['io_smart', 'set 20']);
  failed(
    await w.fake.sceneAction('set_state', { io: 'Plafonnier', value: 'true' }),
    /Plusieurs IO .*io_light, io_knx_light/,
  );
  failed(await w.fake.sceneAction('set_state', { io: 'io_bool', value: ' ' }), /la valeur/);
  failed(
    await w.fake
      .sceneAction('set_state', { io: 'io_bool', value: 'nonsense' })
      .then(() => w.fake.sceneAction('set_state', { io: 'io_scenario', value: 'nonsense' })),
    /a refusé la commande nonsense/,
  );
});

test('a scene action while Calaos is lost fails in red', async (t) => {
  const calaos = createCalaos();
  calaos.down = true;
  const w = await world(t, { calaos, waitOnline: false });
  await until(() => w.bridge.status === 'unreachable');
  failed(
    await w.fake.sceneAction('set_state', { io: 'io_bool', value: 'true' }),
    /Aucune IO|pas connecté/,
  );
});

test('test_connection: green with the counts, red on refused credentials or no server', async (t) => {
  const w = await world(t);
  const ack = await w.fake.action('test_connection');
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /Connecté à Calaos 4\.8\.3 : 21 IO, 18 proposées/);
  assert.match(ack.data.message.en, /Not imported: analog_out ×1, var_int ×1\./);

  w.calaos.password = 'changed';
  failed(await w.fake.action('test_connection'), /refusé/);
  w.calaos.down = true;
  failed(await w.fake.action('test_connection'), /ne répond pas/);
});

test('test_connection without configuration says what to fill in', async (t) => {
  const w = await world(t, { config: {}, waitOnline: false });
  failed(await w.fake.action('test_connection'), /Indiquez l'adresse/);
  await w.fake.configUpdated(baseConfig({ url: 'ftp://x' }));
  failed(await w.fake.action('test_connection'), /pas valide/);
});

test('the widget: a content the core accepts, in every state and language', () => {
  const summaries = [
    { status: 'online', live: true, version: '4.8.3', offered: 16, added: 3 },
    { status: 'online', live: false, offered: 16, added: 0 },
    { status: 'unreachable', live: false, offered: 0, added: 0 },
    { status: 'auth_failed', live: false, offered: 0, added: 0 },
    { status: 'not_configured', live: false, offered: 0, added: 0 },
  ];
  for (const summary of summaries) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      const content = statusContent(summary, language);
      assert.doesNotThrow(() => validateWidgetContent(content), `${summary.status} ${language}`);
    }
  }
  const hidden = statusContent(summaries[0], 'fr', { show_reload: false });
  assert.ok(!hidden.components.some((c) => c.type === 'button'));
});

test('the widget through Gladys: its numbers, and its reload button', async (t) => {
  const w = await world(t);
  const got = await w.fake.widgetGet('status', { language: 'fr' });
  assert.equal(got.success, true);
  const offered = got.data.content.components.find((c) => c.label === 'IO proposées');
  assert.equal(offered.value, w.fake.discoveredDevices.length);
  const before = w.calaos.ws.filter((m) => m.msg === 'get_home').length;
  const ack = await w.fake.widgetAction('status', 'reload');
  assert.equal(ack.success, true);
  assert.equal(ack.data.message.fr, 'Liste des IO relue.');
  assert.equal(w.calaos.ws.filter((m) => m.msg === 'get_home').length, before + 1);
});
