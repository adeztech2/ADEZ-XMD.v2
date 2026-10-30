module.exports = {
  name: 'ping',
  aliases: ['speed'],
  desc: 'Check how fast the bot answers',
  async run({ reply, started }) {
    await reply(`Pong! ${Date.now() - started}ms`);
  },
};
