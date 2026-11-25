// -----------------------------------------------------------------------------
// The JSON API of calaos_server (port 5454), its two transports:
//
//   HTTP       POST /api, arguments at the ROOT of the body with cn_user and
//              cn_pass on every request; refused credentials -> HTTP 400 and
//              the connection closed, without a JSON body;
//   WebSocket  /api, `login` first (anything else is ignored in silence until
//              then), arguments under `data`, answers matched by `msg_id`, and
//              the events pushed without `msg_id` (`{ msg: "event", data }`).
//
// Every scalar on the wire is a string ("true", "21.5"). A request in the
// shape of the other transport gets no error, only an empty answer: the two
// shapes are kept apart here, and nowhere else.
// Verified against calaos_server 4.8.3 (ghcr.io/calaos/calaos_base) in Docker.
// -----------------------------------------------------------------------------

export const CLIENT_TIMINGS = {
  requestTimeout: 10_000,
  openTimeout: 10_000,
};

export class CalaosError extends Error {}

/** Refused credentials, or the login throttle of calaos_server. */
export class CalaosAuthError extends CalaosError {}

export class CalaosClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http://host:5454`
   * @param {string} options.username
   * @param {string} options.password
   * @param {typeof fetch} [options.fetch]
   * @param {typeof WebSocket} [options.WebSocket]
   * @param {object} [options.timers]
   * @param {object} [options.timings]
   */
  constructor({
    url,
    username,
    password,
    fetch = globalThis.fetch,
    WebSocket = globalThis.WebSocket,
    timers = globalThis,
    timings = CLIENT_TIMINGS,
  }) {
    this.url = url;
    this.username = username;
    this.password = password;
    this.fetch = fetch;
    this.WebSocket = WebSocket;
    this.timers = timers;
    this.timings = { ...CLIENT_TIMINGS, ...timings };
  }

  /**
   * One HTTP request of the API.
   * @param {string} action
   * @param {object} [params] arguments, at the root of the body
   */
  async http(action, params = {}) {
    const controller = new AbortController();
    const timer = this.timers.setTimeout(() => controller.abort(), this.timings.requestTimeout);
    let response;
    try {
      response = await this.fetch(`${this.url}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          cn_user: this.username,
          cn_pass: this.password,
          ...params,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new CalaosError(
        controller.signal.aborted ? 'No answer from Calaos' : causeOf(err) || 'Calaos unreachable',
      );
    } finally {
      this.timers.clearTimeout(timer);
    }
    if (response.status === 400) {
      throw new CalaosAuthError('Calaos refused the user name or the password');
    }
    if (!response.ok) {
      throw new CalaosError(`Calaos answered HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new CalaosError('Calaos answered something that is not JSON');
    }
  }

  /**
   * Opens a WebSocket session and logs in.
   * @param {object} handlers
   * @param {(event: object) => void} handlers.onEvent the `data` of each pushed event
   * @param {(reason: string) => void} handlers.onClose once, after a successful login
   * @returns {Promise<CalaosSession>}
   */
  open({ onEvent, onClose }) {
    const address = `${this.url.replace(/^http/, 'ws')}/api`;
    return new Promise((resolve, reject) => {
      let socket;
      try {
        socket = new this.WebSocket(address);
      } catch (err) {
        reject(new CalaosError(causeOf(err) || 'WebSocket refused'));
        return;
      }
      const session = new CalaosSession(socket, this.timers, this.timings, onEvent);
      let settled = false;
      const fail = (err) => {
        if (!settled) {
          settled = true;
          this.timers.clearTimeout(timer);
          session.close();
          reject(err);
        }
      };
      const timer = this.timers.setTimeout(
        () => fail(new CalaosError('No answer from Calaos')),
        this.timings.openTimeout,
      );
      socket.addEventListener('error', () => fail(new CalaosError('WebSocket refused')));
      socket.addEventListener('close', () => {
        session.closed();
        if (settled) {
          onClose?.('closed');
        } else {
          fail(new CalaosError('WebSocket closed before the login'));
        }
      });
      socket.addEventListener('message', (message) => session.receive(message.data));
      socket.addEventListener('open', async () => {
        try {
          const answer = await session.request('login', {
            cn_user: this.username,
            cn_pass: this.password,
          });
          if (answer?.success !== 'true') {
            fail(new CalaosAuthError('Calaos refused the user name or the password'));
            return;
          }
          settled = true;
          this.timers.clearTimeout(timer);
          resolve(session);
        } catch (err) {
          fail(err);
        }
      });
    });
  }
}

/** A logged-in WebSocket session. */
export class CalaosSession {
  constructor(socket, timers, timings, onEvent) {
    this.socket = socket;
    this.timers = timers;
    this.timings = timings;
    this.onEvent = onEvent;
    this.seq = 0;
    /** msg_id -> { resolve, reject, timer } */
    this.pending = new Map();
    this.isClosed = false;
  }

  /**
   * One request; resolves with the `data` of its answer.
   * `msg_id` is always set: without it, set_state answers nothing.
   */
  request(msg, data) {
    if (this.isClosed) {
      return Promise.reject(new CalaosError('WebSocket closed'));
    }
    this.seq += 1;
    const id = String(this.seq);
    return new Promise((resolve, reject) => {
      const timer = this.timers.setTimeout(() => {
        this.pending.delete(id);
        reject(new CalaosError('No answer from Calaos'));
      }, this.timings.requestTimeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify({ msg, msg_id: id, ...(data ? { data } : {}) }));
      } catch (err) {
        this.timers.clearTimeout(timer);
        this.pending.delete(id);
        reject(new CalaosError(causeOf(err) || 'WebSocket closed'));
      }
    });
  }

  receive(raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.msg === 'event' && message.msg_id === undefined) {
      this.onEvent?.(message.data ?? {});
      return;
    }
    const waiting = this.pending.get(String(message.msg_id));
    if (waiting) {
      this.pending.delete(String(message.msg_id));
      this.timers.clearTimeout(waiting.timer);
      waiting.resolve(message.data);
    }
  }

  closed() {
    this.isClosed = true;
    for (const { reject, timer } of this.pending.values()) {
      this.timers.clearTimeout(timer);
      reject(new CalaosError('WebSocket closed'));
    }
    this.pending.clear();
  }

  close() {
    if (!this.isClosed) {
      this.closed();
      try {
        this.socket.close();
      } catch {
        // already closing
      }
    }
  }
}

/** The useful part of a fetch or socket error (ECONNREFUSED, ENOTFOUND…), never a URL. */
function causeOf(err) {
  const code = err?.cause?.code ?? err?.code;
  return typeof code === 'string' ? `Calaos unreachable (${code})` : '';
}
