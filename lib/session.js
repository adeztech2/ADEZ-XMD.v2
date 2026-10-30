const zlib = require('zlib');
const crypto = require('crypto');
const { BufferJSON } = require('@whiskeysockets/baileys');

// SESSION_ID comes from your pair site: "<PREFIX>~" + gzip(creds.json) as base64.
// Any prefix is accepted (NEXUS~, ADEZ~, ...), and a plain base64 value works too.
function parseSessionId(id) {
  const raw = String(id || '').trim();
  if (!raw) return null;
  const b64 = raw.includes('~') ? raw.slice(raw.indexOf('~') + 1) : raw;
  let buf = Buffer.from(b64, 'base64');
  try {
    buf = zlib.gunzipSync(buf);
  } catch {
    // not gzipped: treat it as plain base64 JSON
  }
  const creds = JSON.parse(buf.toString(), BufferJSON.reviver);
  if (!creds || !creds.noiseKey || !creds.signedIdentityKey) throw new Error('not a valid WhatsApp session');
  return creds;
}

const hashSession = (id) => crypto.createHash('sha256').update(String(id || '').trim()).digest('hex');

module.exports = { parseSessionId, hashSession };
