const fs = require('fs');
const PairModel = require("../liquidity/pair");
const { Partitioner } = require('../utils/io');
const { ContractAddress, isUSD } = require('../utils/bsc');
const OLD_DATA_FOLDER = 'db/lpswap';
const NEW_DATA_FOLDER = 'db/cswap';

const reader = new Partitioner(OLD_DATA_FOLDER);
const writer = new Partitioner(NEW_DATA_FOLDER);
const pairModel = new PairModel();

async function run() {
    await pairModel.warmup();

    const tokens = fs.readdirSync(OLD_DATA_FOLDER);
    console.log(`Total LP token: ${tokens.length}`);

    for (let idx = 3; idx < 166; idx++) {
        const startMs = Date.now();
        const tx = {};
        let c = 0;
        let l = 0;
        for (let pair of tokens) {
            if (++c % 10000 == 0) console.log(`Process [${idx}] ${c}/${tokens.length}`)
            try {
                await reader.loadLog(pair, idx, ([block, txIdx, logIdx, from, to, in0, in1, out0, out1]) => {
                    l++;
                    if (!tx[block]) tx[block] = {};
                    if (!tx[block][txIdx]) tx[block][txIdx] = [];
                    tx[block][txIdx].push([logIdx, pair, from, to, in0, in1, out0, out1]);
                });
            } catch (err) {
                if (!err.toString().includes('no such file')) {
                    console.log(err)
                }
            }
        }
        console.log(`Scan ${l} lines logs [${idx}] (${Date.now() - startMs}ms)`)
        let t = 0;
        for (let block in tx) {
            for (let txIdx in tx[block]) {
                const swap = tx[block][txIdx];
                const from = swap.sort((a, b) => b[0] - a[0])[0][3];

                const swapIn = swap[swap.length - 1];
                const pairIn = pairModel.getTokens(swapIn[1]);
                if (!pairIn) continue;
                const tokenIn = swapIn[4] != "0" ? pairIn.token0 : pairIn.token1;
                const amountIn = swapIn[4] != "0" ? swapIn[4] : swapIn[5];

                const swapOut = swap[0];
                const pairOut = pairModel.getTokens(swapOut[1]);
                if (!pairOut) continue;
                const tokenOut = swapOut[6] != "0" ? pairOut.token0 : pairOut.token1;
                const amountOut = swapIn[6] != "0" ? swapOut[6] : swapOut[7];

                let usdAmount = '0';
                let bnbAmount = '0';
                for (let s of swap) {
                    const pair = pairModel.getTokens(s[1]);
                    if (!pair) continue;
                    if (isUSD(pair.token0)) {
                        usdAmount = s[4] != "0" ? s[4] : s[6];
                    } else if (isUSD(pair.token1)) {
                        usdAmount = s[5] != "0" ? s[5] : s[7];
                    } else if (pair.token0 == ContractAddress.WBNB) {
                        bnbAmount = s[4] != "0" ? s[4] : s[6];
                    } else if (pair.token1 == ContractAddress.WBNB) {
                        bnbAmount = s[5] != "0" ? s[5] : s[7];
                    }
                }

                t++;
                writer.getWriter(tokenIn, idx).write(`${block},${txIdx},SELL,${from},${tokenOut},${amountIn},${amountOut},${usdAmount},${bnbAmount}\n`);
                writer.getWriter(tokenOut, idx).write(`${block},${txIdx},BUY,${from},${tokenIn},${amountOut},${amountIn},${usdAmount},${bnbAmount}\n`);
            }
        }
        console.log(`Combine ${t} tx logs [${idx}] (${Date.now() - startMs}ms)`)
    }
}

run();