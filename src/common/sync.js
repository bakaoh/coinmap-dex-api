const fs = require('fs');
const LineByLine = require('line-by-line');
const Web3 = require("web3");
const { web3, ContractAddress, isUSD } = require('../utils/bsc');
const { getLastLine, getLastFile } = require('../utils/io');

const SYNC_TOPIC = '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1';
const BLOCK_FILE = 'logs/sync.block';
const CACHE_FILE = 'logs/sync.cache';

const opts = { flags: "a" };
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

class SyncModel {
    constructor(lp) {
        this.lp = lp;
        this.writer = {};
        this.liquidity = {};
        this.price = {};
        this.lastCache = 0;
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
                fromBlock = await this.crawlSyncLogs(fromBlock, fromBlock + batchSize - 1, 2000) + 1;
            } catch (err) { console.log(`Error ${fromBlock}:`, err); await sleep(2000); }
        }

        this.interval = setInterval(async () => {
            try {
                fromBlock = await this.crawlSyncLogs(fromBlock) + 1;
            } catch (err) { console.log(`Error ${fromBlock}:`, err); }
        }, 3000)
    }

    async warmup() {
        const startMs = Date.now();
        try {
            this.loadCacheFile();
            console.log(`SyncModel warmup done (${Date.now() - startMs}ms)`)
            return;
        } catch (err) { console.log(`SyncModel warmup using cache file error: ${err}`) }

        let files = fs.readdirSync("logs/sync");
        await this.loadLastSyncLog(ContractAddress.WBNB);
        for (let token of files) {
            if (token == ContractAddress.WBNB || token == ContractAddress.BUSD) continue;
            await this.loadLastSyncLog(token);
        }
        console.log(`SyncModel warmup done (${Date.now() - startMs}ms)`)
    }

    loadCacheFile() {
        const lr = new LineByLine(CACHE_FILE);
        lr.on('line', (line) => {
            const { token, othertoken, reserve0, reserve1 } = line.split(',');
            if (reserve0 == "0" || reserve1 == "0") return;
            if (!this.liquidity[token]) this.liquidity[token] = {};
            this.liquidity[token][othertoken] = [reserve0, reserve1];
            this.updatePrice(token, othertoken, reserve0, reserve1);
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    createCacheFile() {
        const startMs = Date.now();
        const tokens = Object.keys(this.liquidity);
        const writer = fs.createWriteStream(CACHE_FILE);
        tokens.forEach(token => {
            const others = Object.keys(this.liquidity[token]);
            others.forEach(othertoken => {
                const lp = this.liquidity[token][othertoken];
                writer.write(`${token},${othertoken},${lp[0]},${lp[1]}\n`);
            })
        })
        writer.end();
        console.log(`SyncModel create cache done (${Date.now() - startMs}ms)`)
    }

    async loadLastSyncLog(token) {
        if (token.length != 42) return;
        try {
            const lastFile = getLastFile(`logs/sync/${token}`);
            if (lastFile == '') return;
            this.liquidity[token] = {};
            await this.loadSyncLog(token, parseInt(lastFile), (block, othertoken, reserve0, reserve1) => {
                if (reserve0 == "0" || reserve1 == "0") return;
                this.liquidity[token][othertoken] = [reserve0, reserve1];
                this.updatePrice(token, othertoken, reserve0, reserve1);
            });
        } catch (err) { }
    }

    closeAll() {
        const keys = Object.keys(this.writer);
        keys.forEach(address => { this.writer[address].writer.end(); });
    }

    getWriter(token, idx) {
        if (!this.writer[token] || this.writer[token].idx != idx) {
            if (this.writer[token]) this.writer[token].writer.end();
            const dir = `logs/sync/${token}`;
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            this.writer[token] = {
                idx,
                writer: fs.createWriteStream(`${dir}/${idx}.log`, opts)
            }
        }
        return this.writer[token].writer;
    }

    getLiquidity(token) {
        return this.liquidity[token];
    }

    async getLiquidityHistory(token0, checkpoints) {
        let cid = 0;
        let liquidity = {};
        let price = Web3.utils.toBN(0);
        const fromIdx = Math.floor(checkpoints[0] / 100000);
        const toIdx = Math.floor(checkpoints[checkpoints.length - 1] / 100000);
        const rs = [];
        for (let idx = fromIdx; idx <= toIdx; idx++) {
            try {
                await this.loadSyncLog(token0, idx, (block, othertoken, reserve0, reserve1) => {
                    if (reserve0 == "0" || reserve1 == "0") return;
                    liquidity[othertoken] = [reserve0, reserve1];
                    if (isUSD(othertoken)) price = Web3.utils.toBN(reserve1).muln(100000).div(Web3.utils.toBN(reserve0))
                    if (block > checkpoints[cid]) {
                        let total = Web3.utils.toBN(0);
                        for (let token1 in liquidity) {
                            total = total.add(Web3.utils.toBN(liquidity[token1][0]))
                        }
                        rs.push([checkpoints[cid], total.toString(10), parseInt(price.toString(10)) / 100000, total.mul(price).divn(100000).toString(10)]);
                        while (block > checkpoints[cid]) cid++;
                    }
                });
            } catch (err) { console.log(err) }
        }
        return rs;
    }

    getPrice(token) {
        return this.price[token];
    }

    async getPriceHistory(token0, token1, checkpoints) {
        let cid = 0;
        const fromIdx = Math.floor(checkpoints[0] / 100000);
        const toIdx = Math.floor(checkpoints[checkpoints.length - 1] / 100000);
        const rs = [];
        for (let idx = fromIdx; idx <= toIdx; idx++) {
            try {
                await this.loadSyncLog(token0, idx, (block, othertoken, reserve0, reserve1) => {
                    if (token1 != othertoken) return;
                    if (reserve0 == "0" || reserve1 == "0") return;
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

    getPath(tokenA, tokenB) {
        const lpA = this.liquidity[tokenA];
        const lpB = this.liquidity[tokenB];
        if (!lpA || !lpB) return { path: [], aperb: '0', bpera: '0' };
        if (lpA[tokenB]) {
            const [reserve0, reserve1] = lpA[tokenB];
            // TODO: check min liquidity
            if (reserve0 != '0' && reserve1 != '0') {
                const aperb = parseInt(Web3.utils.toBN(reserve1).muln(100000).div(Web3.utils.toBN(reserve0)).toString(10)) / 100000
                const bpera = parseInt(Web3.utils.toBN(reserve0).muln(100000).div(Web3.utils.toBN(reserve1)).toString(10)) / 100000
                return { path: [tokenA, tokenB], aperb, bpera };
            }
        }
        for (let tokenC in lpA) {
            if (!lpB[tokenC]) continue;
            const [reserveAC, reserveCA] = lpA[tokenC];
            const [reserveBC, reserveCB] = lpB[tokenC];
            // TODO: check min liquidity
            if (reserveBC == '0' || reserveCB == '0' || reserveAC == '0' || reserveCA == '0') continue;
            const aperb = parseInt(Web3.utils.toBN(reserveCA).mul(Web3.utils.toBN(reserveBC)).muln(100000).div(Web3.utils.toBN(reserveAC)).div(Web3.utils.toBN(reserveCB)).toString(10)) / 100000
            const bpera = parseInt(Web3.utils.toBN(reserveAC).mul(Web3.utils.toBN(reserveCB)).muln(100000).div(Web3.utils.toBN(reserveCA)).div(Web3.utils.toBN(reserveBC)).toString(10)) / 100000
            return { path: [tokenA, tokenC, tokenB], aperb, bpera };
        }
        return { path: [], aperb: '0', bpera: '0' };
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
            const { token0, token1 } = await this.lp.getToken01(lpToken);
            const idx = Math.floor(block / 100000);
            this.getWriter(token0, idx).write(`${block},${token1},${reserve0},${reserve1}\n`);
            this.getWriter(token1, idx).write(`${block},${token0},${reserve1},${reserve0}\n`);
            if (reserve0 == "0" || reserve1 == "0") return;
            if (!this.liquidity[token0]) this.liquidity[token0] = {};
            this.liquidity[token0][token1] = [reserve0, reserve1];
            if (!this.liquidity[token1]) this.liquidity[token1] = {};
            this.liquidity[token1][token0] = [reserve1, reserve0];
            this.updatePrice(token0, token1, reserve0, reserve1);
            this.updatePrice(token1, token0, reserve1, reserve0);
        } catch (err) { console.log(`Error`, block, lpToken, reserve0, reserve1, err.toString()) }
    }

    async crawlSyncLogs(fromBlock, toBlock = 'latest', sleepMs = 0) {
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
        if (ms < sleepMs) await sleep(sleepMs - ms);
        if (this.lastCache - lastBlock > 10000) {
            this.createCacheFile();
            this.lastCache = lastBlock;
        }
        return lastBlock;
    }

    updatePrice(token, othertoken, reserve0, reserve1) {
        if (reserve0 == "0" || reserve1 == "0") return;
        if (isUSD(othertoken)) {
            const priceInUsd = Web3.utils.toBN(reserve1).muln(100000).div(Web3.utils.toBN(reserve0))
            this.price[token] = parseInt(priceInUsd.toString(10)) / 100000;
        } else if (othertoken == ContractAddress.WBNB) {
            const priceInBnB = Web3.utils.toBN(reserve1).muln(100000).div(Web3.utils.toBN(reserve0))
            this.price[token] = this.price[ContractAddress.WBNB] * parseInt(priceInBnB.toString(10)) / 100000
        }
    }
}

module.exports = SyncModel;