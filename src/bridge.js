// -----------------------------------------------------------------------------
// The bridge: one calaos_server, its IOs, the live states, the commands and
// the scene events.
//
//   connect    WebSocket /api + login; get_home (rooms and IOs) ->
//              src/mapping.js -> publishDiscoveredDevices (Discovery tab);
//   live       `io_changed` events -> the features of the devices ADDED in
//              Gladys only (the others would be dropped by the core and spend
//              its 300 states/min); an IO added, deleted or renamed -> get_home
//              again; every minute a get_state of the added IOs, which is also
//              the watchdog of the WebSocket (no answer in 10 s: reconnect);
//   fallback   WebSocket refused but HTTP answering (a proxy without the
//              upgrade): get_state over HTTP every 30 s, commands over HTTP,
//              and the WebSocket tried again with a growing delay;
//   commands   onSetValue -> set_state; the io_changed that follows is the
//              feedback (read back after 1.5 s while polling);
//   events     io_changed -> scene trigger `io_changed`;
//   failures   Calaos lost -> new attempt after 5 s, doubling up to 60 s;
//              refused credentials: every minute (calaos_server slows down
//              each failed login of an address, up to 60 s).
// -----------------------------------------------------------------------------

import { CalaosAuthError, CalaosClient } from './calaos/client.js';
import { normalizeConfig } from './config.js';
import { buildInventory } from './mapping.js';
import { StatePublisher } from './publisher.js';
import { STATUS, localizedError, testMessage } from './texts.js';

export const BRIDGE_TIMINGS = {
  reconnectMin: 5000,
  reconnectMax: 60_000,
  authRetry: 60_000,
  reloadDebounce: 2000,
  // Live: the states of the added IOs read again this often (watchdog too).
  watchdogInterval: 60_000,
  // Without the WebSocket, the states are read this often.
  pollInterval: 30_000,
  // Without the WebSocket, the IO list is read again every this many polls.
  pollsPerReload: 10,
  wsRetryMax: 5 * 60_000,
  // A command while polling: its result is read back after this delay.
  commandReadBack: 1500,
};

export const TRIGGERS = { IO_CHANGED: 'io_changed' };
export const WIDGET_KEY = 'status';

/** Scene events per minute: the core takes 300, a chatty IO must not spend them all. */
export const EVENTS_PER_MINUTE = 60;

/** Measurements change all the time: devices in Gladys, not scene events. */
const NO_SCENE_EVENT = new Set(['temp', 'analog_in']);

/** Buttons send the same value again for each press. */
const PRESSES = new Set(['switch_long', 'switch3']);

/** The core refuses a discovered list longer than this (setDiscoveredDevices, 5.2.0). */
export const MAX_DISCOVERED_DEVICES = 2000;

const short = (value, max = 255) => String(value ?? '').slice(0, max);

export class Bridge {
  constructor({
    gladys,
    logger,
    fetch,
    WebSocket,
    timers = globalThis,
    timings = BRIDGE_TIMINGS,
    clientTimings,
    publisherTimings,
    now = Date.now,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.fetch = fetch;
    this.WebSocket = WebSocket;
    this.timers = timers;
    this.timings = { ...BRIDGE_TIMINGS, ...timings };
    this.clientTimings = clientTimings;
    this.now = now;
    this.publisher = new StatePublisher({
      gladys,
      logger,
      now,
      timers,
      timings: publisherTimings,
    });
    this.config = normalizeConfig({});
    this.configKey = undefined;
    this.status = 'not_configured';
    this.version = undefined;
    this.client = undefined;
    this.session = undefined;
    this.live = false;
    /** io id -> last state string */
    this.states = new Map();
    this.structure = undefined;
    this.inventory = this.emptyInventory();
    this.generation = 0;
    this.reconnectTimer = undefined;
    this.reloadTimer = undefined;
    this.tickTimer = undefined;
    this.ticks = 0;
    this.delay = this.timings.reconnectMin;
    this.wsDelay = this.timings.reconnectMin;
    this.wsRetryAt = 0;
    this.lostLogged = false;
    this.authFailures = 0;
    this.eventWindow = [];
    this.eventsDropped = false;
  }

  emptyInventory() {
    return buildInventory({}, { externalIds: this.gladys.externalIds.bind(this.gladys) });
  }

  // --- Configuration and lifecycle -----------------------------------------------

  /** Applies a configuration; restarts the connection when it changed. */
  async configure(raw) {
    const key = JSON.stringify(raw ?? {});
    if (key === this.configKey && this.status !== 'not_configured') {
      return;
    }
    this.configKey = key;
    this.config = normalizeConfig(raw);
    await this.restart();
  }

  async restart() {
    this.disconnect();
    this.generation += 1;
    this.delay = this.timings.reconnectMin;
    this.wsDelay = this.timings.reconnectMin;
    this.authFailures = 0;
    this.connectedOnce = false;
    this.structure = undefined;
    this.version = undefined;
    // Nothing of the previous server survives a new configuration.
    this.states.clear();
    this.inventory = this.emptyInventory();
    this.publisher.clear();
    this.publisher.start();
    if (this.config.invalidUrl || !this.config.url || !this.config.username) {
      this.status = this.config.invalidUrl ? 'invalid_url' : 'not_configured';
      await this.setConnectionStatus(false, STATUS[this.status]);
      return;
    }
    this.status = 'connecting';
    this.client = this.newClient();
    await this.connect(this.generation);
  }

  newClient(config = this.config) {
    return new CalaosClient({
      url: config.url,
      username: config.username,
      password: config.password,
      ...(this.fetch ? { fetch: this.fetch } : {}),
      ...(this.WebSocket ? { WebSocket: this.WebSocket } : {}),
      timers: this.timers,
      timings: this.clientTimings,
    });
  }

  /** Stops everything (shutdown, tests). */
  stop() {
    this.generation += 1;
    this.disconnect();
    this.publisher.stop();
  }

  disconnect() {
    this.timers.clearTimeout(this.reconnectTimer);
    this.timers.clearTimeout(this.reloadTimer);
    this.timers.clearInterval(this.tickTimer);
    this.reconnectTimer = undefined;
    this.reloadTimer = undefined;
    this.tickTimer = undefined;
    this.closeSession();
    this.client = undefined;
  }

  closeSession() {
    const session = this.session;
    this.session = undefined;
    this.live = false;
    session?.close();
  }

  async setConnectionStatus(connected, message) {
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (err) {
      this.logger.debug(`Connection status not sent: ${err.message}`);
    }
  }

  // --- Connection -----------------------------------------------------------------

  async connect(generation) {
    if (generation !== this.generation) {
      return;
    }
    const { client } = this;
    let home;
    let session;
    try {
      session = await this.openSession(client, generation);
      home = await session.request('get_home');
    } catch (err) {
      session?.close();
      if (generation !== this.generation) {
        return;
      }
      if (err instanceof CalaosAuthError) {
        await this.authFailed(generation);
        return;
      }
      // No WebSocket: maybe a proxy without the upgrade. HTTP alone will do.
      try {
        home = await client.http('get_home');
      } catch (httpErr) {
        if (generation !== this.generation) {
          return;
        }
        if (httpErr instanceof CalaosAuthError) {
          await this.authFailed(generation);
        } else {
          await this.unreachable(generation, httpErr);
        }
        return;
      }
      if (generation !== this.generation) {
        return;
      }
      this.logger.debug(`WebSocket unavailable (${err.message}): reading the states over HTTP`);
      session = undefined;
      this.wsRetryAt = this.now() + this.wsDelay;
    }
    if (generation !== this.generation) {
      session?.close();
      return;
    }
    this.session = session;
    this.live = Boolean(session);
    if (session) {
      this.wsDelay = this.timings.reconnectMin;
      try {
        const info = await session.request('get_server_info');
        this.version = typeof info?.version === 'string' ? short(info.version, 40) : undefined;
      } catch {
        // An older calaos_server ignores this message: no version, nothing else lost.
      }
      if (generation !== this.generation || session !== this.session) {
        return;
      }
    }
    const wasLost = this.status !== 'online' && this.lostLogged;
    const first = !this.connectedOnce;
    this.connectedOnce = true;
    this.status = 'online';
    this.delay = this.timings.reconnectMin;
    this.authFailures = 0;
    this.lostLogged = false;
    const message = wasLost
      ? 'Calaos is back'
      : `Connected to Calaos${this.version ? ` ${this.version}` : ''} (${this.live ? 'live' : 'polling over HTTP'})`;
    if (first || wasLost) {
      this.logger.info(message);
    } else {
      // A WebSocket reopened at once: not worth a line at info level.
      this.logger.debug(message);
    }
    await this.setConnectionStatus(true);
    if (generation !== this.generation) {
      return;
    }
    await this.loadHome(home);
    if (generation !== this.generation) {
      return;
    }
    this.startTicks(generation);
    this.requestWidgetRefresh();
  }

  /**
   * Opens a WebSocket session whose events and close only count while it is
   * THE session of the bridge: a late close of a replaced socket is ignored.
   */
  async openSession(client, generation) {
    let session;
    const current = () => generation === this.generation && session && session === this.session;
    session = await client.open({
      onEvent: (event) => {
        if (current()) {
          this.onCalaosEvent(event);
        }
      },
      onClose: () => {
        if (current() && this.live) {
          this.lost(generation, new Error('WebSocket closed'));
        }
      },
    });
    return session;
  }

  async authFailed(generation) {
    if (this.status !== 'auth_failed') {
      this.logger.warn('Calaos refused the user name or the password');
    }
    this.status = 'auth_failed';
    this.closeSession();
    await this.setConnectionStatus(false, STATUS.auth_failed);
    this.requestWidgetRefresh();
    // The first retry comes soon: right after a password change, calaos_server
    // still slows down the address that failed (1 s, then doubling).
    this.scheduleReconnect(
      generation,
      this.authFailures === 0 ? this.timings.reconnectMin : this.timings.authRetry,
    );
    this.authFailures += 1;
  }

  async unreachable(generation, err) {
    if (!this.lostLogged) {
      this.lostLogged = true;
      this.logger.warn(`Calaos unreachable: ${err.message}`);
    }
    this.status = 'unreachable';
    this.closeSession();
    await this.setConnectionStatus(false, STATUS.unreachable);
    this.requestWidgetRefresh();
    this.scheduleReconnect(generation, this.delay);
    this.delay = Math.min(this.delay * 2, this.timings.reconnectMax);
  }

  /** The connection was working and broke. */
  lost(generation, err) {
    if (generation !== this.generation || this.status !== 'online') {
      return;
    }
    this.timers.clearInterval(this.tickTimer);
    this.tickTimer = undefined;
    this.closeSession();
    this.status = 'connecting';
    this.logger.debug(`Connection to Calaos lost (${err.message}): reconnecting`);
    // A first attempt at once: a restart of calaos_server is the usual cause.
    this.scheduleReconnect(generation, 0);
  }

  scheduleReconnect(generation, delay) {
    this.timers.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect(generation).catch((err) => this.logger.error(err.message));
    }, delay);
  }

  startTicks(generation) {
    if (generation !== this.generation) {
      return;
    }
    this.timers.clearInterval(this.tickTimer);
    this.ticks = 0;
    this.tickTimer = this.timers.setInterval(
      () => {
        this.tick(generation).catch((err) => this.logger.debug(`Tick failed: ${err.message}`));
      },
      this.live ? this.timings.watchdogInterval : this.timings.pollInterval,
    );
  }

  /** Live: the watchdog and a safety read. Polling: the states, the WebSocket tried again. */
  async tick(generation) {
    if (generation !== this.generation || this.status !== 'online') {
      return;
    }
    this.ticks += 1;
    if (!this.live && this.now() >= this.wsRetryAt && (await this.upgrade(generation))) {
      return;
    }
    if (!this.live && this.ticks % this.timings.pollsPerReload === 0) {
      await this.reload();
      return;
    }
    // Polling reads every IO: the scene trigger covers the ones not added to Gladys too.
    await this.readStates(
      generation,
      this.live ? this.addedIoIds() : [...this.inventory.ios.keys()],
    );
  }

  /** Polling: try the WebSocket again. True when the bridge went live. */
  async upgrade(generation) {
    let session;
    try {
      session = await this.openSession(this.client, generation);
      const home = await session.request('get_home');
      // Meanwhile the connection may have been lost, reopened or reconfigured.
      if (generation !== this.generation || this.status !== 'online' || this.live || this.session) {
        session.close();
        return false;
      }
      this.session = session;
      this.live = true;
      this.wsDelay = this.timings.reconnectMin;
      this.logger.info('Live updates from Calaos');
      await this.loadHome(home);
      this.startTicks(generation);
      this.requestWidgetRefresh();
      return true;
    } catch {
      session?.close();
      this.wsDelay = Math.min(this.wsDelay * 2, this.timings.wsRetryMax);
      this.wsRetryAt = this.now() + this.wsDelay;
      return false;
    }
  }

  /** One request, over the WebSocket when it is open, over HTTP otherwise. */
  async request(msg, data = {}) {
    if (this.live && this.session) {
      return this.session.request(msg, data);
    }
    if (!this.client) {
      throw localizedError('not_configured');
    }
    return this.client.http(msg, data);
  }

  async readStates(generation, ids) {
    if (ids.length === 0 && !this.live) {
      return;
    }
    let states;
    try {
      // An unknown id is left out of the answer: the watchdog always gets one.
      const items = ids.length > 0 ? ids : [...this.inventory.ios.keys()].slice(0, 1);
      states = await this.request('get_state', { items });
    } catch (err) {
      this.lost(generation, err);
      return;
    }
    if (generation !== this.generation || !states || typeof states !== 'object') {
      return;
    }
    const created = this.createdDevices();
    // While polling, a change seen here is the only one there is: it starts the scene trigger.
    const event = this.live ? false : 'poll';
    for (const [id, state] of Object.entries(states)) {
      this.applyState(id, state, { created, event });
    }
  }

  // --- Inventory --------------------------------------------------------------------

  async loadHome(home) {
    this.inventory = buildInventory(home, {
      ...this.config,
      externalIds: this.gladys.externalIds.bind(this.gladys),
    });
    const structure = JSON.stringify(this.inventory.devices);
    if (structure !== this.structure && (await this.publishDevices())) {
      this.structure = structure;
    }
    const created = this.createdDevices();
    for (const io of this.inventory.ios.values()) {
      // While polling, this read is one of the polls: a change starts the scene trigger.
      const event = !this.live && this.states.has(io.id) ? 'poll' : false;
      this.applyState(io.id, io.state, { created, event });
    }
  }

  async publishDevices() {
    const devices = this.inventory.devices.slice(0, MAX_DISCOVERED_DEVICES);
    if (this.inventory.devices.length > MAX_DISCOVERED_DEVICES) {
      this.logger.warn(
        `${this.inventory.devices.length} IOs offered, only the first ${MAX_DISCOVERED_DEVICES} are sent: choose rooms in the configuration`,
      );
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      if (this.discoveryFailing) {
        this.discoveryFailing = false;
        this.logger.info('Discovered devices sent again');
      }
      return true;
    } catch (err) {
      this.structure = undefined;
      if (!this.discoveryFailing) {
        this.discoveryFailing = true;
        this.logger.warn(`Discovered devices not sent: ${err.message}`);
      }
      return false;
    }
  }

  /** get_home again, after a short wait (an installer saves many IOs at once). */
  scheduleReload() {
    this.timers.clearTimeout(this.reloadTimer);
    this.reloadTimer = this.timers.setTimeout(() => {
      this.reloadTimer = undefined;
      this.reload().catch((err) => this.logger.debug(`Reload failed: ${err.message}`));
    }, this.timings.reloadDebounce);
  }

  async reload() {
    const generation = this.generation;
    let home;
    try {
      home = await this.request('get_home');
    } catch (err) {
      this.lost(generation, err);
      throw err;
    }
    if (generation === this.generation) {
      await this.loadHome(home);
    }
  }

  /** Discovery tab: "scan" reads the IO list again and offers it whatever changed. */
  async scan() {
    if (this.status !== 'online') {
      throw localizedError(this.errorKey());
    }
    this.structure = undefined;
    await this.reload();
  }

  // --- States -------------------------------------------------------------------------

  /** The external ids of the devices added in Gladys. */
  createdDevices() {
    return new Set((this.gladys.devices ?? []).map((d) => d.external_id));
  }

  addedIoIds() {
    const created = this.createdDevices();
    return [...this.inventory.deviceIds.entries()]
      .filter(([, deviceId]) => created.has(deviceId))
      .map(([ioId]) => ioId);
  }

  applyState(id, state, { created = this.createdDevices(), event = false } = {}) {
    if (typeof state !== 'string') {
      return;
    }
    const previous = this.states.get(id);
    this.states.set(id, state);
    const io = this.inventory.ios.get(id);
    if (event && io) {
      this.sceneEvent(io, state, previous, event === 'poll');
    }
    if (!created.has(this.inventory.deviceIds.get(id))) {
      return;
    }
    for (const route of this.inventory.routes.get(id) ?? []) {
      const value = route.read(state);
      if (value === undefined) {
        continue;
      }
      if (route.event) {
        // A press: sent each time, never merged with the previous one.
        if (event === true) {
          this.gladys
            .publishState(route.featureId, value)
            .catch((err) => this.logger.debug(`Button press not sent: ${err.message}`));
        }
        continue;
      }
      this.publisher.push(route.featureId, value, route.throttle);
    }
  }

  onCalaosEvent(event) {
    const type = event?.type_str;
    const data = event?.data ?? {};
    const id = typeof data.id === 'string' ? data.id : undefined;
    if (type === 'io_changed' && id) {
      if (typeof data.state === 'string') {
        this.logger.debug(`io_changed ${id}`);
        this.applyState(id, data.state, { event: true });
      } else if ('name' in data || 'visible' in data || 'gui_type' in data) {
        this.scheduleReload();
      }
      return;
    }
    if (['io_added', 'io_deleted', 'room_changed', 'io_prop_deleted'].includes(type)) {
      this.scheduleReload();
    }
  }

  sceneEvent(io, state, previous, polled = false) {
    if (NO_SCENE_EVENT.has(io.gui_type)) {
      return;
    }
    // A moving shutter_smart says where it is at every percent: only its stops count.
    if (io.gui_type === 'shutter_smart' && !/^\s*stop\b/.test(state)) {
      return;
    }
    if (state === previous && (polled || !PRESSES.has(io.gui_type))) {
      return;
    }
    const now = this.now();
    this.eventWindow = this.eventWindow.filter((t) => now - t < 60_000);
    if (this.eventWindow.length >= EVENTS_PER_MINUTE) {
      if (!this.eventsDropped) {
        this.eventsDropped = true;
        this.logger.warn(`More than ${EVENTS_PER_MINUTE} Calaos events in a minute: some dropped`);
      }
      return;
    }
    this.eventsDropped = false;
    this.eventWindow.push(now);
    this.gladys
      .publishSceneEvent(TRIGGERS.IO_CHANGED, {
        io: short(io.id, 100),
        name: short(io.name),
        room: short(io.room),
        value: short(state),
        previous_value: short(previous ?? ''),
      })
      .catch((err) => this.logger.debug(`Scene event not sent: ${err.message}`));
  }

  // --- Gladys handlers ----------------------------------------------------------------

  async onGladysConnected() {
    if (
      this.configKey === undefined ||
      JSON.stringify(this.gladys.config ?? {}) !== this.configKey
    ) {
      await this.configure(this.gladys.config ?? {});
      return;
    }
    if (this.status === 'online') {
      await this.publishDevices();
      this.pushAll();
    }
  }

  pushAll() {
    const created = this.createdDevices();
    for (const [id, state] of this.states) {
      this.applyState(id, state, { created });
    }
  }

  async onDeviceCreated(device) {
    // The SDK forgot the values of this device: they are sent again now.
    this.publisher.forget(device.external_id);
    this.pushAll();
    this.requestWidgetRefresh();
  }

  async onDeviceDeleted(device) {
    this.publisher.forget(device.external_id);
    this.requestWidgetRefresh();
  }

  requestWidgetRefresh() {
    if (this.gladys.connected) {
      // Fire-and-forget in the SDK: it may return nothing.
      Promise.resolve()
        .then(() => this.gladys.requestWidgetRefresh(WIDGET_KEY))
        .catch(() => {});
    }
  }

  /** onPoll, a fallback: the devices are published with should_poll false. */
  async poll(device) {
    const id = (device?.params ?? []).find((p) => p.name === 'calaos_id')?.value;
    if (this.status === 'online' && id) {
      await this.readStates(this.generation, [id]);
    }
  }

  async setValue(device, feature, value) {
    const writer = this.inventory.writers.get(feature?.external_id);
    if (!writer) {
      throw new Error(`Calaos: ${feature?.external_id} cannot be controlled`);
    }
    await this.sendState(writer.io, writer.write(Number(value)));
  }

  /** set_state, and its feedback while polling. Throws a multi-language error. */
  async sendState(id, command) {
    if (this.status !== 'online') {
      throw localizedError(this.errorKey());
    }
    const name = this.inventory.ios.get(id)?.name ?? id;
    this.logger.info(`Command: ${name} <- ${short(command, 40)}`);
    let answer;
    try {
      answer = await this.request('set_state', { id, value: command });
    } catch (err) {
      this.logger.warn(`Command to ${name} failed: ${err.message}`);
      throw localizedError(err instanceof CalaosAuthError ? 'auth_failed' : 'unreachable');
    }
    if (answer?.success !== 'true') {
      throw localizedError('refused', { io: name, value: command });
    }
    if (!this.live) {
      const generation = this.generation;
      this.timers.setTimeout(() => {
        this.readStates(generation, [id]).catch(() => {});
      }, this.timings.commandReadBack);
    }
  }

  errorKey() {
    return (
      {
        not_configured: 'not_configured',
        invalid_url: 'invalid_url',
        auth_failed: 'auth_failed',
      }[this.status] ?? 'offline'
    );
  }

  /**
   * An IO by its id or its name (case and accents of the name ignored).
   * Throws a multi-language error when there is none, or several.
   */
  findIo(text) {
    const wanted = String(text ?? '').trim();
    if (wanted === '') {
      throw localizedError('missing_io');
    }
    if (this.inventory.ios.has(wanted)) {
      return this.inventory.ios.get(wanted);
    }
    const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
    const matches = [...this.inventory.ios.values()].filter((io) => fold(io.name) === fold(wanted));
    if (matches.length === 0) {
      throw localizedError('not_found', { io: wanted });
    }
    if (matches.length > 1) {
      throw localizedError('ambiguous', {
        io: wanted,
        ids: matches
          .slice(0, 3)
          .map((io) => io.id)
          .join(', '),
      });
    }
    return matches[0];
  }

  /** Action `test_connection`: the configuration saved, read now over HTTP. */
  async testConnection() {
    const config = normalizeConfig(this.gladys.config ?? {});
    if (config.invalidUrl) {
      throw localizedError('invalid_url');
    }
    if (!config.url || !config.username) {
      throw localizedError('not_configured');
    }
    let home;
    try {
      home = await this.newClient(config).http('get_home');
    } catch (err) {
      throw localizedError(err instanceof CalaosAuthError ? 'auth_failed' : 'unreachable');
    }
    const inventory = buildInventory(home, {
      ...config,
      externalIds: this.gladys.externalIds.bind(this.gladys),
    });
    this.logger.info('Connection test passed');
    return testMessage({
      // The version is only known for the server connected now.
      version: config.url === this.config.url ? this.version : undefined,
      ios: inventory.ios.size,
      offered: inventory.devices.length,
      skipped: inventory.skipped,
    });
  }

  summary() {
    const created = this.createdDevices();
    return {
      status: this.status,
      version: this.version,
      live: this.live,
      offered: this.inventory.devices.length,
      added: this.inventory.devices.filter((d) => created.has(d.external_id)).length,
    };
  }
}
