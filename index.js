const http = require('http');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers,
  BufferJSON,
} = require('@whiskeysockets/baileys');

const config = require('./config');
const { log } = require('./lib/log');
const { useMongoAuthState } = require('./lib/mongoAuth');
const { parseSessionId, hashSession } = require('./lib/session');
const { loadCommands, handle } = require('./lib/handler');

const baileysLogger = pino({ level: 'silent' });

loadCommands();

// Tiny web server: Render needs an open port, and it doubles as a health check.
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`${config.botName} is running`);
  })
  .listen(config.port, () => log.info(`Web server on port ${config.port}`));

let sock = null;
let starting = false;
let retries = 0;
let authClear = null;

async function start() {
  if (starting) return;
  starting = true;
  try {
    // Close the previous socket completely so two connections never overlap.
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end(undefined);
      } catch {}
      sock = null;
    }

    // SESSION_ID (from your pair site) is imported once, and again only if you replace it.
    let seed = null;
    if (config.sessionId) {
      try {
        seed = { creds: parseSessionId(config.sessionId), hash: hashSession(config.sessionId) };
      } catch (e) {
        log.error(`SESSION_ID is invalid (${e.message}). Get a new one from your pair site.`);
      }
    }

    let state, saveCreds;
    if (config.mongoUri) {
      const auth = await useMongoAuthState(config.mongoUri, { seed });
      ({ state, saveCreds } = auth);
      authClear = auth.clear;
    } else {
      log.warn('MONGODB_URI is not set: the session is stored on disk and is lost on restart on most hosts.');
      fs.mkdirSync(config.sessionDir, { recursive: true });
      const credsFile = path.join(config.sessionDir, 'creds.json');
      if (seed && !fs.existsSync(credsFile)) {
        fs.writeFileSync(credsFile, JSON.stringify(seed.creds, BufferJSON.replacer));
      }
      ({ state, saveCreds } = await useMultiFileAuthState(config.sessionDir));
    }

    const { version } = await fetchLatestBaileysVersion();
    const s = makeWASocket({
      version,
      logger: baileysLogger,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLogger) },
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: false,
    });
    sock = s;

    // Fallback login without a session ID: print a pairing code in the logs.
    if (!s.authState.creds.registered) {
      if (!config.pairingNumber) {
        log.error('Not linked yet. Set SESSION_ID (from your pair site), or PAIRING_NUMBER for a code in the logs.');
      } else {
        setTimeout(async () => {
          try {
            const code = await s.requestPairingCode(config.pairingNumber);
            log.info(`PAIRING CODE: ${(code.match(/.{1,4}/g) || [code]).join('-')}`);
            log.info('WhatsApp > Linked devices > Link a device > Link with phone number instead.');
          } catch (e) {
            log.error('Could not get a pairing code:', e.message);
          }
        }, 3000);
      }
    }

    s.ev.on('creds.update', saveCreds);

    s.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        retries = 0;
        log.info(`${config.botName} connected as ${s.user && s.user.id}`);
      }
      if (connection === 'close') {
        const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
          ? lastDisconnect.error.output.statusCode
          : undefined;

        if (code === DisconnectReason.loggedOut) {
          log.error('Logged out from WhatsApp. Saved session cleared. Get a NEW session ID from your pair site and update SESSION_ID.');
          Promise.resolve(authClear && authClear()).finally(() => process.exit(1));
          return;
        }
        if (code === DisconnectReason.connectionReplaced) {
          log.error('This session was opened somewhere else (440). Stopping this copy.');
          process.exit(0);
        }

        retries += 1;
        const wait = Math.min(30000, 2000 * retries);
        log.warn(`Connection closed (${code}). Reconnecting in ${wait / 1000}s...`);
        setTimeout(start, wait);
      }
    });

    s.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const msg of messages) {
        const age = Date.now() / 1000 - Number(String(msg.messageTimestamp || 0));
        const fresh = type === 'notify' || (type === 'append' && msg.key.fromMe && age < 60);
        if (!fresh) continue;
        if (config.autoRead && !msg.key.fromMe) s.readMessages([msg.key]).catch(() => {});
        await handle(s, msg);
      }
    });
  } catch (e) {
    log.error('Start failed:', e.message);
    retries += 1;
    setTimeout(start, Math.min(30000, 3000 * retries));
  } finally {
    starting = false;
  }
}

// Keep-alive for free hosts that sleep without incoming web traffic.
if (config.keepAliveUrl) {
  log.info(`Keep-alive ping enabled for ${config.keepAliveUrl}`);
  setInterval(() => fetch(config.keepAliveUrl).catch(() => {}), 4 * 60 * 1000);
}

// Heroku and Render send SIGTERM on every restart or deploy: close WhatsApp cleanly first.
const shutdown = () => {
  try { sock && sock.end(undefined); } catch {}
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (e) => log.error('Unhandled rejection:', e));
process.on('uncaughtException', (e) => log.error('Uncaught exception:', e));

start();
