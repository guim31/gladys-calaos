# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The rooms and IOs of a Calaos server in the Discovery tab, one device per
  IO: lights, dimmers, colour lights, shutters and smart shutters (position),
  temperature and analog sensors, wall switches and detectors (door, motion,
  smoke, water…), long-press and triple buttons, internal variables, text
  inputs and scenarios (push button).
- Live states from the WebSocket of `calaos_server`, with a fallback to HTTP
  polling every 30 s, and an automatic reconnection.
- Control of lights, brightness, colour, shutters, position, internal
  switches and scenarios.
- Scene trigger "Calaos IO changed", scene actions "Start a Calaos scenario"
  and "Send a value to a Calaos IO", dashboard widget "Calaos".
- A "Test the connection" action, room filter, hidden IOs option, feature
  names in English, French, German or Spanish.

[Unreleased]: https://github.com/guim31/gladys-calaos/commits/main
