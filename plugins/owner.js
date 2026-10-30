module.exports = {
  name: 'owner',
  desc: 'Show the bot owner',
  async run({ reply, config }) {
    if (!config.owners.length) return reply('No owner number is set.');
    await reply(config.owners.map((n) => `Owner: wa.me/${n}`).join('\n'));
  },
};
