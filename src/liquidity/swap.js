const Crawler = require("../utils/crawler");
const { web3, ContractAddress, isUSD, toBN } = require('../utils/bsc');
const { Partitioner, getLastFiles } = require('../utils/io');
const { prefetchTokens } = require("../cache");
const readLastLines = require('read-last-lines');

const SWAP_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const BLOCK_FILE = 'logs/cswap.block';
const DATA_FOLDER = 'db/cswap';

class SwapModel {
    constructor(pairModel) {
        this.pairModel = pairModel;
        this.partitioner = new Partitioner(DATA_FOLDER);
        this.buyHolder = {};
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

            const tokenAddresses = new Set();
            for (let block in tx) {
                const idx = Math.floor(block / Partitioner.BPF);
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
                    tokenAddresses.add(tokenIn);
                    tokenAddresses.add(tokenOut);
                    const firstPool = this.pairModel.firstPool[tokenOut];
                    if (block - firstPool < 28800) { // pool < 24h
                        if (!this.buyHolder[tokenOut]) this.buyHolder[tokenOut] = new Set();
                        this.buyHolder[tokenOut].add(from)
                    } else {
                        delete this.buyHolder[tokenOut];
                    }
                }
                tx[block] = null;
            }
            await prefetchTokens(Array.from(tokenAddresses).join()).catch(console.log);
        });
        this.crawler.setWeb3('https://rpc.ankr.com/bsc');
        await this.crawler.run();
    }

    getBuyHolder(token) {
        return this.buyHolder[token] ? this.buyHolder[token].size : 0;
    }

    async getLastTx(token, n) {
        const rs = [];
        if (token.length != 42) return rs;
        try {
            const lastFiles = getLastFiles(`${DATA_FOLDER}/${token}`);
            if (lastFiles.length == 0) return rs;
            let idx = 0;
            while (rs.length < n && idx < 10) {
                const lastLines = await readLastLines.read(`${DATA_FOLDER}/${token}/${lastFiles[idx]}`, n - rs.length);
                lastLines.trim().split('\n').forEach(line => {
                    const [block, , bs, from, , amount0, , amountUSD, amountBNB] = line.split(',');
                    rs.push({ block, bs, from, amount0, amountUSD, amountBNB });
                });
                idx++;
            }
        } catch (err) { }
        return rs;
    }

    async getVolumeHistory(token0, checkpoints) {
        let cid = 0;
        const fromIdx = Math.floor(checkpoints[0] / Partitioner.BPF);
        const toIdx = Math.floor(checkpoints[checkpoints.length - 1] / Partitioner.BPF);
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
        const fromIdx = Math.floor(checkpoints[0] / Partitioner.BPF);
        const toIdx = Math.floor(checkpoints[checkpoints.length - 1] / Partitioner.BPF);
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
}

module.exports = SwapModel;