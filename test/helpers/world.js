// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys (a real GladysIntegration on an
// in-memory transport), the integration wired on it by registerHandlers, and
// the fake calaos_server. Short timings: everything settles in milliseconds.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createLogger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from '../../src/app.js';
import { createCalaos, PASSWORD, USER } from './fakeCalaos.js';

export const FAST_TIMINGS = {
  reconnectMin: 20,
  reconnectMax: 80,
  authRetry: 200,
  reloadDebounce: 20,
  watchdogInterval: 60_000,
  pollInterval: 60_000,
  pollsPerReload: 10,
  wsRetryMax: 80,
  commandReadBack: 20,
};
export const FAST_CLIENT = { requestTimeout: 200, openTimeout: 200 };
export const FAST_PUBLISHER = { flushInterval: 10 };

export const settle = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for a condition, failing with `what` after a while. */
export async function until(check, { what = 'the condition', timeout = 2000 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) {
      return;
    }
    await settle();
  }
  throw new Error(`Timed out waiting for ${what}`);
}

export const baseConfig = (extra = {}) => ({
  url: '192.0.2.20',
  username: USER,
  password: PASSWORD,
  ...extra,
});

/**
 * @param {object} [options]
 * @param {object} [options.calaos] the fake calaos_server
 * @param {object} [options.config] integration config
 * @param {object[]} [options.devices] devices already added in Gladys
 */
export async function createWorld({
  calaos = createCalaos(),
  config,
  devices = [],
  connect = true,
  waitOnline = true,
  logger = createLogger({ level: 'silent' }),
  timings = FAST_TIMINGS,
} = {}) {
  const gladys = createFakeGladys({ config: config ?? baseConfig(), devices });
  const app = registerHandlers(gladys, {
    fetch: calaos.fetch,
    WebSocket: calaos.WebSocket,
    timings,
    clientTimings: FAST_CLIENT,
    publisherTimings: FAST_PUBLISHER,
    logger,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
    if (waitOnline && !calaos.down) {
      await until(() => app.bridge.status === 'online', { what: 'Calaos online' });
    }
  }
  return { gladys, fake: gladys.fake, app, bridge: app.bridge, calaos };
}

/** The discovered device of a Calaos IO. */
export function deviceOf(world, id) {
  const externalId = world.bridge.inventory.deviceIds.get(id);
  return world.fake.discoveredDevices.find((d) => d.external_id === externalId);
}

/** The discovered feature of one IO, by role. */
export function featureOf(world, id, role) {
  const device = deviceOf(world, id);
  const feature = device?.features.find((f) => f.external_id === `${device.external_id}:${role}`);
  if (!feature) {
    throw new Error(`No feature ${role} for ${id}`);
  }
  return feature;
}

/** Adds a discovered device to Gladys, like the user in the Discovery tab. */
export async function addDevice(world, id) {
  const created = structuredClone(deviceOf(world, id));
  await world.fake.deviceCreated(created);
  await settle();
  return created;
}

/** Waits for the publisher's next flush. */
export async function flushed(world) {
  await settle();
  await world.bridge.publisher.flush();
  await settle();
}

export const statesOf = (world, featureId) =>
  world.fake.states
    .filter((s) => s.device_feature_external_id === featureId)
    .map((s) => (s.text !== undefined ? s.text : s.state));
