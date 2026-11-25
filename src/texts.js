// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. German says "du", Spanish "usted" (test/i18n.test.js).
// Calaos and the names of its IOs and rooms are never translated.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

/** Feature names, by role (src/mapping.js). */
export const ROLE_NAMES = {
  en: {
    onoff: 'On/off',
    brightness: 'Brightness',
    color: 'Colour',
    shutter: 'Open/close',
    position: 'Position',
    temperature: 'Temperature',
    humidity: 'Humidity',
    pressure: 'Pressure',
    illuminance: 'Illuminance',
    current: 'Current',
    voltage: 'Voltage',
    power: 'Power',
    energy: 'Energy',
    co2: 'CO2',
    opening: 'Opening',
    presence: 'Presence',
    motion: 'Motion',
    smoke: 'Smoke',
    leak: 'Water leak',
    co: 'Carbon monoxide',
    vibration: 'Vibration',
    input: 'Input',
    button: 'Button',
    text: 'Text',
    scenario: 'Start',
  },
  fr: {
    onoff: 'Marche/arrêt',
    brightness: 'Luminosité',
    color: 'Couleur',
    shutter: 'Ouvrir/fermer',
    position: 'Position',
    temperature: 'Température',
    humidity: 'Humidité',
    pressure: 'Pression',
    illuminance: 'Éclairement',
    current: 'Intensité',
    voltage: 'Tension',
    power: 'Puissance',
    energy: 'Énergie',
    co2: 'CO2',
    opening: 'Ouverture',
    presence: 'Présence',
    motion: 'Mouvement',
    smoke: 'Fumée',
    leak: "Fuite d'eau",
    co: 'Monoxyde de carbone',
    vibration: 'Vibration',
    input: 'Entrée',
    button: 'Bouton',
    text: 'Texte',
    scenario: 'Lancer',
  },
  de: {
    onoff: 'Ein/Aus',
    brightness: 'Helligkeit',
    color: 'Farbe',
    shutter: 'Öffnen/Schließen',
    position: 'Position',
    temperature: 'Temperatur',
    humidity: 'Luftfeuchtigkeit',
    pressure: 'Luftdruck',
    illuminance: 'Beleuchtungsstärke',
    current: 'Stromstärke',
    voltage: 'Spannung',
    power: 'Leistung',
    energy: 'Energie',
    co2: 'CO2',
    opening: 'Öffnung',
    presence: 'Anwesenheit',
    motion: 'Bewegung',
    smoke: 'Rauch',
    leak: 'Wasserleck',
    co: 'Kohlenmonoxid',
    vibration: 'Vibration',
    input: 'Eingang',
    button: 'Taster',
    text: 'Text',
    scenario: 'Starten',
  },
  es: {
    onoff: 'Encendido/apagado',
    brightness: 'Brillo',
    color: 'Color',
    shutter: 'Abrir/cerrar',
    position: 'Posición',
    temperature: 'Temperatura',
    humidity: 'Humedad',
    pressure: 'Presión',
    illuminance: 'Iluminancia',
    current: 'Corriente',
    voltage: 'Tensión',
    power: 'Potencia',
    energy: 'Energía',
    co2: 'CO2',
    opening: 'Apertura',
    presence: 'Presencia',
    motion: 'Movimiento',
    smoke: 'Humo',
    leak: 'Fuga de agua',
    co: 'Monóxido de carbono',
    vibration: 'Vibración',
    input: 'Entrada',
    button: 'Botón',
    text: 'Texto',
    scenario: 'Iniciar',
  },
};

/** Words of the widget. */
export const WORDS = {
  en: {
    connection: 'Calaos',
    connected: 'Connected',
    connecting: 'Connecting…',
    unreachable: 'Unreachable',
    auth_failed: 'Login refused',
    not_configured: 'To configure',
    live: 'Updates',
    live_on: 'Live',
    live_off: 'Every 30 s',
    version: 'Version',
    offered: 'IOs offered',
    added: 'Added to Gladys',
    reload: 'Read the IOs again',
    reloaded: 'IO list read again.',
  },
  fr: {
    connection: 'Calaos',
    connected: 'Connecté',
    connecting: 'Connexion…',
    unreachable: 'Injoignable',
    auth_failed: 'Connexion refusée',
    not_configured: 'À configurer',
    live: 'Mises à jour',
    live_on: 'En direct',
    live_off: 'Toutes les 30 s',
    version: 'Version',
    offered: 'IO proposées',
    added: 'Ajoutées à Gladys',
    reload: 'Relire les IO',
    reloaded: 'Liste des IO relue.',
  },
  de: {
    connection: 'Calaos',
    connected: 'Verbunden',
    connecting: 'Verbinde…',
    unreachable: 'Nicht erreichbar',
    auth_failed: 'Anmeldung abgelehnt',
    not_configured: 'Einzurichten',
    live: 'Aktualisierung',
    live_on: 'Live',
    live_off: 'Alle 30 s',
    version: 'Version',
    offered: 'Angebotene IOs',
    added: 'Zu Gladys hinzugefügt',
    reload: 'IOs neu einlesen',
    reloaded: 'IO-Liste neu eingelesen.',
  },
  es: {
    connection: 'Calaos',
    connected: 'Conectado',
    connecting: 'Conectando…',
    unreachable: 'Inaccesible',
    auth_failed: 'Inicio de sesión rechazado',
    not_configured: 'Por configurar',
    live: 'Actualizaciones',
    live_on: 'En directo',
    live_off: 'Cada 30 s',
    version: 'Versión',
    offered: 'IO ofrecidas',
    added: 'Añadidas a Gladys',
    reload: 'Volver a leer las IO',
    reloaded: 'Lista de IO leída de nuevo.',
  },
};

/** Connection status messages (setConnectionStatus takes the whole object). */
export const STATUS = {
  not_configured: {
    en: 'Enter the address of your Calaos server, its user name and its password.',
    fr: "Indiquez l'adresse de votre serveur Calaos, son nom d'utilisateur et son mot de passe.",
    de: 'Gib die Adresse deines Calaos-Servers, den Benutzernamen und das Passwort ein.',
    es: 'Indique la dirección de su servidor Calaos, su nombre de usuario y su contraseña.',
  },
  invalid_url: {
    en: 'The address of Calaos is not valid: an IP address and a port, like 192.168.1.20:5454.',
    fr: "L'adresse de Calaos n'est pas valide : une adresse IP et un port, comme 192.168.1.20:5454.",
    de: 'Die Adresse von Calaos ist ungültig: eine IP-Adresse und ein Port, etwa 192.168.1.20:5454.',
    es: 'La dirección de Calaos no es válida: una dirección IP y un puerto, como 192.168.1.20:5454.',
  },
  unreachable: {
    en: 'Calaos does not answer: check its address and that calaos_server runs.',
    fr: 'Calaos ne répond pas : vérifiez son adresse et que calaos_server tourne.',
    de: 'Calaos antwortet nicht: Prüfe die Adresse und ob calaos_server läuft.',
    es: 'Calaos no responde: compruebe su dirección y que calaos_server esté en marcha.',
  },
  auth_failed: {
    en: 'Calaos refused the user name or the password. New attempt every minute.',
    fr: "Calaos a refusé le nom d'utilisateur ou le mot de passe. Nouvel essai chaque minute.",
    de: 'Calaos hat Benutzername oder Passwort abgelehnt. Neuer Versuch jede Minute.',
    es: 'Calaos rechazó el nombre de usuario o la contraseña. Nuevo intento cada minuto.',
  },
};

/** Errors of the actions and scene actions (thrown: shown in red). */
export const ERRORS = {
  not_configured: STATUS.not_configured,
  invalid_url: STATUS.invalid_url,
  unreachable: STATUS.unreachable,
  auth_failed: {
    en: 'Calaos refused the user name or the password.',
    fr: "Calaos a refusé le nom d'utilisateur ou le mot de passe.",
    de: 'Calaos hat Benutzername oder Passwort abgelehnt.',
    es: 'Calaos rechazó el nombre de usuario o la contraseña.',
  },
  offline: {
    en: 'Calaos is not connected right now.',
    fr: "Calaos n'est pas connecté pour le moment.",
    de: 'Calaos ist gerade nicht verbunden.',
    es: 'Calaos no está conectado en este momento.',
  },
  missing_io: {
    en: 'Enter the name or the id of a Calaos IO.',
    fr: "Indiquez le nom ou l'identifiant d'une IO Calaos.",
    de: 'Gib den Namen oder die ID eines Calaos-IOs ein.',
    es: 'Indique el nombre o el identificador de una IO de Calaos.',
  },
  missing_value: {
    en: 'Enter the value to send, like true, false, toggle or set 50.',
    fr: 'Indiquez la valeur à envoyer, comme true, false, toggle ou set 50.',
    de: 'Gib den zu sendenden Wert ein, etwa true, false, toggle oder set 50.',
    es: 'Indique el valor que enviar, como true, false, toggle o set 50.',
  },
  not_found: {
    en: 'No Calaos IO has this name or id: {io}.',
    fr: "Aucune IO Calaos n'a ce nom ou cet identifiant : {io}.",
    de: 'Kein Calaos-IO hat diesen Namen oder diese ID: {io}.',
    es: 'Ninguna IO de Calaos tiene este nombre o identificador: {io}.',
  },
  ambiguous: {
    en: 'Several Calaos IOs are named {io}: enter its id instead ({ids}).',
    fr: "Plusieurs IO Calaos s'appellent {io} : indiquez plutôt son identifiant ({ids}).",
    de: 'Mehrere Calaos-IOs heißen {io}: Gib stattdessen die ID ein ({ids}).',
    es: 'Varias IO de Calaos se llaman {io}: indique mejor su identificador ({ids}).',
  },
  not_scenario: {
    en: '{io} is not a Calaos scenario.',
    fr: "{io} n'est pas un scénario Calaos.",
    de: '{io} ist kein Calaos-Szenario.',
    es: '{io} no es un escenario de Calaos.',
  },
  refused: {
    en: 'Calaos refused the command {value} for {io}.',
    fr: 'Calaos a refusé la commande {value} pour {io}.',
    de: 'Calaos hat den Befehl {value} für {io} abgelehnt.',
    es: 'Calaos rechazó el comando {value} para {io}.',
  },
};

/** An error whose message is the multi-language object: Gladys shows it in red. */
export class ActionFailure extends Error {
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}

const fill = (text, values) =>
  text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? '').slice(0, 60));

/** A multi-language error, with its {placeholders} filled. */
export function localizedError(key, values = {}) {
  const texts = ERRORS[key] ?? ERRORS.unreachable;
  return new ActionFailure(
    Object.fromEntries(LANGUAGES.map((lang) => [lang, fill(texts[lang], values)])),
  );
}

/** The message of the connection test. */
export function testMessage({ version, ios, offered, skipped }) {
  const others = (lang, none) =>
    skipped.length === 0
      ? none
      : skipped
          .slice(0, 6)
          .map(([kind, count]) => `${kind} ×${count}`)
          .join(', ') + (skipped.length > 6 ? ', …' : '');
  const v = version ? ` ${version}` : '';
  return {
    en: `Connected to Calaos${v}: ${ios} IOs, ${offered} offered in Discovery. Not imported: ${others('en', 'none')}.`,
    fr: `Connecté à Calaos${v} : ${ios} IO, ${offered} proposées dans Découverte. Non importées : ${others('fr', 'aucune')}.`,
    de: `Mit Calaos${v} verbunden: ${ios} IOs, ${offered} im Reiter Entdecken angeboten. Nicht importiert: ${others('de', 'keine')}.`,
    es: `Conectado a Calaos${v}: ${ios} IO, ${offered} ofrecidas en Descubrir. No importadas: ${others('es', 'ninguna')}.`,
  };
}
