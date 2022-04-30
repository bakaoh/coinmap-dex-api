const fs = require('fs');
const { toBN } = require('../utils/bsc');
const SyncModel = require("../liquidity/sync");
const PairModel = require("../liquidity/pair");
const { getNumber } = require('../utils/format');

const pairModel = new PairModel();
const syncModel = new SyncModel();
const writer = fs.createWriteStream(`db/pools.total`, { flags: "a" })

async function runAll() {
    const tokens = fs.readdirSync('db/cswap');
    console.log(`Total token: ${tokens.length}`);
    let c = 0;
    await pairModel.warmup();
    for (let token of tokens) {
        const startMs = Date.now();
        const { tokenPrice, pools } = (await syncModel.getPools(token, pairModel.getPools(token)));
        let totalToken = toBN(0);
        for (let pool of pools) {
            totalToken = totalToken.add(toBN(pool.token0 == token ? pool.reserve0 : pool.reserve1));
        }
        const totalAmount = getNumber(totalToken.toString(10)) * tokenPrice;
        writer.write(`${token},${totalAmount}\n`);
        console.log(`Top pools ${c++} [${token}] (${Date.now() - startMs}ms)`)
    }
}

runAll();