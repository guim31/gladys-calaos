# Calaos

Bringt die Räume und IOs deines [Calaos](https://calaos.fr)-Hausautomationsservers in Gladys:
Lampen, Dimmer, Farblampen, Rollläden, Sensoren, Wandschalter, interne Variablen und Szenarien.
Gladys spricht mit `calaos_server` in deinem lokalen Netz, über die JSON-API, die auch die
Calaos-Apps nutzen, und erhält jede Änderung live.

Getestet gegen einen echten `calaos_server` 4.8.3 mit simulierten IOs, nicht an einer Anlage mit
echter Wago-, KNX- oder 1-Wire-Hardware: Rückmeldungen im Forum sind willkommen.

## Voraussetzungen

- Ein Calaos-Server (Calaos OS oder der Container `calaos_base`), von der Gladys-Maschine aus
  erreichbar.
- Benutzername und Passwort der Calaos-Apps (Calaos Home, die Web-App).
- Gladys 5.1 oder neuer.

## Konfiguration

### Adresse

Die IP-Adresse des Calaos-Servers, von Gladys aus gesehen: `192.168.1.20`. Ohne Angabe wird Port
5454 ergänzt; sonst gib `192.168.1.20:5454` oder `http://192.168.1.20:5454` ein. Nimm den Port von
`calaos_server` selbst, nicht den HTTPS-Port der Web-App: Gladys akzeptiert das selbstsignierte
Zertifikat einer Calaos-Box nicht.

### Benutzername und Passwort

Die der Calaos-Apps. Nach einem falschen Passwort bremst Calaos jeden neuen Versuch derselben
Adresse eine Weile aus (bis zu einer Minute): Gladys versucht es ein paar Sekunden später erneut,
dann jede Minute.

### Auswahl des Imports

Jedes IO jedes Raums wird im Reiter **Entdecken** der Integration angeboten: Füge die gewünschten
hinzu. **Nur die IOs dieser Räume** behält die aufgeführten Räume (Calaos-Raumnamen, durch Kommas
getrennt).

In den Calaos-Apps ausgeblendete IOs (interne Variablen, technische Ausgänge) werden nur mit
**Auch die ausgeblendeten IOs anbieten** angeboten. Wandschalter und Taster werden immer
angeboten, da Calaos sie standardmäßig ausblendet.

### Sprache

**Sprache der Funktionsnamen** legt die Sprache der Namen fest, die Gladys den Funktionen gibt
(Ein/Aus, Helligkeit…), wenn das Gerät hinzugefügt wird.

## Was du bekommst

### Geräte

Ein Gladys-Gerät pro Calaos-IO, benannt nach dem IO und seinem Raum:

| Calaos-IO                        | In Gladys                                                          |
| -------------------------------- | ------------------------------------------------------------------ |
| Lampe                            | Licht, Ein/Aus                                                     |
| Dimmer                           | Licht, Ein/Aus und Helligkeit                                      |
| Farblampe (RGB)                  | Licht, Ein/Aus und Farbe                                           |
| Rollladen                        | Rollladen, öffnen / Stopp / schließen                              |
| Intelligenter Rollladen          | Rollladen, öffnen / Stopp / schließen und Position (100 % = offen) |
| Temperatur                       | Temperatursensor (°C)                                              |
| Analogeingang                    | der Sensor seines Stils oder seiner Einheit: Feuchte, Druck, Lux…  |
| Schalter, Tür, Bewegung, Rauch…  | Eingang, oder der Melder seines Stils (Öffnung, Bewegung, Leck…)   |
| Langdruck- und Dreifach-Schalter | Taster: Klick, langer Klick, Doppel- und Dreifachklick             |
| Interner Boolean                 | Schalter                                                           |
| Interner Text, Texteingang       | Text                                                               |
| Szenario                         | Drucktaster, der es startet                                        |

Nicht importiert: Analogausgänge, interne Zahlen, Zeitbereiche, Timer, Kameras, Audioplayer und
AV-Receiver. **Verbindung testen** listet, was ausgelassen wurde. Ein Analogeingang mit einer
Einheit, die Gladys nicht kennt (oder ein Prozentwert ohne den Feuchte-Stil), wird ebenfalls
ausgelassen: Wähle seinen Stil im Calaos Installer.

Zustände kommen live an, wenige Hundertstelsekunden nach der Änderung. Messwerte werden höchstens
alle 10 Sekunden gesendet, die Position eines fahrenden intelligenten Rollladens alle 2 Sekunden.

### Dashboard-Widget

**Calaos**: die Verbindung, die Calaos-Version, Live-Aktualisierung oder Abfrage, die angebotenen
und hinzugefügten IOs und eine Schaltfläche zum Neueinlesen der IO-Liste (in den
Widget-Einstellungen ausblendbar).

### Szenen-Auslöser

**Calaos-IO geändert**: Ein IO hat sich in Calaos geändert, auch eines, das nicht zu Gladys
hinzugefügt ist (ein Taster, ein Szenario, eine interne Variable). Filtere nach dem IO-Namen und
dem neuen Wert; die Variablen liefern ID, Name, Raum, neuen und vorherigen Wert. Temperaturen und
Analogeingänge lösen ihn nicht aus (nutze ihr Gerät), ebenso wenig die Zwischenpositionen eines
fahrenden intelligenten Rollladens.

### Szenen-Aktionen

- **Calaos-Szenario starten**, über seinen Namen, auch ohne Gladys-Gerät.
- **Wert an ein Calaos-IO senden**, wie es die Calaos-Regeln tun: `true`, `false`, `toggle`,
  `set 50`, `up`, `down`, `stop`, `impulse 500`, `set #FF8000`… Das IO ist sein Name, oder seine
  ID, wenn zwei IOs gleich heißen (die Fehlermeldung nennt die IDs).

## Szenen-Beispiele

- Wenn der Taster „Haustür“ lange gedrückt wird, das Calaos-Szenario „Weggehen“ starten.
- Wenn Gladys niemanden mehr zu Hause erkennt, `true` an die interne Variable „Abwesend“ senden,
  die deine Calaos-Regeln nutzen.
- Wenn das Calaos-IO „Klingel“ `true` wird, eine Telegram-Nachricht senden.

## Fehlerbehebung

- **Calaos antwortet nicht**: Prüfe Adresse und Port (5454) von der Gladys-Maschine aus und ob
  `calaos_server` läuft.
- **Anmeldung abgelehnt**: Prüfe Benutzername und Passwort in den Calaos-Apps. Warte nach mehreren
  Fehlversuchen eine Minute.
- **Aktualisierung: alle 30 s** im Widget: Der WebSocket von Calaos wird abgelehnt (ein Proxy
  dazwischen lässt ihn nicht durch). Gladys liest die Zustände alle 30 Sekunden über HTTP und
  versucht den WebSocket regelmäßig erneut.
- **Ein IO fehlt**: Es ist in Calaos ausgeblendet (siehe Option), außerhalb der gewählten Räume
  oder von einer nicht importierten Art (**Verbindung testen** listet sie).

## Grenzen

- Kein Thermostat, kein Audioplayer, keine Kamera, kein AV-Receiver.
- Ein Tür- oder Fensterschalter gilt als offen, wenn Calaos `true` meldet.
- Ein einfacher Rollladen hat keine Position: Sein Zustand wechselt am Ende der Fahrzeit auf
  geschlossen.
- Befehle laufen über `set_state`: Calaos nimmt sie an oder lehnt sie ab, ohne Begründung.

## Datenschutz

Alles bleibt in deinem lokalen Netz: Gladys spricht nur mit deinem Calaos-Server. Das Passwort wird
von Gladys gespeichert und nie in die Protokolle geschrieben.
