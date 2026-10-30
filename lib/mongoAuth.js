const { BufferJSON, initAuthCreds, proto } = require('@whiskeysockets/baileys');

// Saves the whole WhatsApp session (login + every encryption key) in MongoDB.
// A restart or redeploy then never loses it, which avoids "Bad MAC" and
// "Waiting for this message" problems.

let client = null;
let col = null;

async function getCollection(uri, dbName) {
  if (col) return col;
  const { MongoClient } = require('mongodb');
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  col = client.db(dbName).collection('auth');
  return col;
}

const enc = (v) => JSON.stringify(v, BufferJSON.replacer);
const dec = (s) => JSON.parse(s, BufferJSON.reviver);

// seed = { creds, hash } from SESSION_ID. It is imported when the database is empty,
// or when SESSION_ID was replaced with a new one (a different hash).
async function useMongoAuthState(uri, { dbName = 'adezxmd', seed = null } = {}) {
  const c = await getCollection(uri, dbName);

  const read = async (id) => {
    const doc = await c.findOne({ _id: id });
    return doc ? dec(doc.v) : null;
  };

  let creds = await read('creds');
  const storedSeed = await c.findOne({ _id: '_seed' });

  if (seed && (!creds || !storedSeed || storedSeed.hash !== seed.hash)) {
    // New or changed SESSION_ID: start clean from it.
    await c.deleteMany({});
    creds = seed.creds;
    await c.replaceOne({ _id: 'creds' }, { _id: 'creds', v: enc(creds) }, { upsert: true });
    await c.replaceOne({ _id: '_seed' }, { _id: '_seed', hash: seed.hash }, { upsert: true });
  } else if (!creds) {
    creds = initAuthCreds();
    await c.replaceOne({ _id: 'creds' }, { _id: 'creds', v: enc(creds) }, { upsert: true });
  }

  const keys = {
    get: async (type, ids) => {
      const out = {};
      await Promise.all(
        ids.map(async (id) => {
          let v = await read(`${type}-${id}`);
          if (type === 'app-state-sync-key' && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
          out[id] = v;
        })
      );
      return out;
    },
    set: async (data) => {
      const ops = [];
      for (const type of Object.keys(data)) {
        for (const id of Object.keys(data[type])) {
          const val = data[type][id];
          const _id = `${type}-${id}`;
          ops.push(
            val
              ? { replaceOne: { filter: { _id }, replacement: { _id, v: enc(val) }, upsert: true } }
              : { deleteOne: { filter: { _id } } }
          );
        }
      }
      if (ops.length) await c.bulkWrite(ops, { ordered: false });
    },
  };

  return {
    state: { creds, keys },
    saveCreds: () => c.replaceOne({ _id: 'creds' }, { _id: 'creds', v: enc(creds) }, { upsert: true }),
    clear: () => c.deleteMany({}),
  };
}

module.exports = { useMongoAuthState };
