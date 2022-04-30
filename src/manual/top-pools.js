const fs = require('fs');
const { Partitioner } = require('../utils/io');
const { ContractAddress, isUSD, toBN } = require('../utils/bsc');
const SyncModel = require("../liquidity/sync");
const PairModel = require("../liquidity/pair");

const pairModel = new PairModel();
const syncModel = new SyncModel();

async function runAll() {
    const tokens = fs.readdirSync('db/cswap');
    console.log(`Total token: ${tokens.length}`);
    let c = 0;
    await pairModel.warmup();
    for (let token of tokens) {
        const startMs = Date.now();
        const { tokenPrice, pools } = (await syncModel.getPools(token, pairModel.getPools(token)));
        console.log(tokenPrice, pools);
        console.log(`Top pools ${c++} [${token}] (${Date.now() - startMs}ms)`)
    }
}

runAll();