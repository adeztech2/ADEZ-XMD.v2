module.exports = {
  name: 'menu',
  aliases: ['help', 'commands'],
  desc: 'List all commands',
  async run({ reply, commands, prefix, config }) {
    const lines = commands.map((c) => `${prefix}${c.name} - ${c.desc || ''}`);
    await reply(
      [
        `${config.botName}`,
        `Developer: ${config.devName}`,
        `Prefix: ${prefix}`,
        `Mode: ${config.mode}`,
        `Plugins: ${commands.length}`,
        '',
        ...lines,
      ].join('\n')
    );
  },
};
