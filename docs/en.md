# Calaos

Brings the rooms and IOs of your [Calaos](https://calaos.fr) home automation server into
Gladys: lights, dimmers, colour lights, shutters, sensors, wall switches, internal variables and
scenarios. Gladys talks to `calaos_server` on your local network, through the JSON API the Calaos
apps use, and receives every change live.

Tested against a real `calaos_server` 4.8.3, with simulated IOs, not on an installation with
real Wago, KNX or 1-Wire hardware: feedback welcome on the forum.

## Requirements

- A Calaos server (Calaos OS, or the `calaos_base` container) reachable from the Gladys machine.
- The user name and password of the Calaos apps (Calaos Home, the web app).
- Gladys 5.1 or later.

## Configuration

### Address

The IP address of the Calaos server, as seen from Gladys: `192.168.1.20`. Port 5454 is added
when you give none; give `192.168.1.20:5454` or `http://192.168.1.20:5454` otherwise. Use the
port of `calaos_server` itself, not the HTTPS port of the web app: Gladys does not accept the
self-signed certificate of a Calaos box.

### User name and password

The ones of the Calaos apps. After a wrong password, Calaos slows down every new attempt from the
same address for a while (up to a minute): Gladys tries again a few seconds later, then every
minute.

### Choosing what to import

Every IO of every room is offered in the **Discovery** tab of the integration: add the ones you
want. **Only the IOs of these rooms** keeps the rooms you list (Calaos room names, separated by
commas).

The IOs hidden in the Calaos apps (internal variables, technical outputs) are only offered with
**Also offer the hidden IOs**. Wall switches and buttons are always offered, as Calaos hides them
by default.

### Language

**Language of the feature names** sets the language of the names Gladys gives to the features
(On/off, Brightness…), when the device is added.

## What you get

### Devices

One Gladys device per Calaos IO, named after the IO and its room:

| Calaos IO                      | In Gladys                                                         |
| ------------------------------ | ----------------------------------------------------------------- |
| Light                          | light, on/off                                                     |
| Dimmer                         | light, on/off and brightness                                      |
| Colour light (RGB)             | light, on/off and colour                                          |
| Shutter                        | shutter, open / stop / close                                      |
| Smart shutter                  | shutter, open / stop / close and position (100 % = open)          |
| Temperature                    | temperature sensor (°C)                                           |
| Analog input                   | the sensor of its style or unit: humidity, pressure, lux, W, kWh… |
| Switch, door, motion, smoke…   | input, or the detector of its style (opening, motion, leak…)      |
| Long-press and triple switches | button: click, long click, double and triple click                |
| Internal boolean               | switch                                                            |
| Internal text, text input      | text                                                              |
| Scenario                       | push button that starts it                                        |

Not imported: analog outputs, internal numbers, time ranges, timers, cameras, audio players and AV
receivers. **Test the connection** lists what was left out. An analog input with a unit Gladys
does not know (or a percentage without the humidity style) is left out too: choose its style in
Calaos Installer.

States arrive live, a few hundredths of a second after the change. Measurements are sent at most
every 10 seconds, the position of a moving smart shutter every 2 seconds.

### Dashboard widget

**Calaos**: the connection, the Calaos version, live updates or polling, the IOs offered and
added, and a button to read the IO list again (it can be hidden in the widget settings).

### Scene trigger

**Calaos IO changed**: an IO changed in Calaos, even one not added to Gladys (a button, a
scenario, an internal variable). Filter on the IO name and the new value; the variables give the
id, the name, the room, the new and the previous value. Temperatures and analog inputs do not start
it (use their device), nor the intermediate positions of a moving smart shutter.

### Scene actions

- **Start a Calaos scenario**, by its name, even one not added to Gladys.
- **Send a value to a Calaos IO**, as the Calaos rules do: `true`, `false`, `toggle`, `set 50`,
  `up`, `down`, `stop`, `impulse 500`, `set #FF8000`… The IO is its name, or its id when two IOs
  share a name (the error message gives the ids).

## Scene examples

- When the "Front door" button is pressed long, start the Calaos scenario "Leaving".
- When Gladys detects nobody at home, send `true` to the internal variable "Away mode" that your
  Calaos rules use.
- When the Calaos IO "Doorbell" becomes `true`, send a Telegram message.

## Troubleshooting

- **Calaos does not answer**: check the address and the port (5454) from the Gladys machine, and
  that `calaos_server` runs.
- **Login refused**: check the user name and the password in the Calaos apps. After several
  failures, wait a minute.
- **Updates: every 30 s** in the widget: the WebSocket of Calaos is refused (a proxy in between
  that does not let it through). Gladys reads the states over HTTP every 30 seconds and tries the
  WebSocket again regularly. Meanwhile, button presses are missed and the scene trigger only sees
  the changes still there at the next read.
- **An IO is missing**: it is hidden in Calaos (see the option), outside the chosen rooms, or of a
  kind not imported (**Test the connection** lists them).

## Limits

- No thermostat, audio player, camera or AV receiver.
- A door or window switch is read as open when Calaos says `true`.
- A plain shutter has no position: its state turns to closed at the end of its travel time.
- Commands go through `set_state`: Calaos accepts or refuses them, without telling why.

## Privacy

Everything stays on your local network: Gladys only talks to your Calaos server. The password is
stored by Gladys, never written to the logs.
