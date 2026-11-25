// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const DEFAULT_CONFIG = {
  url: '',
  username: '',
  password: '',
  rooms: '',
  include_hidden: false,
  language: 'fr',
};

// calaos_server serves its JSON API (HTTP and WebSocket) on 5454.
export const DEFAULT_PORT = 5454;

/**
 * Turn what the user typed into the base URL of calaos_server (scheme, host,
 * port, no path): `192.0.2.20`, `192.0.2.20:5454`, `http://calaos.example:5454/`,
 * `https://calaos.example`. An address without scheme nor port gets 5454.
 * Returns null when it is not usable.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (text === '') {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname === '') {
    return null;
  }
  if (url.username || url.password) {
    // Credentials in the URL would end up in logs and error messages.
    return null;
  }
  if (!hasScheme && url.port === '') {
    url.port = String(DEFAULT_PORT);
  }
  return `${url.protocol}//${url.host}`;
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = typeof source.url === 'string' ? source.url.trim() : '';
  const url = normalizeUrl(typed);
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  return {
    url,
    // An address was typed but cannot be used: said in the connection status.
    invalidUrl: typed !== '' && url === null,
    username: text('username'),
    // A password may start or end with a space: kept as typed.
    password: typeof source.password === 'string' ? source.password : '',
    // Rooms are separated by commas only: a Calaos room name may hold a space.
    rooms: [
      ...new Set(
        text('rooms')
          .split(',')
          .map((r) => r.trim().toLowerCase())
          .filter(Boolean),
      ),
    ],
    includeHidden: source.include_hidden === true,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
