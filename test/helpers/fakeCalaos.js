// -----------------------------------------------------------------------------
// A fake calaos_server, in memory: its HTTP API (a `fetch`) and its WebSocket
// (a `WebSocket` class), on the IOs of test/fixtures/calaos/get_home.json,
// captured from a real calaos_server 4.8.3. The answers keep the real shapes:
// every scalar a string, arguments at the root over HTTP and under `data`
// over the WebSocket, 400 for refused credentials, `success: "false"` and a
// closed socket for a refused WebSocket login, events without `msg_id`.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const HOME = JSON.parse(
  readFileSync(new URL('../fixtures/calaos/get_home.json', import.meta.url), 'utf8'),
);
export const WIRE = JSON.parse(
  readFileSync(new URL('../fixtures/calaos/websocket.json', import.meta.url), 'utf8'),
);

export const USER = 'gladys';
export const PASSWORD = 'test-pass';

const later = (fn) => setTimeout(fn, 1);

/** What a command does to the state of an IO, as calaos_server does it. */
function apply(io, value) {
  const v = String(value);
  switch (io.gui_type) {
    case 'light':
    case 'var_bool':
      if (v === 'toggle') {
        return io.state === 'true' ? 'false' : 'true';
      }
      return ['true', 'on'].includes(v) ? 'true' : ['false', 'off'].includes(v) ? 'false' : null;
    case 'light_dimmer': {
      if (v === 'true' || v === 'on') {
        return io.last ?? '100';
      }
      if (v === 'false' || v === 'off') {
        if (io.state !== '0') io.last = io.state;
        return '0';
      }
      const m = /^set (\d+)$/.exec(v);
      return m ? String(Math.min(100, Number(m[1]))) : null;
    }
    case 'light_rgb': {
      if (v === 'false' || v === 'off') {
        return '0';
      }
      const m = /^set (#[0-9A-F]{6})$/i.exec(v);
      return m ? m[1].toUpperCase() : v === 'true' ? '#FFFFFF' : null;
    }
    case 'shutter':
      return v === 'up' ? 'true' : v === 'down' ? 'false' : v === 'stop' ? io.state : null;
    case 'shutter_smart': {
      const m = /^set (\d+)$/.exec(v);
      if (m) return `stop ${m[1]}`;
      return v === 'up' ? 'stop 0' : v === 'down' ? 'stop 100' : v === 'stop' ? io.state : null;
    }
    case 'scenario':
      return v === 'true' ? 'true' : null;
    default:
      return v;
  }
}

export function createCalaos({ home = HOME } = {}) {
  const fake = {
    home: structuredClone(home),
    down: false,
    wsRefused: false,
    password: PASSWORD,
    silent: false,
    http: [],
    ws: [],
    commands: [],
    sockets: new Set(),
    logins: 0,
  };

  fake.ios = () => fake.home.home.flatMap((room) => room.items);
  fake.io = (id) => fake.ios().find((io) => io.id === id);

  /** Changes a state on the Calaos side, and tells the WebSockets. */
  fake.change = (id, state) => {
    const io = fake.io(id);
    io.state = state;
    fake.event('io_changed', { id, state });
  };

  fake.event = (type, data) => {
    const raw = JSON.stringify({
      msg: 'event',
      data: { type_str: type, type: '3', event_raw: type, data },
    });
    for (const socket of fake.sockets) {
      if (socket.loggedIn) {
        socket.deliver(raw);
      }
    }
  };

  /** calaos_server stops: open sockets closed. */
  fake.stop = () => {
    fake.down = true;
    for (const socket of [...fake.sockets]) {
      socket.serverClose();
    }
  };
  fake.start = () => {
    fake.down = false;
  };

  function run(action, args) {
    switch (action) {
      case 'get_home':
        return structuredClone(fake.home);
      case 'get_server_info':
        return structuredClone(WIRE.get_server_info.data);
      case 'get_state': {
        const out = {};
        for (const id of args.items ?? []) {
          const io = fake.io(id);
          if (io) out[id] = io.state;
        }
        return out;
      }
      case 'set_state': {
        const io = fake.io(args.id);
        fake.commands.push([args.id, String(args.value)]);
        const state = io ? apply(io, args.value) : null;
        if (state === null) {
          return { success: 'false' };
        }
        later(() => {
          fake.change(io.id, state);
          if (io.gui_type === 'scenario') {
            later(() => fake.change(io.id, 'false'));
          }
        });
        return { success: 'true' };
      }
      default:
        return undefined;
    }
  }

  fake.fetch = async (url, init = {}) => {
    if (fake.down) {
      const err = new TypeError('fetch failed');
      err.cause = { code: 'ECONNREFUSED' };
      throw err;
    }
    const body = JSON.parse(init.body);
    fake.http.push(body);
    if (!String(url).endsWith('/api')) {
      return new Response('', { status: 404 });
    }
    if (body.cn_user !== USER || body.cn_pass !== fake.password) {
      return new Response('<html>Bad request</html>', { status: 400 });
    }
    const answer = run(body.action, body);
    return Response.json(answer ?? { error: 'unknown action' });
  };

  class FakeWebSocket extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.loggedIn = false;
      this.closedFlag = false;
      later(() => {
        if (fake.down || fake.wsRefused) {
          this.dispatchEvent(new Event('error'));
          this.serverClose();
          return;
        }
        fake.sockets.add(this);
        this.dispatchEvent(new Event('open'));
      });
    }

    deliver(raw) {
      if (!this.closedFlag) {
        later(() => this.dispatchEvent(new MessageEvent('message', { data: raw })));
      }
    }

    send(raw) {
      if (this.closedFlag) {
        throw new Error('WebSocket is not open');
      }
      const message = JSON.parse(raw);
      fake.ws.push(message);
      const reply = (data) =>
        this.deliver(JSON.stringify({ msg: message.msg, msg_id: message.msg_id, data }));
      if (message.msg === 'login') {
        fake.logins += 1;
        const ok = message.data?.cn_user === USER && message.data?.cn_pass === fake.password;
        reply({ success: ok ? 'true' : 'false' });
        if (ok) {
          this.loggedIn = true;
        } else {
          later(() => this.serverClose());
        }
        return;
      }
      // Before the login, and when the server hangs: silence.
      if (!this.loggedIn || fake.silent) {
        return;
      }
      const answer = run(message.msg, message.data ?? {});
      if (answer !== undefined) {
        reply(answer);
      }
    }

    close() {
      this.serverClose();
    }

    serverClose() {
      if (this.closedFlag) {
        return;
      }
      this.closedFlag = true;
      fake.sockets.delete(this);
      later(() => this.dispatchEvent(new Event('close')));
    }
  }

  fake.WebSocket = FakeWebSocket;
  return fake;
}
