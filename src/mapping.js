// -----------------------------------------------------------------------------
// Calaos IOs -> Gladys devices (pure).
//
// One Gladys device per Calaos IO, keyed on the IO id (`io_12`, set by
// calaos_installer and kept in io.xml):
//   device   ext:<selector>:io:<id>
//   feature  <device id>:<role>
// The IO kind is its `gui_type` (what the Calaos interfaces read), refined by
// its `io_style` (the icon chosen in Calaos) and its `unit`.
//
// States on the wire are strings, verified against calaos_server 4.8.3:
//   light, var_bool, switch   "true" / "false"
//   light_dimmer              "0".."100" (0 = off)
//   light_rgb                 "#RRGGBB", "0" when off
//   shutter                   "true" open / "false" closed (at the end of the travel)
//   shutter_smart             "up 30" | "down 30" | "stop 30" | "calibration";
//                             the number is how CLOSED it is: 0 open, 100 closed
//   switch_long               1 short press, 2 long press, back to 0 after 250 ms
//   switch3                   1, 2, 3 clicks, back to 0 after 250 ms
//   temp, analog_in           a number ("21.37")
// -----------------------------------------------------------------------------

import { ROLE_NAMES } from './texts.js';

const COVER = { OPEN: 1, STOP: 0, CLOSE: -1 };
const BUTTON = { CLICK: 1, DOUBLE_CLICK: 2, LONG_CLICK: 6, TRIPLE: 18 };

const spec = (category, type, extra = {}) => ({
  category,
  type,
  min: 0,
  max: 1,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const actuator = (category, type, extra = {}) =>
  spec(category, type, { read_only: false, has_feedback: true, ...extra });

const bool = (state) => (state === 'true' ? 1 : state === 'false' ? 0 : undefined);

const number = (state) => {
  const value = Number.parseFloat(String(state).replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
};

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** "#FF8000", "rgb(255, 128, 0)" -> 0xff8000; "0" (off) -> undefined. */
export function parseColor(state) {
  const text = String(state ?? '').trim();
  let match = /^#([0-9a-f]{6})$/i.exec(text);
  if (match) {
    return Number.parseInt(match[1], 16);
  }
  match = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(text);
  if (match) {
    const [r, g, b] = match.slice(1).map((v) => clamp(Number(v), 0, 255));
    return (r << 16) | (g << 8) | b;
  }
  return undefined;
}

export const colorToHex = (value) =>
  `#${clamp(Math.round(value), 0, 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`;

/** A light_rgb is on when it shows a colour other than black. */
const rgbOn = (state) => {
  const color = parseColor(state);
  return color !== undefined && color !== 0 ? 1 : 0;
};

/** shutter_smart "stop 30" -> { motion: 'stop', closed: 30 }. */
export function parseSmartShutter(state) {
  const match = /^\s*(up|down|stop)?\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(state ?? ''));
  if (!match) {
    return undefined;
  }
  return { motion: match[1] ?? 'stop', closed: clamp(Number(match[2]), 0, 100) };
}

/** Gladys: 100 = open; Calaos shutter_smart: 0 = open. */
const smartPosition = (state) => {
  const parsed = parseSmartShutter(state);
  return parsed ? Math.round(100 - parsed.closed) : undefined;
};

const smartState = (state) => {
  const parsed = parseSmartShutter(state);
  if (!parsed) {
    return undefined;
  }
  if (parsed.motion === 'up') {
    return COVER.OPEN;
  }
  if (parsed.motion === 'down') {
    return COVER.CLOSE;
  }
  return COVER.STOP;
};

const coverCommand = (value) =>
  value === COVER.OPEN ? 'up' : value === COVER.CLOSE ? 'down' : 'stop';

const onOff = (value) => (value >= 1 ? 'true' : 'false');

/** Binary inputs by io_style: the Gladys detector it is. 1 = detected. */
const SWITCH_STYLES = {
  door: 'opening',
  garage_door: 'opening',
  occupancy: 'presence',
  motion: 'motion',
  smoke: 'smoke',
  water: 'leak',
  carbon_monoxide: 'co',
  vibration: 'vibration',
};

const DETECTORS = {
  presence: ['presence-sensor', 'binary'],
  motion: ['motion-sensor', 'binary'],
  smoke: ['smoke-sensor', 'binary'],
  leak: ['leak-sensor', 'binary'],
  co: ['co-sensor', 'binary'],
  vibration: ['vibration-sensor', 'binary'],
};

/**
 * Measurements: by io_style first, then by unit. Calaos shows the unit as
 * typed by the installer; temperatures are always °C (InputTemp).
 */
const MEASURES = {
  temperature: { role: 'temperature', category: 'temperature-sensor', unit: 'celsius' },
  humidity: { role: 'humidity', category: 'humidity-sensor', unit: 'percent', max: 100 },
  pressure: { role: 'pressure', category: 'pressure-sensor', unit: 'hPa', max: 2000 },
  luminosity: { role: 'illuminance', category: 'light-sensor', unit: 'lux', max: 200_000 },
  current: { role: 'current', category: 'energy-sensor', type: 'current', unit: 'ampere' },
  voltage: { role: 'voltage', category: 'energy-sensor', type: 'voltage', unit: 'volt' },
  watt: { role: 'power', category: 'energy-sensor', type: 'power', unit: 'watt' },
  kilowatt: { role: 'power', category: 'energy-sensor', type: 'power', unit: 'kilowatt' },
  wh: { role: 'energy', category: 'energy-sensor', type: 'energy', unit: 'watt-hour' },
  kwh: { role: 'energy', category: 'energy-sensor', type: 'energy', unit: 'kilowatt-hour' },
  co2: { role: 'co2', category: 'co2-sensor', type: 'integer', unit: 'ppm', max: 10_000 },
};

const UNITS = {
  '°c': 'temperature',
  '° c': 'temperature',
  c: 'temperature',
  '%': undefined, // a percentage alone says nothing: humidity only with its style
  hpa: 'pressure',
  mbar: 'pressure',
  lux: 'luminosity',
  lx: 'luminosity',
  a: 'current',
  v: 'voltage',
  w: 'watt',
  kw: 'kilowatt',
  wh: 'wh',
  kwh: 'kwh',
  ppm: 'co2',
};

/** Milliseconds between two values of a measurement, and of a moving shutter. */
export const MEASURE_INTERVAL = 10_000;
export const MOVING_INTERVAL = 2000;

const STYLES = ['temperature', 'humidity', 'pressure', 'luminosity', 'current', 'voltage'];

export function measureOf(io) {
  if (io.gui_type === 'temp') {
    return MEASURES.temperature;
  }
  const byUnit = MEASURES[UNITS[unitOf(io)]];
  const style = String(io.io_style ?? '').toLowerCase();
  if (style === 'watt') {
    // The watt style is the icon of any power or energy meter: its unit tells which.
    return byUnit?.category === 'energy-sensor' ? byUnit : MEASURES.watt;
  }
  if (STYLES.includes(style)) {
    return MEASURES[style];
  }
  // A percentage alone says nothing; a hygrometer is often left with the default style.
  if (unitOf(io) === '%' && /humid|hygro|feucht|humed/i.test(String(io.name ?? ''))) {
    return MEASURES.humidity;
  }
  return byUnit;
}

const unitOf = (io) =>
  String(io.unit ?? '')
    .trim()
    .toLowerCase();

const measure = (m) => ({
  role: m.role,
  spec: spec(m.category, m.type ?? 'decimal', {
    unit: m.unit,
    min: m.category === 'temperature-sensor' ? -50 : 0,
    max: m.max ?? (m.category === 'temperature-sensor' ? 100 : 100_000),
  }),
  read: (state) => {
    const value = number(state);
    if (value === undefined) {
      return undefined;
    }
    return m.type === 'integer' ? Math.round(value) : round(value);
  },
  throttle: MEASURE_INTERVAL,
});

/**
 * The features of one IO, or `{ skipped: <kind> }`.
 * @param {object} io an item of get_home
 */
export function mapIo(io) {
  switch (io.gui_type) {
    case 'light':
      return [{ role: 'onoff', spec: actuator('light', 'binary'), read: bool, write: onOff }];
    case 'light_dimmer':
      return [
        {
          role: 'onoff',
          spec: actuator('light', 'binary'),
          read: (s) => (number(s) === undefined ? undefined : number(s) > 0 ? 1 : 0),
          write: onOff,
        },
        {
          role: 'brightness',
          spec: actuator('light', 'brightness', { max: 100, unit: 'percent' }),
          read: (s) => (number(s) === undefined ? undefined : Math.round(clamp(number(s), 0, 100))),
          write: (value) => (value <= 0 ? 'false' : `set ${Math.round(clamp(value, 0, 100))}`),
        },
      ];
    case 'light_rgb':
      return [
        { role: 'onoff', spec: actuator('light', 'binary'), read: rgbOn, write: onOff },
        {
          role: 'color',
          spec: actuator('light', 'color', { max: 0xffffff }),
          read: (s) => {
            const color = parseColor(s);
            // Off is "0": the last colour stays on display.
            return color === undefined || color === 0 ? undefined : color;
          },
          write: (value) => `set ${colorToHex(value)}`,
        },
      ];
    case 'shutter':
      return [
        {
          role: 'shutter',
          spec: actuator('shutter', 'state', { min: -1, max: 1 }),
          read: (s) => (s === 'true' ? COVER.OPEN : s === 'false' ? COVER.CLOSE : undefined),
          write: coverCommand,
        },
      ];
    case 'shutter_smart':
      return [
        {
          role: 'shutter',
          spec: actuator('shutter', 'state', { min: -1, max: 1 }),
          read: smartState,
          write: coverCommand,
          // A moving shutter_smart sends its position at every percent.
          throttle: MOVING_INTERVAL,
        },
        {
          role: 'position',
          spec: actuator('shutter', 'position', { max: 100, unit: 'percent' }),
          read: smartPosition,
          throttle: MOVING_INTERVAL,
          write: (value) => `set ${Math.round(100 - clamp(value, 0, 100))}`,
        },
      ];
    case 'temp':
    case 'analog_in': {
      const m = measureOf(io);
      return m ? [measure(m)] : { skipped: `${io.gui_type}${io.unit ? ` (${io.unit})` : ''}` };
    }
    case 'switch': {
      const style = SWITCH_STYLES[String(io.io_style ?? '').toLowerCase()];
      if (style === 'opening') {
        // Gladys: 0 = open, 1 = closed (OPENING_SENSOR_STATE). Calaos: true = open.
        return [
          {
            role: 'opening',
            spec: spec('opening-sensor', 'binary'),
            read: (s) => (s === 'true' ? 0 : s === 'false' ? 1 : undefined),
          },
        ];
      }
      if (style) {
        const [category, type] = DETECTORS[style];
        return [{ role: style, spec: spec(category, type), read: bool }];
      }
      return [{ role: 'input', spec: spec('input', 'binary'), read: bool }];
    }
    case 'switch_long':
      return [
        {
          role: 'button',
          spec: spec('button', 'click', { max: 25 }),
          read: (s) => ({ 1: BUTTON.CLICK, 2: BUTTON.LONG_CLICK })[number(s)],
          event: true,
        },
      ];
    case 'switch3':
      return [
        {
          role: 'button',
          spec: spec('button', 'click', { max: 25 }),
          read: (s) => ({ 1: BUTTON.CLICK, 2: BUTTON.DOUBLE_CLICK, 3: BUTTON.TRIPLE })[number(s)],
          event: true,
        },
      ];
    case 'var_bool':
      return [{ role: 'onoff', spec: actuator('switch', 'binary'), read: bool, write: onOff }];
    case 'var_string':
    case 'string_in':
      return [
        {
          role: 'text',
          spec: spec('text', 'text', { max: 0 }),
          read: (s) =>
            typeof s === 'string' && s.trim() !== '' ? { text: s.slice(0, 255) } : undefined,
        },
      ];
    case 'scenario':
      return [
        {
          role: 'scenario',
          spec: spec('button', 'push', { read_only: false }),
          write: () => 'true',
        },
      ];
    default:
      return { skipped: String(io.gui_type || io.type || 'unknown') };
  }
}

/** Calaos hides wall switches by default (visible=false): they are offered anyway. */
const ALWAYS_OFFERED = new Set(['switch', 'switch_long', 'switch3']);

const cut = (text, max = 100) => String(text ?? '').slice(0, max);

/**
 * @param {object} home the answer of get_home
 * @param {object} options the normalized configuration + { externalIds }
 */
export function buildInventory(home, options) {
  const { externalIds, language = 'fr', rooms = [], includeHidden = false } = options;
  const names = ROLE_NAMES[language] ?? ROLE_NAMES.en;
  const wanted = new Set(rooms);
  const devices = [];
  /** io id -> { id, name, room, gui_type, state } */
  const ios = new Map();
  /** io id -> [{ featureId, read, throttle, event }] */
  const routes = new Map();
  /** feature external id -> { io, write } */
  const writers = new Map();
  /** io id -> Gladys device external id */
  const deviceIds = new Map();
  const skipped = new Map();

  for (const room of Array.isArray(home?.home) ? home.home : []) {
    const roomName = String(room?.name ?? '').trim();
    for (const io of Array.isArray(room?.items) ? room.items : []) {
      const id = String(io?.id ?? '').trim();
      if (!/^[\w.-]{1,100}$/.test(id) || ios.has(id)) {
        continue;
      }
      ios.set(id, {
        id,
        name: String(io.name ?? id),
        room: roomName,
        gui_type: String(io.gui_type ?? ''),
        state: io.state,
      });
      if (wanted.size > 0 && !wanted.has(roomName.toLowerCase())) {
        continue;
      }
      if (io.visible === 'false' && !includeHidden && !ALWAYS_OFFERED.has(io.gui_type)) {
        continue;
      }
      const features = mapIo(io);
      if (!Array.isArray(features)) {
        skipped.set(features.skipped, (skipped.get(features.skipped) ?? 0) + 1);
        continue;
      }
      const ids = externalIds('io', id);
      const base = String(io.name ?? id).trim() || id;
      const label =
        roomName && !base.toLowerCase().includes(roomName.toLowerCase())
          ? `${base} (${roomName})`
          : base;
      const device = {
        name: cut(label),
        external_id: ids.device,
        should_poll: false,
        features: [],
        params: [
          { name: 'calaos_id', value: id },
          { name: 'calaos_type', value: cut(io.type ?? io.gui_type, 255) },
          ...(roomName ? [{ name: 'calaos_room', value: cut(roomName, 255) }] : []),
        ],
      };
      const ioRoutes = [];
      for (const f of features) {
        const featureId = ids.feature(f.role);
        device.features.push({
          name: cut(names[f.role] ?? f.role),
          external_id: featureId,
          ...f.spec,
        });
        if (f.read) {
          ioRoutes.push({
            featureId,
            read: f.read,
            throttle: f.throttle ?? 0,
            event: Boolean(f.event),
          });
        }
        if (f.write) {
          writers.set(featureId, { io: id, write: f.write });
        }
      }
      routes.set(id, ioRoutes);
      deviceIds.set(id, ids.device);
      devices.push(device);
    }
  }

  return {
    devices,
    ios,
    routes,
    writers,
    deviceIds,
    skipped: [...skipped.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}
