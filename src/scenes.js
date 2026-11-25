// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`), on any Calaos IO, even one not
// added to Gladys (a hidden internal variable, a scenario):
//
//   start_scenario  set_state <scenario> true, the scenario checked first;
//   set_state       set_state <io> <value>, the value as Calaos rules write it
//                   (true, false, toggle, set 50, up, down, impulse 500…).
//
// The IO is typed by the scene author (the scene editor only lists Gladys
// devices): its name in Calaos, or its id when two IOs share a name.
// set_state only reaches an IO: no Lua, no configuration.
// -----------------------------------------------------------------------------

import { localizedError } from './texts.js';

const FORBIDDEN = /[\n\r\0]/;

export function sceneActions(bridge) {
  return {
    async start_scenario(fields) {
      const io = bridge.findIo(fields.scenario);
      if (io.gui_type !== 'scenario') {
        throw localizedError('not_scenario', { io: io.name });
      }
      await bridge.sendState(io.id, 'true');
    },
    async set_state(fields) {
      const io = bridge.findIo(fields.io);
      const value = String(fields.value ?? '').trim();
      if (value === '' || value.length > 200 || FORBIDDEN.test(value)) {
        throw localizedError('missing_value');
      }
      await bridge.sendState(io.id, value);
    },
  };
}

export const SCENE_ACTION_KEYS = ['start_scenario', 'set_state'];
