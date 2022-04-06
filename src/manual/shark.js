const fs = require('fs');
const { Partitioner } = require('../utils/io');
const { ContractAddress, isUSD, toBN } = require('../utils/bsc');
const DATA_FOLDER = 'db/cswap';

const reader = new Partitioner(DATA_FOLDER);
const writer = new Partitioner(`db/shark`);

const token = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';

async function run() {
    const accTotal = {};
    const accToken = {};
    const accUsd = {};
    for (let idx = 0; idx <= 166; idx++) {
        const startMs = Date.now();
        try {
            await reader.loadLog(token, idx, ([block, txIdx, sb, from, otherToken, tokenAmount, otherTokenAmount, usdAmount, bnbAmount]) => {
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

        console.log(`Shark move [${idx}] (${Date.now() - startMs}ms)`)
    }
    const w = writer.getWriter(token, 166);
    for (let acc in accTotal) {
        w.write(`${acc},${accTotal[acc].toString(10)},${accToken[acc].toString(10)},${accUsd[acc].toString(10)}`)
    }
    writer.closeAll();
}

run();