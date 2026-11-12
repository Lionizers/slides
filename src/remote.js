/**
 * Phones in the room (dev server only): a remote control for the speaker, and a
 * view for the audience.
 *
 * The dev server listens on localhost only. When a phone needs it, a second server
 * starts on the local network. It serves the same app, with these rules:
 *
 * Remote control (?remote)
 * - The presenter view shows a QR code with a one-time pairing token. It is valid
 *   while the code is visible, and for one device only.
 * - The phone opens /pair?t=<token>. It gets a session cookie and goes to ?remote.
 * - The presenter view can disconnect all phones. That ends their sessions.
 *
 * Audience (?audience)
 * - Key A (viewer or presenter) shows a QR code over the slides. That opens the audience
 *   access. The code links to /audience.
 * - Everybody in the network can then load the app. Future slides are only hidden
 *   in the user interface, not protected.
 * - Audience devices can never move the slides: the server ignores their positions.
 * - At the end of the talk (last slide reached), /deck.pdf gives the slides as PDF.
 * - The presenter view can close the audience access.
 *
 * Without a session or an open audience access, the network server answers 403.
 * Our own endpoints (/__lionizers/) are for the laptop only.
 *
 * Sync: all windows send their position as the custom HMR event lionizers:pos.
 * The server sends it to all other clients (laptop windows and phones).
 */
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';

const COOKIE = 'lz_remote';

/** The IPv4 address of this machine in the local network, or null. */
export function lanAddress() {
  const skip = /^(lo|utun|awdl|llw|bridge|docker|veth|vboxnet|vmnet|tailscale|zt)/;
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) candidates.push({ name, address: a.address });
    }
  }
  // Wi-Fi and Ethernet first (en0, eth0, wlan0).
  candidates.sort((a, b) => Number(!/^(en|eth|wl)/.test(a.name)) - Number(!/^(en|eth|wl)/.test(b.name)) || a.name.localeCompare(b.name));
  return candidates[0]?.address ?? null;
}

const token = () => crypto.randomBytes(18).toString('base64url');

function cookieValue(req) {
  const m = (req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([\\w-]+)`));
  return m?.[1];
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

const page = (title, text) =>
  `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>` +
  `<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0e0e;color:#f5f5f0;font:18px/1.4 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box">` +
  `<div><h1 style="font-size:24px;margin:0 0 12px">${title}</h1><p style="margin:0;opacity:.7">${text}</p></div>`;

const NOT_CONNECTED = page('Not connected', 'Open the QR code in the presenter view (key Q) and scan it with this device.');
const AUDIENCE_CLOSED = page('Not open', 'The slides are not open for the audience at the moment.');

/**
 * @param server  the Vite dev server
 * @param options.port      preferred port of the network server
 * @param options.deckName  name of the deck (for the PDF file name)
 * @param options.slideCount  returns the number of slides
 */
export function setupRemote(server, { port: preferredPort, deckName, slideCount }) {
  /** Pairing token of the QR code that is visible now. */
  let pairing = null;
  /** session id → sockets of that session (so that disconnect closes them) */
  const sessions = new Map();
  /** Is the audience access open? And the WebSockets of audience devices. */
  let audienceOpen = false;
  const audience = new Set();
  /** Is the QR code for the audience shown over the slides? */
  let qr = { visible: false, url: null };
  const setQr = (next) => {
    qr = next;
    server.ws.send('lionizers:audience-qr', qr);
  };
  let lan = null;
  let lanUrl = null;

  const status = () => ({ devices: sessions.size, audience: audienceOpen ? audience.size : null });
  const broadcastStatus = () => server.ws.send('lionizers:remote', status());

  /** Last known position, for phones that connect later. */
  let position = null;
  /**
   * Highest slide index that the talk went to. The audience can see slides up to this one.
   * Only navigation counts: a window that opens (or reloads) at a later slide does not.
   */
  let reached = -1;
  const navigate = (data) => {
    position = data;
    if (data.index > reached) {
      reached = data.index;
      server.ws.send('lionizers:reached', { reached });
    }
  };

  // Vite gives us its client object. The underlying socket tells us where it comes from.
  const isAudience = (client) => audience.has(client.socket?._socket);

  server.ws.on('lionizers:pos', (data, client) => {
    if (isAudience(client)) return; // the audience can watch, but not control
    navigate(data);
    for (const c of server.ws.clients) if (c !== client) c.send('lionizers:pos', data);
  });
  server.ws.on('lionizers:here', (data, client) => {
    if (!isAudience(client)) position = data;
  });
  // A window that opens says hello. Phones take the current position, the laptop windows keep theirs (URL hash).
  server.ws.on('lionizers:hello', (data, client) => {
    client.send('lionizers:remote', status());
    client.send('lionizers:reached', { reached });
    client.send('lionizers:audience-qr', qr);
    if (data?.follow && position) client.send('lionizers:pos', position);
  });

  function sessionOf(req) {
    const id = cookieValue(req);
    return id && sessions.has(id) ? id : null;
  }

  function track(id, socket) {
    const sockets = sessions.get(id);
    if (sockets.has(socket)) return;
    sockets.add(socket);
    socket.on('close', () => sessions.get(id)?.delete(socket));
  }

  /* ---------- PDF for the audience ---------- */

  let pdf = null; // Promise<Buffer>
  server.watcher.on('all', () => (pdf = null)); // a file changed: make a new one next time

  async function renderPdf() {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ channel: 'chrome' });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const base = `http://localhost:${server.httpServer.address().port}`;
      await page.goto(`${base}/?print`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__lionizersReady === true, null, { timeout: 30000 });
      return await page.pdf({ width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true });
    } finally {
      await browser.close();
    }
  }

  /**
   * The PDF opens in the browser (inline), it is not a download: Chrome warns about downloads
   * over HTTP, but not about a page that shows a PDF.
   */
  async function sendPdf(res) {
    if (reached < slideCount() - 1) return send(res, 403, page('Not yet', 'The slides can be downloaded at the end of the talk.'));
    try {
      pdf ??= renderPdf().catch((e) => {
        pdf = null;
        throw e;
      });
      const data = await pdf;
      send(res, 200, data, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${deckName.replace(/[^\w.-]+/g, '-')}.pdf"`,
      });
    } catch (e) {
      server.config.logger.error(`PDF for the audience failed: ${e.message}`);
      send(res, 500, page('No PDF', 'The PDF could not be made. Ask the presenter.'));
    }
  }

  /* ---------- Network server ---------- */

  async function startLan() {
    if (lan) return lanUrl;
    const address = lanAddress();
    if (!address) throw new Error('This computer is not in a local network.');
    lan = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/pair') {
        if (!pairing || url.searchParams.get('t') !== pairing) {
          return send(res, 403, page('Code not valid', 'Open the QR code in the presenter view (key Q) and scan it again.'));
        }
        pairing = null; // one device per code
        const id = token();
        sessions.set(id, new Set());
        broadcastStatus();
        server.ws.send('lionizers:paired', status());
        return send(res, 302, '', {
          'Set-Cookie': `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax`,
          Location: '/?remote',
        });
      }
      // Our own endpoints are for the laptop only.
      if (url.pathname.startsWith('/__lionizers/')) return send(res, 403, 'Forbidden');
      const id = sessionOf(req);
      if (id) track(id, req.socket);
      else if (!audienceOpen) return send(res, 403, url.pathname === '/audience' || url.searchParams.has('audience') ? AUDIENCE_CLOSED : NOT_CONNECTED);
      if (url.pathname === '/audience') return send(res, 302, '', { Location: '/?audience' });
      if (url.pathname === '/deck.pdf') return sendPdf(res);
      server.middlewares(req, res);
    });
    // HMR WebSocket: same check, then Vite handles it.
    lan.on('upgrade', (req, socket, head) => {
      const id = sessionOf(req);
      if (id) track(id, socket);
      else if (audienceOpen) {
        audience.add(socket);
        socket.on('close', () => {
          audience.delete(socket);
          broadcastStatus();
        });
        broadcastStatus();
      } else return socket.destroy();
      server.httpServer.emit('upgrade', req, socket, head);
    });
    const listen = (port) =>
      new Promise((resolve, reject) => {
        lan.once('error', reject);
        lan.listen(port, '0.0.0.0', () => {
          lan.off('error', reject);
          resolve(lan.address().port);
        });
      });
    let port;
    try {
      port = await listen(preferredPort);
    } catch {
      port = await listen(0);
    }
    lanUrl = `http://${address}:${port}`;
    server.config.logger.info(`  Network: ${lanUrl} (paired phones and, when open, the audience)`);
    return lanUrl;
  }

  function disconnectAll() {
    for (const sockets of sessions.values()) for (const s of sockets) s.destroy();
    sessions.clear();
    broadcastStatus();
  }

  function closeAudience() {
    audienceOpen = false;
    for (const s of audience) s.destroy();
    audience.clear();
    broadcastStatus();
  }

  const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

  server.middlewares.use('/__lionizers/remote', async (req, res) => {
    if (!isLocal(req)) return send(res, 403, 'Forbidden');
    const json = (status, body) => send(res, status, JSON.stringify(body), { 'Content-Type': 'application/json' });
    try {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const url = new URL(req.url, 'http://x');
      switch (url.pathname) {
        case '/pair': {
          const base = await startLan();
          pairing = token();
          return json(200, { url: `${base}/pair?t=${pairing}`, ...status() });
        }
        case '/close':
          pairing = null;
          return json(200, status());
        case '/disconnect':
          disconnectAll();
          return json(200, status());
        case '/audience/show': {
          // Show the QR code over the slides. That also opens the access.
          const base = await startLan();
          if (!audienceOpen) {
            audienceOpen = true;
            broadcastStatus();
          }
          setQr({ visible: true, url: `${base}/audience` });
          return json(200, status());
        }
        case '/audience/hide':
          setQr({ ...qr, visible: false });
          return json(200, status());
        case '/audience/close':
          setQr({ ...qr, visible: false });
          closeAudience();
          return json(200, status());
        default:
          return json(404, { error: 'Not found' });
      }
    } catch (e) {
      json(500, { error: e.message });
    }
  });

  server.httpServer?.on('close', () => {
    disconnectAll();
    closeAudience();
    lan?.close();
  });
}
