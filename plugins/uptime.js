module.exports = {
  name: 'uptime',
  desc: 'How long the bot has been running',
  async run({ reply }) {
    const s = Math.floor(process.uptime());
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    await reply(`Uptime: ${d}d ${h}h ${m}m ${s % 60}s`);
  },
};
