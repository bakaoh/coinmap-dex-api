const axios = require("axios");
const Indexer = require('./indexer');
const TokenModel = require('../common/token');

const COMMON_BASE = 'http://10.148.0.33:9612';

const IGNORE = [
    '0xD35f9AB96d04aDB02Fd549Ef6a576Ce4E2C1d935',
    '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    '0xD22202d23fE7dE9E3DbE11a2a88F42f4CB9507cf',
    '0x8bD0e87273364eBBE3482efc166F7e0D34D82C25',
    '0x2ba6204c23fbd5698ED90ABC911de263E5f41266',
];

async function run() {
    const tokenModel = new TokenModel(true);
    await tokenModel.loadLpDetailFile();
    await tokenModel.loadTokenDetailFile();

    const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=30`)).data;

    let c = 0;
    {
        const token = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';
        const startMs = Date.now();
        console.log(`Indexing token [${++c}] ${token}`);
        const indexer = new Indexer(token);
        await indexer.run(block);
        console.log(`Indexed token [${c}] ${token} (${Date.now() - startMs}ms)`)
    }
    console.log(`Total token: ${Object.keys(tokenModel.token).length}`);
    for (let token in tokenModel.token) {
        if (IGNORE.includes(token)) continue;
        if (tokenModel.lp[token]) continue;
        const startMs = Date.now();
        console.log(`Indexing token [${++c}] ${token}`);
        const indexer = new Indexer(token);
        await indexer.run(block);
        console.log(`Indexed token [${c}] ${token} (${Date.now() - startMs}ms)`)
    }
}

run();