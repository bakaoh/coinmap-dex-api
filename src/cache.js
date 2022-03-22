const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 3 * 60 * 60, useClones: false });

async function getCache(key, getFunc) {
    let data = cache.get(key);
    if (data == undefined) {
        data = await getFunc();
        cache.set(key, data);
    }
    return data;
}

module.exports = { getCache }