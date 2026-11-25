// -----------------------------------------------------------------------------
// Calaos IO -> Gladys features: the states as calaos_server 4.8.3 sends them
// (strings), the commands it takes, and the choices of the mapping.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInventory, colorToHex, mapIo, measureOf, parseColor } from '../src/mapping.js';
import { HOME } from './helpers/fakeCalaos.js';

const role = (io, name) => mapIo(io).find((f) => f.role === name);
const externalIds = (type, id) => ({
  device: `ext:calaos:${type}:${id}`,
  feature: (suffix) => `ext:calaos:${type}:${id}:${suffix}`,
});

test('a light: "true"/"false" both ways', () => {
  const f = role({ gui_type: 'light' }, 'onoff');
  assert.equal(f.spec.category, 'light');
  assert.equal(f.read('true'), 1);
  assert.equal(f.read('false'), 0);
  assert.equal(f.write(1), 'true');
  assert.equal(f.write(0), 'false');
});

test('a dimmer: the percentage is the brightness, 0 is off, set N switches on', () => {
  const io = { gui_type: 'light_dimmer' };
  assert.equal(role(io, 'onoff').read('40'), 1);
  assert.equal(role(io, 'onoff').read('0'), 0);
  assert.equal(role(io, 'brightness').read('40'), 40);
  assert.equal(role(io, 'brightness').write(55.4), 'set 55');
  assert.equal(role(io, 'brightness').write(0), 'false');
  assert.equal(role(io, 'brightness').write(140), 'set 100');
});

test('a colour light: "#RRGGBB" or "0" when off', () => {
  const io = { gui_type: 'light_rgb' };
  assert.equal(role(io, 'onoff').read('#FF8000'), 1);
  assert.equal(role(io, 'onoff').read('0'), 0);
  assert.equal(role(io, 'color').read('#FF8000'), 0xff8000);
  assert.equal(role(io, 'color').read('0'), undefined, 'off keeps the last colour');
  assert.equal(role(io, 'color').write(0x00ff00), 'set #00FF00');
  assert.equal(parseColor('rgb(255, 128, 0)'), 0xff8000);
  assert.equal(colorToHex(0xabc), '#000ABC');
});

test('a shutter: "true" open, "false" closed; up, down, stop', () => {
  const f = role({ gui_type: 'shutter' }, 'shutter');
  assert.deepEqual([f.read('true'), f.read('false'), f.read('?')], [1, -1, undefined]);
  assert.deepEqual([f.write(1), f.write(-1), f.write(0)], ['up', 'down', 'stop']);
});

test('a smart shutter: Calaos counts how CLOSED it is, Gladys how open', () => {
  const io = { gui_type: 'shutter_smart' };
  const position = role(io, 'position');
  assert.equal(position.read('stop 0'), 100, 'fully open');
  assert.equal(position.read('stop 100'), 0, 'fully closed');
  assert.equal(position.read('down 30'), 70);
  assert.equal(position.read('calibration'), undefined);
  assert.equal(position.write(70), 'set 30');
  assert.equal(position.write(100), 'set 0');
  assert.ok(position.throttle > 0, 'a moving shutter sends its position at every percent');
  const state = role(io, 'shutter');
  assert.deepEqual(
    ['up 40', 'down 40', 'stop 40'].map((s) => state.read(s)),
    [1, -1, 0],
  );
});

test('a door switch: Calaos true (open) is Gladys 0 (OPENING_SENSOR_STATE.OPEN)', () => {
  const f = role({ gui_type: 'switch', io_style: 'door' }, 'opening');
  assert.equal(f.spec.category, 'opening-sensor');
  assert.equal(f.read('true'), 0);
  assert.equal(f.read('false'), 1);
});

test('switch styles become detectors (1 = detected), a plain switch an input', () => {
  assert.equal(
    role({ gui_type: 'switch', io_style: 'motion' }, 'motion').spec.category,
    'motion-sensor',
  );
  assert.equal(role({ gui_type: 'switch', io_style: 'water' }, 'leak').read('true'), 1);
  assert.equal(role({ gui_type: 'switch', io_style: 'switch' }, 'input').spec.category, 'input');
});

test('buttons: presses, never the reset to 0', () => {
  const long = role({ gui_type: 'switch_long' }, 'button');
  assert.deepEqual(
    ['1', '2', '0'].map((s) => long.read(s)),
    [1, 6, undefined],
  );
  const triple = role({ gui_type: 'switch3' }, 'button');
  assert.deepEqual(
    ['1', '2', '3', '0'].map((s) => triple.read(s)),
    [1, 2, 18, undefined],
  );
  assert.equal(long.event, true);
});

test('measurements: by style first, then by unit; unknown ones are not imported', () => {
  assert.equal(measureOf({ gui_type: 'temp' }).unit, 'celsius');
  assert.equal(measureOf({ gui_type: 'analog_in', io_style: 'watt', unit: 'W' }).unit, 'watt');
  assert.equal(
    measureOf({ gui_type: 'analog_in', io_style: 'watt', unit: 'kWh' }).unit,
    'kilowatt-hour',
  );
  assert.equal(measureOf({ gui_type: 'analog_in', unit: 'lux' }).category, 'light-sensor');
  assert.equal(measureOf({ gui_type: 'analog_in', unit: '%', name: 'Humidité' }).unit, 'percent');
  assert.equal(measureOf({ gui_type: 'analog_in', unit: '%', name: 'Ouverture vanne' }), undefined);
  assert.deepEqual(mapIo({ gui_type: 'analog_in', unit: 'km/h' }), { skipped: 'analog_in (km/h)' });
  assert.equal(role({ gui_type: 'temp' }, 'temperature').read('21.37'), 21.37);
});

test('text, variables and scenarios', () => {
  const text = role({ gui_type: 'string_in' }, 'text');
  assert.deepEqual(text.read('bonjour'), { text: 'bonjour' });
  assert.equal(text.read(''), undefined, 'Gladys ignores an empty text');
  assert.equal(role({ gui_type: 'var_bool' }, 'onoff').spec.category, 'switch');
  const scenario = role({ gui_type: 'scenario' }, 'scenario');
  assert.equal(`${scenario.spec.category}/${scenario.spec.type}`, 'button/push');
  assert.equal(scenario.write(1), 'true');
  assert.equal(scenario.read, undefined);
  for (const kind of ['audio_player', 'camera', 'time_range', 'analog_out', 'var_int']) {
    assert.ok(!Array.isArray(mapIo({ gui_type: kind })), kind);
  }
});

test('inventory: one device per IO, its id from the IO id, hidden IOs left out but switches', () => {
  const inventory = buildInventory(HOME, { externalIds, language: 'fr' });
  const ids = inventory.devices.map((d) => d.params[0].value);
  assert.ok(ids.includes('io_long'), 'a wall button hidden by default is offered');
  assert.ok(!ids.includes('io_hidden'));
  assert.ok(!ids.includes('io_aout'));
  const smart = inventory.devices.find((d) => d.external_id === 'ext:calaos:io:io_smart');
  assert.equal(smart.name, 'Volet chambre');
  assert.deepEqual(
    smart.features.map((f) => f.external_id),
    ['ext:calaos:io:io_smart:shutter', 'ext:calaos:io:io_smart:position'],
  );
  const light = inventory.devices.find((d) => d.external_id === 'ext:calaos:io:io_light');
  assert.equal(
    light.name,
    'Plafonnier (Salon)',
    'the room tells two lights of the same name apart',
  );
  assert.ok(inventory.skipped.some(([kind]) => kind === 'analog_out'));

  const hidden = buildInventory(HOME, { externalIds, includeHidden: true });
  assert.ok(hidden.devices.some((d) => d.external_id === 'ext:calaos:io:io_hidden'));
  const room = buildInventory(HOME, { externalIds, rooms: ['chambre'] });
  assert.ok(room.devices.every((d) => d.params.some((p) => p.value === 'Chambre')));
  assert.ok(room.ios.size > room.devices.length, 'every IO stays known to the scene actions');
});
