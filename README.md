# gladys-calaos

[Gladys Assistant](https://gladysassistant.com) external integration for
**Calaos**, the French open source home automation: the rooms and IOs of a
`calaos_server` become Gladys devices, their states follow Calaos live, and
Gladys controls them through Calaos, which keeps talking to the hardware
(Wago, KNX, 1-Wire, MQTT…). Local only. Not affiliated with the Calaos
project.

> Tested against a real `calaos_server` 4.8.3 in Docker with simulated IOs,
> not on an installation with real hardware: feedback welcome.

## What it does

- Reads the rooms and IOs of `calaos_server` (`get_home`) and offers one
  device per IO in the Discovery tab: lights, dimmers, colour lights,
  shutters (with the position of smart shutters), temperature and analog
  sensors, wall switches and detectors, long-press and triple buttons,
  internal variables, text inputs, scenarios.
- Follows the `io_changed` events of the WebSocket API live; reads the states
  over HTTP every 30 s when the WebSocket is refused.
- Controls the outputs with `set_state` (on/off, brightness, colour,
  open/stop/close, position, starting a scenario).
- Scene trigger **Calaos IO changed**, scene actions **Start a Calaos
  scenario** and **Send a value to a Calaos IO**, dashboard widget **Calaos**.
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1 or later.
- A Calaos server reachable from Gladys on its API port (5454 by default),
  with the user name and password of the Calaos apps.

## Installation

In Gladys: **Integrations → Install from GitHub**, address
`https://github.com/guim31/gladys-calaos`. Then fill in the address, user
name and password, and add the IOs you want from the **Discovery** tab. See
the [documentation](docs/en.md).

## How it works

```
index.js            SDK wiring
src/app.js          every handler of the manifest, on the bridge
src/bridge.js       connection, inventory, live events, polling fallback, commands
src/calaos/client.js  the JSON API: HTTP (arguments at the root) and WebSocket (under data)
src/mapping.js      Calaos IO -> Gladys features (pure)
src/publisher.js    states sent within the 300/min of the core, 12 h heartbeat
src/scenes.js       scene actions start_scenario and set_state
src/widgets.js      dashboard widget
src/texts.js        every text, in four languages
```

One Gladys device per Calaos IO, its external id built from the IO id
(`io_12`, kept in `io.xml`): renaming an IO or moving it to another room keeps
the device. A dropped WebSocket is reopened at once, then after 5 s doubling
up to 60 s; a WebSocket that stops answering is caught by the minute
get_state of the added IOs.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npx github:GladysAssistant/integration-store .  # store admission checks
```

`test/fixtures/calaos/` holds the `get_home` answer and WebSocket messages of
a real `calaos_server` 4.8.3 (image `ghcr.io/calaos/calaos_base`), its IOs
simulated over MQTT (Mosquitto) and KNX without a bus. `test/helpers/fakeCalaos.js`
serves them through an injected `fetch` and `WebSocket`, with the behaviour
observed on the real server; `test/gladys-rules.test.js` checks every device
against the feature table of the Gladys core.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release.

## Credits

- [Calaos](https://calaos.fr) (`calaos_base`, GPL-3.0): the JSON API, the IO
  types and their commands, read as documentation in its source code and its
  `docs/`; its Docker image for the fixtures and the real tests. The cover
  uses the Calaos logo from [calaos/www](https://github.com/calaos/www) and
  [calaos/calaos_mobile](https://github.com/calaos/calaos_mobile), © the Calaos
  project.
- [guim31/gladys-fhem](https://github.com/guim31/gladys-fhem) (Apache-2.0),
  whose bridge structure is reused, and
  [LM1LC3N7/gladys-homey](https://github.com/LM1LC3N7/gladys-homey)
  (Apache-2.0), the origin of the state publisher (`src/publisher.js`).

## Limits

No thermostat, audio player, camera or AV receiver; analog outputs and
internal numbers are not imported (the scene action sends any value). Tested
without real Calaos hardware. See the [documentation](docs/en.md#limits).

## License

Apache-2.0, see [LICENSE](LICENSE). This project is not affiliated with the
Calaos project.
