const fs = require('fs');
const axios = require("axios");
const Indexer = require('./indexer');

const COMMON_BASE = 'http://128.199.189.253:9610';

async function run() {
    const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=365`)).data;
    let tokens = fs.readdirSync('db/transfer');
    let c = 0;
    console.log(`Total token: ${tokens.length}`);
    for (let token of tokens) {
        if (token == '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82') continue;
        console.log(`Indexing token [${c++}] ${token}`);
        const indexer = new Indexer(token);
        await indexer.run(block);
    }
}

run();