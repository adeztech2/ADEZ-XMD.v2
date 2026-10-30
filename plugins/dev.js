module.exports = {
  name: 'dev',
  aliases: ['developer', 'creator'],
  desc: 'Show the developer',
  async run({ reply, config }) {
    await reply(
      [
        `${config.botName}`,
        `Developer: ${config.devName}`,
        `Contact: wa.me/${config.devNumber}`,
        `Number: +${config.devNumber}`,
      ].join('\n')
    );
  },
};
