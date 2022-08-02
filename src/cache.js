const axios = require("axios");
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 3 * 60 * 60, useClones: false });

const COMMON_BASE = 'http://10.148.0.39:9612';

const symbolCache = {};
const getSymbol = async (token) => {
    if (!symbolCache[token]) {
        const { symbol } = (await axios.get(`${COMMON_BASE}/info/token?a=${token}`)).data[0];
        symbolCache[token] = symbol;
    }
    return symbolCache[token];
};

const tokenCache = {};
const getToken = async (token) => {
    if (!tokenCache[token]) {
        tokenCache[token] = (await axios.get(`${COMMON_BASE}/info/token?a=${token}`)).data[0];
        tokenCache[token].decimals = parseInt(tokenCache[token].decimals);
    }
    return tokenCache[token];
};

const prefetchTokens = async (token) => axios.get(`${COMMON_BASE}/fetch/token?a=${token}`);

async function getCache(key, getFunc) {
    let data = cache.get(key);
    if (data == undefined) {
        data = await getFunc();
        cache.set(key, data);
    }
    return data;
}

module.exports = { getCache, getSymbol, getToken, prefetchTokens }