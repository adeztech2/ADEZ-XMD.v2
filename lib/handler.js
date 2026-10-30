const fs = require('fs');
const path = require('path');
const config = require('../config');
const { log } = require('./log');

const commands = new Map(); // name or alias -> plugin
const list = []; // each plugin once, for the menu

function loadCommands() {
  commands.clear();
  list.length = 0;
  const dir = path.join(__dirname, '..', 'plugins');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const cmd = require(path.join(dir, file));
    if (!cmd || !cmd.name || typeof cmd.run !== 'function') continue;
    list.push(cmd);
    for (const n of [cmd.name, ...(cmd.aliases || [])]) commands.set(n.toLowerCase(), cmd);
  }
  log.info(`Loaded ${list.length} plugins | prefix "${config.prefix}" | mode ${config.mode} | owners ${config.owners.length}`);
}

const toNumber = (j) => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');

// Every reply is bold (WhatsApp needs the stars on each line) plus a footer.
const bold = (raw) =>
  String(raw)
    .split('\n')
    .map((line) => {
      const m = line.match(/^(\s*)(.*?)(\s*)$/);
      const body = m[2].replace(/\*/g, '');
      return body ? `${m[1]}*${body}*${m[3]}` : line;
    })
    .join('\n');
const format = (raw) => `${bold(raw)}\n\n${config.footer}`;

// Unwrap disappearing / view-once / linked-device wrappers, then read the text.
const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage', 'deviceSentMessage'];
function textOf(message) {
  let cur = message;
  for (let i = 0; i < 5 && cur; i++) {
    const key = WRAPPERS.find((k) => cur[k] && cur[k].message);
    if (!key) break;
    cur = cur[key].message;
  }
  if (!cur) return '';
  return (
    cur.conversation ||
    (cur.extendedTextMessage && cur.extendedTextMessage.text) ||
    (cur.imageMessage && cur.imageMessage.caption) ||
    (cur.videoMessage && cur.videoMessage.caption) ||
    ''
  ).trim();
}

// Group info is cached for a minute so admin commands stay fast.
const metaCache = new Map();
async function groupMeta(sock, jid) {
  const hit = metaCache.get(jid);
  if (hit && Date.now() - hit.at < 60000) return hit.meta;
  const meta = await sock.groupMetadata(jid);
  metaCache.set(jid, { at: Date.now(), meta });
  return meta;
}

const sameUser = (p, ids) =>
  [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).some((x) => ids.includes(x));

async function handle(sock, msg) {
  if (!msg.message) return;
  const from = msg.key.remoteJid;
  if (!from || from === 'status@broadcast') return;

  const text = textOf(msg.message);
  if (!text.startsWith(config.prefix)) return;

  const [rawName, ...args] = text.slice(config.prefix.length).split(/\s+/);
  const cmd = commands.get((rawName || '').toLowerCase());
  if (!cmd) return;

  const started = Date.now();
  const isGroup = from.endsWith('@g.us');
  const sender = isGroup ? msg.key.participant : from;

  // WhatsApp may identify people by a hidden LID, so check every id we have.
  const senderIds = [sender, isGroup ? msg.key.participantAlt : msg.key.remoteJidAlt].filter(Boolean);
  const botIds = [sock.user && sock.user.id, sock.user && sock.user.lid].filter(Boolean);
  const ownerNumbers = new Set([...config.owners, ...botIds.map(toNumber)]);
  const isOwner = !!msg.key.fromMe || senderIds.some((j) => ownerNumbers.has(toNumber(j)));

  if (config.mode === 'private' && !isOwner) return;
  log.info(`[CMD] ${cmd.name} (owner=${isOwner}, group=${isGroup})`);

  const reply = async (raw) => {
    const content = { text: format(raw) };
    try {
      return await sock.sendMessage(from, content, { quoted: msg });
    } catch (e) {
      log.error('Reply with quote failed, retrying plain:', e.message);
      return sock.sendMessage(from, content);
    }
  };

  const ctx = {
    sock, msg, from, sender, isGroup, isOwner, args, reply, started,
    text: args.join(' '), prefix: config.prefix, config, commands: list,
    group: () => groupMeta(sock, from),
  };

  try {
    if (cmd.ownerOnly && !isOwner) return reply('This command is for the bot owner only.');
    if (cmd.groupOnly && !isGroup) return reply('This command only works in groups.');

    if (cmd.adminOnly) {
      const meta = await groupMeta(sock, from);
      const admins = meta.participants.filter((p) => p.admin);
      if (!isOwner && !admins.some((p) => sameUser(p, senderIds))) {
        return reply('Only group admins can use this command.');
      }
    }

    await cmd.run(ctx);
  } catch (err) {
    log.error(`Plugin "${cmd.name}" failed:`, err);
    reply('Something went wrong running that command.').catch(() => {});
  }
}

module.exports = { loadCommands, handle, textOf, bold };
