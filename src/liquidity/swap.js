const Crawler = require("../utils/crawler");
const { web3, ContractAddress, isUSD, toBN } = require('../utils/bsc');
const { Partitioner } = require('../utils/io');

const SWAP_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const BLOCK_FILE = 'logs/cswap.block';
const DATA_FOLDER = 'db/cswap';

class SwapModel {
    constructor(pairModel) {
        this.pairModel = pairModel;
        this.partitioner = new Partitioner(DATA_FOLDER);
    }

    async runCrawler() {
        this.crawler = new Crawler("Swap", SWAP_TOPIC, BLOCK_FILE, undefined, 200, async (logs) => {
            const tx = {};
            for (let log of logs) {
                try {
                    const block = log.blockNumber;
                    const txIdx = log.transactionIndex;
                    const values = web3.eth.abi.decodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], log.data)
                    const from = web3.eth.abi.decodeParameters(['address'], log.topics[1])[0]
                    const to = web3.eth.abi.decodeParameters(['address'], log.topics[2])[0]
                    if (!tx[block]) tx[block] = {};
                    if (!tx[block][txIdx]) tx[block][txIdx] = [];
                    tx[block][txIdx].push([log.logIndex, log.address, from, to, values[0].toString(10), values[1].toString(10), values[2].toString(10), values[3].toString(10)]);
                } catch (err) { console.log(`Process log error`, log, err) }
            }

            for (let block in tx) {
                const idx = Math.floor(block / 100000);
                for (let txIdx in tx[block]) {
                    const swap = tx[block][txIdx];
                    const from = swap.sort((a, b) => b[0] - a[0])[0][3];

                    const swapIn = swap[swap.length - 1];
                    const pairIn = this.pairModel.getTokens(swapIn[1]);
                    if (!pairIn) continue;
                    const tokenIn = swapIn[4] != "0" ? pairIn.token0 : pairIn.token1;
                    const amountIn = swapIn[4] != "0" ? swapIn[4] : swapIn[5];

                    const swapOut = swap[0];
                    const pairOut = this.pairModel.getTokens(swapOut[1]);
                    if (!pairOut) continue;
                    const tokenOut = swapOut[6] != "0" ? pairOut.token0 : pairOut.token1;
                    const amountOut = swapIn[6] != "0" ? swapOut[6] : swapOut[7];

                    let usdAmount = '0';
                    let bnbAmount = '0';
                    for (let s of swap) {
                        const pair = this.pairModel.getTokens(s[1]);
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

                    this.partitioner.getWriter(tokenIn, idx).write(`${block},${txIdx},SELL,${from},${tokenOut},${amountIn},${amountOut},${usdAmount},${bnbAmount}\n`);
                    this.partitioner.getWriter(tokenOut, idx).write(`${block},${txIdx},BUY,${from},${tokenIn},${amountOut},${amountIn},${usdAmount},${bnbAmount}\n`);
                }
                tx[block] = null;
            }
        });
        await this.crawler.run();
    }

    async getVolumeHistory(token0, checkpoints) {
        let cid = 0;
        const fromIdx = Math.floor(checkpoints[0] / 100000);
        const toIdx = Math.floor(checkpoints[checkpoints.length - 1] / 100000);
        const rs = [];
        let totalTransaction = toBN(0);
        let totalAmountSell = toBN(0);
        let totalAmountBuyByNewWallet = toBN(0);
        for (let idx = fromIdx; idx <= toIdx; idx++) {
            try {
                await this.partitioner.loadLog(token0, idx, ([block, , bs, , , amount0]) => {
                    const amount0BN = toBN(amount0);
                    totalTransaction = totalTransaction.add(amount0BN);
                    if (bs == "SELL") totalAmountSell = totalAmountSell.add(amount0BN);
                    if (block > checkpoints[cid]) {
                        // TODO: totalAmountBuyByNewWallet
                        totalAmountBuyByNewWallet = totalTransaction.muln(16).divn(100);
                        rs.push([checkpoints[cid], totalTransaction.toString(10), totalAmountSell.toString(10), totalAmountBuyByNewWallet.toString(10)]);
                        totalTransaction = toBN(0);
                        totalAmountSell = toBN(0);
                        totalAmountBuyByNewWallet = toBN(0);
                        while (block > checkpoints[cid]) cid++;
                    }
                });
            } catch (err) { console.log(err) }
        }
        return rs;
    }
}

module.exports = SwapModel;