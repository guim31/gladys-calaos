// -----------------------------------------------------------------------------
// The bridge against the fake calaos_server and the SDK's fake Gladys: live
// states, commands, refused credentials, a server lost and back, a WebSocket
// refused (HTTP polling), a hung WebSocket (watchdog), scene events, calm logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '@gladysassistant/integration-sdk';
import { createCalaos } from './helpers/fakeCalaos.js';
import { captureLogs } from './helpers/logs.js';
import {
  FAST_TIMINGS,
  addDevice,
  baseConfig,
  createWorld,
  deviceOf,
  featureOf,
  flushed,
  settle,
  statesOf,
  until,
} from './helpers/world.js';

const world = async (t, options) => {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
};

test('connects over the WebSocket, offers the IOs, reads the version', async (t) => {
  const w = await world(t);
  assert.equal(w.bridge.live, true);
  assert.equal(w.bridge.version, '4.8.3');
  assert.ok(w.fake.discoveredDevices.length >= 15);
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.calaos.http.length, 0, 'nothing over HTTP while the WebSocket works');
  assert.deepEqual(w.calaos.ws[0], {
    msg: 'login',
    msg_id: '1',
    data: { cn_user: 'gladys', cn_pass: 'test-pass' },
  });
});

test('states go to the added devices only, and are all sent again on creation', async (t) => {
  const w = await world(t);
  w.calaos.change('io_temp', '19.5');
  await flushed(w);
  assert.deepEqual(w.fake.states, [], 'nothing for a device not added');
  await addDevice(w, 'io_temp');
  await addDevice(w, 'io_door');
  await flushed(w);
  assert.deepEqual(statesOf(w, featureOf(w, 'io_temp', 'temperature').external_id), [19.5]);
  assert.deepEqual(statesOf(w, featureOf(w, 'io_door', 'opening').external_id), [1], 'closed');
  w.calaos.change('io_door', 'true');
  await until(() => statesOf(w, featureOf(w, 'io_door', 'opening').external_id).length === 2);
  assert.deepEqual(statesOf(w, featureOf(w, 'io_door', 'opening').external_id), [1, 0]);
});

test('a command goes out as set_state, its event is the feedback', async (t) => {
  const w = await world(t);
  const device = await addDevice(w, 'io_dimmer');
  const brightness = featureOf(w, 'io_dimmer', 'brightness');
  const ack = await w.fake.setValue(device, brightness, 40);
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(w.calaos.commands.at(-1), ['io_dimmer', 'set 40']);
  const set = w.calaos.ws.at(-1);
  assert.deepEqual(set.data, { id: 'io_dimmer', value: 'set 40' }, 'arguments under data');
  await until(() => statesOf(w, brightness.external_id).includes(40), { what: 'feedback' });
  await flushed(w);
  assert.deepEqual(statesOf(w, featureOf(w, 'io_dimmer', 'onoff').external_id).at(-1), 1);
});

test('the smart shutter position is inverted, a scenario is started by its push button', async (t) => {
  const w = await world(t);
  const shutter = await addDevice(w, 'io_smart');
  await w.fake.setValue(shutter, featureOf(w, 'io_smart', 'position'), 70);
  assert.deepEqual(w.calaos.commands.at(-1), ['io_smart', 'set 30']);
  // Spaced by 2 s: a moving shutter_smart reports every percent.
  await until(() => statesOf(w, featureOf(w, 'io_smart', 'position').external_id).includes(70), {
    timeout: 4000,
  });
  const scenario = await addDevice(w, 'io_scenario');
  const ack = await w.fake.setValue(scenario, featureOf(w, 'io_scenario', 'scenario'), 1);
  assert.equal(ack.success, true);
  assert.deepEqual(w.calaos.commands.at(-1), ['io_scenario', 'true']);
});

test('a command Calaos refuses is an error', async (t) => {
  const w = await world(t);
  const device = await addDevice(w, 'io_light');
  // Deleted in Calaos meanwhile: set_state answers success "false".
  w.calaos.home.home[0].items = w.calaos.home.home[0].items.filter((io) => io.id !== 'io_light');
  const ack = await w.fake.setValue(device, featureOf(w, 'io_light', 'onoff'), 1);
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /a refusé la commande true/);
});

test('refused credentials: a status in four languages, a new attempt later', async (t) => {
  const calaos = createCalaos();
  calaos.password = 'other';
  const w = await world(t, { calaos, waitOnline: false });
  await until(() => w.bridge.status === 'auth_failed', { what: 'auth_failed' });
  const status = w.fake.connectionStatus;
  assert.equal(status.connected, false);
  assert.match(status.message.fr, /refusé/);
  assert.ok(status.message.de && status.message.es);
  calaos.password = 'test-pass';
  await until(() => w.bridge.status === 'online', { what: 'online after the retry' });
});

test('Calaos down at start: unreachable, then online when it starts', async (t) => {
  const calaos = createCalaos();
  calaos.down = true;
  const w = await world(t, { calaos, waitOnline: false });
  await until(() => w.bridge.status === 'unreachable');
  assert.match(w.fake.connectionStatus.message.en, /does not answer/);
  calaos.start();
  await until(() => w.bridge.status === 'online', { what: 'online' });
  assert.equal(w.bridge.live, true);
});

test('Calaos restarted: the WebSocket reconnects and the states are read again', async (t) => {
  const w = await world(t);
  await addDevice(w, 'io_light');
  const logins = w.calaos.logins;
  w.calaos.stop();
  await until(() => w.bridge.status !== 'online', { what: 'lost' });
  w.calaos.io('io_light').state = 'true';
  w.calaos.start();
  await until(() => w.bridge.status === 'online' && w.calaos.logins > logins, {
    what: 'back',
  });
  await flushed(w);
  assert.deepEqual(statesOf(w, featureOf(w, 'io_light', 'onoff').external_id).at(-1), 1);
});

test('a hung WebSocket is caught by the watchdog and reopened', async (t) => {
  const w = await world(t, {
    timings: { ...FAST_TIMINGS, watchdogInterval: 30, pollInterval: 30 },
  });
  await addDevice(w, 'io_light');
  const logins = w.calaos.logins;
  w.calaos.silent = true;
  await until(() => w.calaos.logins > logins, { what: 'a new login' });
  w.calaos.silent = false;
  await until(() => w.bridge.status === 'online' && w.bridge.live);
});

test('WebSocket refused but HTTP answering: polling, commands over HTTP, then live again', async (t) => {
  const calaos = createCalaos();
  calaos.wsRefused = true;
  const w = await world(t, {
    calaos,
    timings: { ...FAST_TIMINGS, pollInterval: 30, wsRetryMax: 60_000 },
  });
  assert.equal(w.bridge.live, false);
  assert.ok(w.fake.discoveredDevices.length >= 15);
  const device = await addDevice(w, 'io_light');
  // A change Calaos cannot push: read by the next poll.
  calaos.io('io_light').state = 'true';
  await until(() => statesOf(w, featureOf(w, 'io_light', 'onoff').external_id).includes(1), {
    what: 'the poll',
  });
  const ack = await w.fake.setValue(device, featureOf(w, 'io_light', 'onoff'), 0);
  assert.equal(ack.success, true);
  const set = calaos.http.findLast((b) => b.action === 'set_state');
  assert.equal(set.id, 'io_light', 'arguments at the root over HTTP');
  assert.equal(set.value, 'false');
  calaos.wsRefused = false;
  w.bridge.wsRetryAt = 0;
  await until(() => w.bridge.live, { what: 'live again' });
});

test('scene events: changes of any IO, not the measurements nor a repeated value', async (t) => {
  const w = await world(t);
  w.calaos.change('io_bool', 'true');
  w.calaos.change('io_bool', 'true');
  w.calaos.change('io_temp', '25');
  w.calaos.change('io_long', '2');
  w.calaos.change('io_long', '2');
  w.calaos.change('io_smart', 'down 12');
  w.calaos.change('io_smart', 'stop 40');
  await settle(20);
  const events = w.fake.sceneEvents.filter((e) => e.key === 'io_changed').map((e) => e.data);
  assert.deepEqual(
    events.map((e) => `${e.io}=${e.value}`),
    ['io_bool=true', 'io_long=2', 'io_long=2', 'io_smart=stop 40'],
  );
  assert.deepEqual(events[0], {
    io: 'io_bool',
    name: 'Mode absence',
    room: 'Maison',
    value: 'true',
    previous_value: 'false',
  });
});

test('a button press is sent each time, even the same one twice', async (t) => {
  const w = await world(t);
  await addDevice(w, 'io_triple');
  const id = featureOf(w, 'io_triple', 'button').external_id;
  w.calaos.change('io_triple', '2');
  w.calaos.change('io_triple', '0');
  w.calaos.change('io_triple', '2');
  await until(() => statesOf(w, id).length === 2, { what: 'two presses' });
  assert.deepEqual(statesOf(w, id), [2, 2]);
});

test('an IO added in Calaos is offered without a restart', async (t) => {
  const w = await world(t);
  const before = w.fake.discoveredDevices.length;
  w.calaos.home.home[0].items.push({
    gui_type: 'light',
    id: 'io_new',
    io_type: 'output',
    name: 'Nouvelle lampe',
    state: 'false',
    type: 'WagoOutputLight',
    var_type: 'bool',
    visible: 'true',
  });
  w.calaos.event('io_added', { id: 'io_new', room_name: 'Salon', room_type: 'lounge' });
  await until(() => w.fake.discoveredDevices.length === before + 1, { what: 'the new IO' });
  assert.ok(deviceOf(w, 'io_new'));
});

test('a normal cycle writes nothing at info level, and never the password', async (t) => {
  const logs = captureLogs(t, 'info');
  const w = await world(t, { logger: createLogger({ name: 'calaos' }) });
  await addDevice(w, 'io_light');
  const before = logs.lines.length;
  w.calaos.change('io_light', 'true');
  w.calaos.change('io_temp', '22');
  await flushed(w);
  await w.bridge.tick(w.bridge.generation);
  assert.deepEqual(logs.lines.slice(before), []);
  assert.ok(logs.lines.every((line) => !line.includes('test-pass')));
});

test('a new configuration restarts on the new server', async (t) => {
  const w = await world(t);
  await w.fake.configUpdated(baseConfig({ url: 'not a url at all' }));
  await until(() => w.bridge.status === 'invalid_url');
  assert.match(w.fake.connectionStatus.message.fr, /pas valide/);
  await w.fake.configUpdated(baseConfig({ url: 'http://192.0.2.20:5454' }));
  await until(() => w.bridge.status === 'online');
});

test('the late close of a replaced WebSocket does not drop the new one', async (t) => {
  const w = await world(t);
  w.calaos.closeDelay = 100;
  w.bridge.lost(w.bridge.generation, new Error('watchdog'));
  await until(() => w.bridge.status === 'online' && w.bridge.live, { what: 'reconnected' });
  const session = w.bridge.session;
  const logins = w.calaos.logins;
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(w.bridge.session, session, 'same session');
  assert.equal(w.calaos.logins, logins, 'no new login');
});

test('a configuration saved again while connecting wins over the stale connection', async (t) => {
  const w = await world(t);
  w.calaos.infoDelay = 80;
  // A first save: its connection waits for get_server_info…
  const pending = w.bridge.configure(baseConfig({ language: 'en' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  // …while a second save empties the address.
  await w.fake.configUpdated(baseConfig({ url: '' }));
  await pending;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(w.bridge.status, 'not_configured');
  assert.equal(w.bridge.tickTimer, undefined, 'no tick left running');
  assert.equal(w.fake.connectionStatus.connected, false);
});

test('while polling, a change read over HTTP starts the scene trigger once', async (t) => {
  const calaos = createCalaos();
  calaos.wsRefused = true;
  const w = await world(t, {
    calaos,
    timings: { ...FAST_TIMINGS, pollInterval: 30, wsRetryMax: 60_000 },
  });
  w.bridge.wsRetryAt = Number.MAX_SAFE_INTEGER;
  // Not added to Gladys: the trigger covers it all the same.
  calaos.io('io_bool').state = 'true';
  await until(() => w.fake.sceneEvents.some((e) => e.data.io === 'io_bool'), {
    what: 'the scene event',
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(w.fake.sceneEvents.filter((e) => e.data.io === 'io_bool').length, 1);
});
