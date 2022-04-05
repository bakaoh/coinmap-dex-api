const fs = require('fs');
const PairModel = require("../liquidity/pair");
const { Partitioner } = require('../utils/io');
const OLD_DATA_FOLDER = 'db/lpswap';
const NEW_DATA_FOLDER = 'db/cswap';

const reader = new Partitioner(OLD_DATA_FOLDER);
const writer = new Partitioner(NEW_DATA_FOLDER);
const pairModel = new PairModel();

async function run() {
    await pairModel.warmup();

    const tokens = fs.readdirSync(OLD_DATA_FOLDER);
    console.log(`Total LP token: ${tokens.length}`);

    let tx = {};
    for (let idx = 0; idx < 166; idx++) {
        const startMs = Date.now();
        for (let token of tokens) {
            await reader.loadLog(token, idx, ([block, txIdx, logIdx, pair, from, to, in0, in1, out0, out1]) => {
                if (!tx[block]) tx[block] = {};
                if (!tx[block][txIdx]) tx[block][txIdx] = [];
                tx[block][txIdx].push([logIdx, pair, from, to, in0, in1, out0, out1]);
            });
        }
        console.log(`Scan logs [${idx}] (${Date.now() - startMs}ms)`)
        for (let block in tx) {
            for (let txIdx in tx[block]) {
                const swap = tx[block][txIdx];
                const from = swap.sort((a, b) => b[0] - a[0])[0][3];

                const swapIn = swap[swap.length - 1];
                const pairIn = pairModel.getTokens(swapIn[1]);
                const tokenIn = swapIn[4] != "0" ? pairIn.token0 : pairIn.token1;
                const amountIn = swapIn[4] != "0" ? swapIn[4] : swapIn[5];

                const swapOut = swap[0];
                const pairOut = pairModel.getTokens(swapOut[1]);
                const tokenOut = swapOut[6] != "0" ? pairOut.token0 : pairOut.token1;
                const amountOut = swapIn[6] != "0" ? swapOut[6] : swapOut[7];

                writer.getWriter(tokenIn, idx).write(`${block},${txIdx},SELL,${from},${tokenOut},${amountIn},${amountOut}\n`);
                writer.getWriter(tokenOut, idx).write(`${block},${txIdx},BUY,${from},${tokenIn},${amountOut},${amountIn}\n`);
            }
        }

        console.log(`Combine logs [${idx}] (${Date.now() - startMs}ms)`)
        tx = {};
    }
}

run();