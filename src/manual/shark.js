const fs = require('fs');
const { Partitioner } = require('../utils/io');
const { ContractAddress, isUSD, toBN } = require('../utils/bsc');
const DATA_FOLDER = 'db/cswap';

const reader = new Partitioner(DATA_FOLDER);
const writer = new Partitioner(`db/shark`);

async function run(token) {
    const accTotal = {};
    const accToken = {};
    const accUsd = {};
    for (let idx = 0; idx <= 166; idx++) {
        try {
            await reader.loadLog(token, idx, ([block, txIdx, sb, from, otherToken, tokenAmount, otherTokenAmount, usdAmount, bnbAmount]) => {
                if (usdAmount == '0') return;
                if (!accTotal[from]) accTotal[from] = toBN(0);
                if (!accToken[from]) accToken[from] = toBN(0);
                if (!accUsd[from]) accUsd[from] = toBN(0);
                accTotal[from] = accTotal[from].add(toBN(tokenAmount));
                if (sb == "BUY") {
                    accToken[from] = accToken[from].add(toBN(tokenAmount));
                    accUsd[from] = accUsd[from].sub(toBN(usdAmount));
                } else if (sb == "SELL") {
                    accToken[from] = accToken[from].sub(toBN(tokenAmount));
                    accUsd[from] = accUsd[from].add(toBN(usdAmount));
                }
            });
        } catch (err) {
            if (!err.toString().includes('no such file')) {
                console.log(err)
            }
        }
    }
    const w = writer.getWriter(token, 166);
    for (let acc in accTotal) {
        w.write(`${acc},${accTotal[acc].toString(10)},${accToken[acc].toString(10)},${accUsd[acc].toString(10)}\n`)
    }
}

async function runAll() {
    const tokens = fs.readdirSync(DATA_FOLDER);
    console.log(`Total token: ${tokens.length}`);
    let c = 0;
    for (let token of tokens) {
        const startMs = Date.now();
        await run(token);
        console.log(`Shark move ${c++} [${token}] (${Date.now() - startMs}ms)`)
    }
    writer.closeAll();
}

runAll();