require('dotenv').config();
const path = require('path');

const digits = (v) => String(v || '').replace(/\D/g, '');

module.exports = {
  botName: process.env.BOT_NAME || 'ADEZ XMD',
  devName: 'Arnold Adez',
  devNumber: '254111783552',
  prefix: process.env.PREFIX || '.',
  // "public" = everyone can use commands, "private" = owner only
  mode: (process.env.MODE || 'public').toLowerCase(),
  // Owner number(s): digits only with country code, comma separated
  owners: String(process.env.OWNER_NUMBER || '').split(',').map(digits).filter(Boolean),
  // First login only: your number, the bot prints a pairing code in the logs
  pairingNumber: digits(process.env.PAIRING_NUMBER),
  // MongoDB keeps the whole session safe across restarts and redeploys
  mongoUri: process.env.MONGODB_URI || '',
  sessionDir: process.env.SESSION_DIR || path.join(__dirname, 'session'),
  port: Number(process.env.PORT) || 3000,
  // Pinged every 4 minutes so free hosts do not put the bot to sleep
  keepAliveUrl: process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || '',
  autoRead: String(process.env.AUTO_READ || 'false') === 'true',
  footer: '> POWERED BY ADEZ TECH',
};
