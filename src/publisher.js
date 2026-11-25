// -----------------------------------------------------------------------------
// The states sent to Gladys, within its 300 states per minute.
//
// A Calaos server pushes every change of every IO, a power meter included.
// The publisher keeps the LAST value of each feature, sends the pending ones
// every second within a per-minute budget, skips the unchanged ones
// (publishChangedStates, with a 12 h heartbeat) and spaces the measurements of
// a same feature by its interval (a measurement, the position of a moving
// shutter). Lights, buttons and detectors are never delayed, only budgeted.
//
// Adapted from the publisher of LM1LC3N7/gladys-homey (Apache-2.0), through
// guim31/gladys-fhem.
// -----------------------------------------------------------------------------

export const PUBLISHER_TIMINGS = {
  flushInterval: 1000,
  // Gladys shows "no recent value" after 48 h: an unchanged value is sent again every 12 h.
  heartbeat: 12 * 60 * 60 * 1000,
};

/** Kept below the 300 states per minute of the core: the margin is for the other paths. */
export const STATES_PER_MINUTE = 250;

export class StatePublisher {
  constructor({
    gladys,
    logger,
    now = Date.now,
    timers = globalThis,
    timings = PUBLISHER_TIMINGS,
    budget = STATES_PER_MINUTE,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.timings = { ...PUBLISHER_TIMINGS, ...timings };
    this.budget = budget;
    /** featureId -> state */
    this.pending = new Map();
    /** featureId -> last send time */
    this.lastSent = new Map();
    /** send times of the last minute */
    this.window = [];
    /** featureId -> minimum interval between two values, in ms */
    this.throttled = new Map();
    this.timer = undefined;
    this.flushing = undefined;
    this.failing = false;
  }

  start() {
    this.stop();
    this.timer = this.timers.setInterval(() => {
      this.flush().catch(() => {});
    }, this.timings.flushInterval);
  }

  stop() {
    if (this.timer) {
      this.timers.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * @param {string} featureId
   * @param {number | { text: string }} state a number, or `{ text }` for a text feature
   * @param {number} [interval] minimum interval between two values of this feature, in ms
   */
  push(featureId, state, interval = 0) {
    this.pending.set(featureId, state);
    if (interval > 0) {
      this.throttled.set(featureId, interval);
    } else {
      this.throttled.delete(featureId);
    }
  }

  /** Drop the pending values and send times of a device (deleted, or created again). */
  forget(deviceId) {
    for (const map of [this.pending, this.lastSent]) {
      for (const key of map.keys()) {
        if (key.startsWith(`${deviceId}:`)) {
          map.delete(key);
        }
      }
    }
  }

  clear() {
    this.pending.clear();
  }

  flush() {
    if (!this.flushing) {
      this.flushing = this.doFlush().finally(() => {
        this.flushing = undefined;
      });
    }
    return this.flushing;
  }

  async doFlush() {
    if (this.pending.size === 0 || !this.gladys.connected) {
      return 0;
    }
    const now = this.now();
    this.window = this.window.filter((t) => now - t < 60_000);
    let room = this.budget - this.window.length;
    const batch = [];
    for (const [featureId, state] of this.pending) {
      if (room <= 0) {
        break;
      }
      const last = this.lastSent.get(featureId);
      if (last !== undefined && now - last < (this.throttled.get(featureId) ?? 0)) {
        continue;
      }
      this.pending.delete(featureId);
      batch.push(
        typeof state === 'object'
          ? { device_feature_external_id: featureId, text: state.text }
          : { device_feature_external_id: featureId, state },
      );
      room -= 1;
    }
    if (batch.length === 0) {
      return 0;
    }
    try {
      const result = await this.gladys.publishChangedStates(batch, {
        heartbeat: this.timings.heartbeat,
      });
      for (const entry of batch) {
        this.lastSent.set(entry.device_feature_external_id, now);
      }
      const count = result?.count ?? batch.length;
      for (let i = 0; i < count; i += 1) {
        this.window.push(now);
      }
      if (this.failing) {
        this.failing = false;
        this.logger.info('Sending the states to Gladys works again');
      }
      return count;
    } catch (err) {
      // Keep the values for the next round, unless a newer one arrived meanwhile.
      for (const { device_feature_external_id: id, state, text } of batch) {
        if (!this.pending.has(id)) {
          this.pending.set(id, text === undefined ? state : { text });
        }
      }
      if (!this.failing) {
        this.failing = true;
        this.logger.warn(`Sending the states to Gladys failed: ${err.message}`);
      }
      throw err;
    }
  }
}
