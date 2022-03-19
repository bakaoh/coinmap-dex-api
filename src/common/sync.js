const fs = require('fs');
const LineByLine = require('line-by-line');
const Web3 = require("web3");
const { web3, ContractAddress } = require('../utils/bsc');
const { getLastLine } = require('../utils/io');

const SYNC_TOPIC = '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1';
const BLOCK_FILE = 'logs/sync.block';

const opts = { flags: "a" };
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

class SyncModel {
    constructor(lp) {
        this.lp = lp;
        this.file = {};
    }

    async run() {
        const batchSize = 200;
        const lastLine = await getLastLine(BLOCK_FILE);
        let fromBlock = lastLine ? parseInt(lastLine) + 1 : 0;
        const latest = await web3.eth.getBlockNumber();
        console.log(`SyncModel start running from block ${fromBlock}, latest ${latest}`);

        this.blockWriter = fs.createWriteStream(BLOCK_FILE, opts);
        while (fromBlock < latest) {
            try {
                fromBlock = await this.crawlSyncLogs(fromBlock, fromBlock + batchSize - 1) + 1;
            } catch (err) { console.log(`Error ${fromBlock}:`, err); await sleep(2000); }
        }

        this.interval = setInterval(async () => {
            try {
                fromBlock = await this.crawlSyncLogs(fromBlock) + 1;
            } catch (err) { console.log(`Error ${fromBlock}:`, err); }
        }, 3000)
    }

    closeAll() {
        const keys = Object.keys(this.file);
        keys.forEach(address => { this.file[address].writer.end(); });
    }

    getWriter(token, idx) {
        if (!this.file[token] || this.file[token].idx != idx) {
            if (this.file[token]) this.file[token].writer.end();
            const dir = `logs/sync/${token}`;
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            this.file[token] = {
                idx,
                writer: fs.createWriteStream(`${dir}/${idx}.log`, opts)
            }
        }
        return this.file[token].writer;
    }

    async getLiquidity(token0, checkpoints, details = false) {
        let cid = 0;
        let liquidity = {};
        let price = Web3.utils.toBN(0);
        const fromIdx = Math.floor(checkpoints[0] / 100000);
        const toIdx = Math.ceil(checkpoints[checkpoints.length - 1] / 100000);
        const rs = [];
        for (let idx = fromIdx; idx <= toIdx; idx++) {
            try {
                await this.loadSyncLog(token0, idx, (block, othertoken, reserve0, reserve1) => {
                    liquidity[othertoken] = [reserve0, reserve1];
                    if (othertoken == ContractAddress.BUSD) price = Web3.utils.toBN(reserve1).muln(100000).div(Web3.utils.toBN(reserve0))
                    if (block > checkpoints[cid]) {
                        let total = Web3.utils.toBN(0);
                        for (let token1 in liquidity) {
                            total = total.add(Web3.utils.toBN(liquidity[token1][0]))
                        }
                        rs.push([checkpoints[cid], total.toString(10), total.mul(price).divn(100000).toString(10), details ? JSON.parse(JSON.stringify(liquidity)) : {}]);
                        while (block > checkpoints[cid]) cid++;
                    }
                });
            } catch (err) { console.log(err) }
        }
        return rs;
    }

    async getPrices(token0, token1, checkpoints) {
        let cid = 0;
        const fromIdx = Math.floor(checkpoints[0] / 100000);
        const toIdx = Math.ceil(checkpoints[checkpoints.length - 1] / 100000);
        const rs = [];
        for (let idx = fromIdx; idx <= toIdx; idx++) {
            try {
                await this.loadSyncLog(token0, idx, (block, othertoken, reserve0, reserve1) => {
                    if (token1 != othertoken) return;
                    if (block > checkpoints[cid]) {
                        const price = Web3.utils.toBN(reserve1).muln(100000).div(Web3.utils.toBN(reserve0))
                        rs.push([checkpoints[cid], parseInt(price.toString(10)) / 100000]);
                        while (block > checkpoints[cid]) cid++;
                    }
                });
            } catch (err) { console.log(err) }
        }
        return rs;
    }

    loadSyncLog(token, idx, cb) {
        const lr = new LineByLine(`logs/sync/${token}/${idx}.log`);
        lr.on('line', (line) => {
            const p = line.split(',');
            if (p.length != 4) return;
            cb(p[0], p[1], p[2], p[3]);
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    async writeSyncLog(block, lpToken, reserve0, reserve1) {
        try {
            const token01 = await this.lp.getToken01(lpToken);
            const idx = Math.floor(block / 100000);
            this.getWriter(token01[1], idx).write(`${block},${token01[2]},${reserve0},${reserve1}\n`);
            this.getWriter(token01[2], idx).write(`${block},${token01[1]},${reserve1},${reserve0}\n`);
        } catch (err) { console.log(`Error`, block, lpToken, reserve0, reserve1, err.toString()) }
    }

    async crawlSyncLogs(fromBlock, toBlock = 'latest') {
        const startMs = Date.now();
        const pastLogs = await web3.eth.getPastLogs({
            fromBlock,
            toBlock,
            topics: [SYNC_TOPIC],
        })

        let lastBlock = 0;
        for (let log of pastLogs) {
            lastBlock = log.blockNumber;
            try {
                const values = web3.eth.abi.decodeParameters(['uint256', 'uint256'], log.data)
                this.writeSyncLog(log.blockNumber, log.address, values[0].toString(10), values[1].toString(10));
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
        console.log(`Crawl sync logs [${fromBlock}-${toBlock}]: ${pastLogs.length} (${ms}ms)`)
        if (ms < 2000) await sleep(2000 - ms);

        return lastBlock;
    }
}

module.exports = SyncModel;