const Crawler = require("../utils/crawler");
const { web3, ContractAddress, isUSD, toBN } = require('../utils/bsc');
const { Partitioner, getLastLine, getLastFile } = require('../utils/io');
const readLastLines = require('read-last-lines');

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
                    const amountOut = swapOut[6] != "0" ? swapOut[6] : swapOut[7];

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

    async getLastTx(token, n) {
        const rs = [];
        if (token.length != 42) return rs;
        try {
            const lastFile = getLastFile(`${DATA_FOLDER}/${token}`);
            if (lastFile == '') return rs;
            const lastLines = await readLastLines.read(`${DATA_FOLDER}/${token}/${lastFile}`, n);
            lastLines.trim().split('\n').forEach(line => {
                const [block, , bs, , , amount0, , amountUSD, amountBNB] = line.split(',');
                rs.push({ block, bs, amount0, amountUSD, amountBNB });
            });
        } catch (err) { }
        return rs;
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
            } catch (err) { }
        }
        return rs;
    }

    async getBigTransaction(token0, checkpoints) {
        let cid = 0;
        const fromIdx = Math.floor(checkpoints[0] / 100000);
        const toIdx = Math.floor(checkpoints[checkpoints.length - 1] / 100000);
        const rs = [];
        let total = toBN(0);
        const lastPrice = {};
        for (let idx = fromIdx; idx <= toIdx; idx++) {
            try {
                await this.partitioner.loadLog(token0, idx, ([block, , , , othertoken, amount0, amount1]) => {
                    if (amount0 == '0' || amount1 == '0') return;
                    const price = parseInt(toBN(amount1).muln(100000).div(toBN(amount0)) / 100000);
                    if (lastPrice[othertoken] && Math.abs(lastPrice[othertoken] - price) > (lastPrice[othertoken] / 100)) {
                        total = total.add(toBN(amount0));
                    }
                    lastPrice[othertoken] = price;
                    if (block > checkpoints[cid]) {
                        rs.push([checkpoints[cid], total.toString(10)]);
                        total = toBN(0);
                        while (block > checkpoints[cid]) cid++;
                    }
                });
            } catch (err) { }
        }
        return rs;
    }

    calcPrice([reserve0, reserve1], decimals = 18) {
        if (reserve0 == "0") return 0;
        if (reserve1.length < 20) return 0;
        let dd = toBN(10).pow(toBN(18 - decimals));
        return parseInt(toBN(reserve1).muln(100000).div(toBN(reserve0)).div(dd)) / 100000;
    }

    async getTicker(token0, fromBlock, toBlock) {
        const fromIdx = Math.floor(fromBlock / 100000);
        const toIdx = Math.floor(toBlock / 100000);
        const rs = [];
        let lastBlock = fromBlock;
        let o, h, l, c, v = toBN(0);
        for (let idx = fromIdx; idx <= toIdx; idx++) {
            try {
                await this.partitioner.loadLog(token0, idx, ([block, , bs, , , amount0, , amountUSD, amountBNB]) => {
                    v = v.add(toBN(amount0));
                    const price = this.calcPrice([amount0, amountUSD]);
                    if (!o) o = price;
                    if (!h || price > h) h = price;
                    if (!l || price < l) l = price;
                    if (parseInt(block) > lastBlock + 20) {
                        rs.push({ o, h, l, c: price, v });
                        lastBlock = parseInt(block);
                        o = h = l = undefined;
                        v = toBN(0);
                    }
                });
            } catch (err) { }
        }
        return rs;
    }
}

module.exports = SwapModel;