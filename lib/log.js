const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const out = (level, args) => console.log(`[${stamp()}] [${level}]`, ...args);

module.exports = {
  log: {
    info: (...a) => out('INFO', a),
    warn: (...a) => out('WARN', a),
    error: (...a) => out('ERROR', a),
  },
};
