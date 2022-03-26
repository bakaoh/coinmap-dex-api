const fs = require('fs');
const LineByLine = require('line-by-line');
const readLastLines = require('read-last-lines');

const { web3, ContractAddress, toBN } = require('../utils/bsc');
const { getLastLine, getLastFile } = require('../utils/io');

const SWAP_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const BLOCK_FILE = 'logs/swap.block';

const opts = { flags: "a" };
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

class SwapModel {
    constructor(lp) {
        this.lp = lp;
        this.writer = {};
    }

    async run() {
        const batchSize = 200;
        const lastLine = await getLastLine(BLOCK_FILE);
        let fromBlock = lastLine ? parseInt(lastLine) + 1 : 0;
        const latest = await web3.eth.getBlockNumber();
        console.log(`SwapModel start running from block ${fromBlock}, latest ${latest}`);

        this.blockWriter = fs.createWriteStream(BLOCK_FILE, opts);
        while (fromBlock < latest) {
            try {
                fromBlock = await this.crawlSwapLogs(fromBlock, fromBlock + batchSize - 1) + 1;
            } catch (err) { console.log(`Error ${fromBlock}:`, err); await sleep(2000); }
        }

        this.interval = setInterval(async () => {
            try {
                fromBlock = await this.crawlSwapLogs(fromBlock) + 1;
            } catch (err) { console.log(`Error ${fromBlock}:`, err); }
        }, 3000)
    }

    closeAll() {
        const keys = Object.keys(this.writer);
        keys.forEach(address => { this.writer[address].writer.end(); });
    }

    getWriter(token, idx) {
        if (!this.writer[token] || this.writer[token].idx != idx) {
            if (this.writer[token]) this.writer[token].writer.end();
            const dir = `logs/lpswap/${token}`;
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            this.writer[token] = {
                idx,
                writer: fs.createWriteStream(`${dir}/${idx}.log`, opts)
            }
        }
        return this.writer[token].writer;
    }

    async getLastTx(token, n) {
        // const rs = [];
        // if (token.length != 42) return rs;
        // try {
        //     const lastFile = getLastFile(`logs/swap/${token}`);
        //     if (lastFile == '') return rs;
        //     const lastLines = await readLastLines.read(`logs/swap/${token}/${lastFile}`, n);
        //     lastLines.trim().split('\n').forEach(line => {
        //         const [block, bs, othertoken, from, to, amount0, amount1] = line.split(',');
        //         rs.push({ block, bs, othertoken, from, to, amount0, amount1 });
        //     });
        // } catch (err) { }
        // return rs;
    }

    async getVolumeHistory(token0, checkpoints) {
        // let cid = 0;
        // const fromIdx = Math.floor(checkpoints[0] / 100000);
        // const toIdx = Math.floor(checkpoints[checkpoints.length - 1] / 100000);
        // const rs = [];
        // let totalTransaction = toBN(0);
        // let totalAmountSell = toBN(0);
        // let totalAmountBuyByNewWallet = toBN(0);
        // for (let idx = fromIdx; idx <= toIdx; idx++) {
        //     try {
        //         await this.loadSwapLog(token0, idx, (block, bs, othertoken, from, to, amount0, amount1) => {
        //             const amount0BN = toBN(amount0);
        //             totalTransaction = totalTransaction.add(amount0BN);
        //             if (bs == "SELL") totalAmountSell = totalAmountSell.add(amount0BN);
        //             if (block > checkpoints[cid]) {
        //                 // TODO: totalAmountBuyByNewWallet
        //                 totalAmountBuyByNewWallet = totalTransaction.muln(Math.round(Math.random() * 30)).divn(100);
        //                 rs.push([checkpoints[cid], totalTransaction.toString(10), totalAmountSell.toString(10), totalAmountBuyByNewWallet.toString(10)]);
        //                 totalTransaction = toBN(0);
        //                 totalAmountSell = toBN(0);
        //                 totalAmountBuyByNewWallet = toBN(0);
        //                 while (block > checkpoints[cid]) cid++;
        //             }
        //         });
        //     } catch (err) { console.log(err) }
        // }
        // return rs;
    }

    async getSharkHistory(token0, checkpoints) {
        // let cid = 0;
        // const fromIdx = Math.floor(checkpoints[0] / 100000);
        // const toIdx = Math.floor(checkpoints[checkpoints.length - 1] / 100000);
        // const rs = [];
        // let totalBalance = toBN(0);
        // let totalTransaction = toBN(0);
        // let totalTransactionHighValue = toBN(0);
        // const lastPrice = {};
        // for (let idx = fromIdx; idx <= toIdx; idx++) {
        //     try {
        //         await this.loadSwapLog(token0, idx, (block, bs, othertoken, from, to, amount0, amount1) => {
        //             if (amount0 == '0' || amount1 == '0') return;
        //             const price = parseInt(toBN(amount1).muln(100000).div(toBN(amount0)) / 100000);
        //             if (lastPrice[othertoken] && Math.abs(lastPrice[othertoken] - price) > (lastPrice[othertoken] / 100)) {
        //                 totalTransactionHighValue = totalTransactionHighValue.add(toBN(amount0));
        //             }
        //             lastPrice[othertoken] = price;
        //             if (block > checkpoints[cid]) {
        //                 rs.push([checkpoints[cid], totalBalance.toString(10), totalTransaction.toString(10), totalTransactionHighValue.toString(10)]);
        //                 totalBalance = toBN(0);
        //                 totalTransaction = toBN(0);
        //                 totalTransactionHighValue = toBN(0);
        //                 while (block > checkpoints[cid]) cid++;
        //             }
        //         });
        //     } catch (err) { console.log(err) }
        // }
        // return rs;
    }

    loadSwapLog(token, idx, cb) {
        // const lr = new LineByLine(`logs/swap/${token}/${idx}.log`);
        // lr.on('line', (line) => {
        //     const p = line.split(',');
        //     if (p.length != 7) return;
        //     cb(p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
        // });
        // return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    async writeSwapLog(block, txIdx, logIdx, lpToken, from, to, in0, in1, out0, out1) {
        try {
            const idx = Math.floor(block / 100000);
            if (from == ContractAddress.PANCAKE_ROUTER) from = "ROUTER";
            if (to == ContractAddress.PANCAKE_ROUTER) to = "ROUTER";
            this.getWriter(lpToken, idx).write(`${block},${txIdx},${logIdx},${from},${to},${in0},${in1},${out0},${out1}\n`);
        } catch (err) { console.log(`Error`, block, txIdx, logIdx, lpToken, from, to, in0, in1, out0, out1, err.toString()) }
    }

    async crawlSwapLogs(fromBlock, toBlock = 'latest') {
        const startMs = Date.now();
        const pastLogs = await web3.eth.getPastLogs({
            fromBlock,
            toBlock,
            topics: [SWAP_TOPIC],
        })

        let lastBlock = 0;
        for (let log of pastLogs) {
            lastBlock = log.blockNumber;
            try {
                const values = web3.eth.abi.decodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], log.data)
                const from = web3.eth.abi.decodeParameters(['address'], log.topics[1])
                const to = web3.eth.abi.decodeParameters(['address'], log.topics[2])
                await this.writeSwapLog(log.blockNumber, log.transactionIndex, log.logIndex, log.address, from[0], to[0], values[0].toString(10), values[1].toString(10), values[2].toString(10), values[3].toString(10));
            } catch (err) { console.log(`Write log error`, log, err) }
        }

        if (lastBlock != 0) {
            this.blockWriter.write(`${lastBlock}\n`);
        } else if (toBlock != 'latest') {
            lastBlock = toBlock;
        } else {
            lastBlock = fromBlock - 1;
        }

        const ms = Date.now() - startMs;
        console.log(`Crawl swap logs [${fromBlock}-${toBlock}]: ${pastLogs.length} (${ms}ms)`)
        if (ms < 2000) await sleep(2000 - ms);

        return lastBlock;
    }
}

module.exports = SwapModel;