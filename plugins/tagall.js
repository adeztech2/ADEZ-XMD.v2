module.exports = {
  name: 'tagall',
  desc: 'Mention everyone in the group',
  groupOnly: true,
  adminOnly: true,
  async run({ sock, from, msg, text, group }) {
    const meta = await group();
    const ids = meta.participants.map((p) => p.id);
    const lines = ids.map((id) => `@${id.split('@')[0]}`).join('\n');
    await sock.sendMessage(
      from,
      { text: `${text ? text + '\n\n' : ''}${lines}`, mentions: ids },
      { quoted: msg }
    );
  },
};
