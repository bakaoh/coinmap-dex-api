const fs = require('fs');
const LineByLine = require('line-by-line');
const { web3 } = require('../utils/bsc');
const { getLastLine } = require('../utils/io');

const PAIR_CREATED_TOPIC = '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9';
const BLOCK_FILE = 'logs/pair.block';
const PAIR_DETAIL_FILE = 'logs/pair.log';

const opts = { flags: "a" };
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

class PairModel {
    constructor() {
        this.writer = fs.createWriteStream(PAIR_DETAIL_FILE, opts);
        this.pools = {};
    }

    getPools(token) {
        return this.pools[token];
    }

    load() {
        const lr = new LineByLine(PAIR_DETAIL_FILE);
        lr.on('line', (line) => {
            const [block, txIdx, logIdx, factory, token0, token1, pair, idx] = line.split(',');
            addPool(block, txIdx, logIdx, factory, token0, token1, pair, idx);
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    async run() {
        const batchSize = 4500;
        const lastLine = await getLastLine(BLOCK_FILE);
        let fromBlock = lastLine ? parseInt(lastLine) + 1 : 0;
        const latest = await web3.eth.getBlockNumber();
        console.log(`SyncModel start running from block ${fromBlock}, latest ${latest}`);

        this.blockWriter = fs.createWriteStream(BLOCK_FILE, opts);
        while (fromBlock < latest) {
            try {
                fromBlock = await this.crawlPairCreatedLogs(fromBlock, fromBlock + batchSize - 1, 2000) + 1;
            } catch (err) { console.log(`Error ${fromBlock}:`, err); await sleep(2000); }
        }

        this.interval = setInterval(async () => {
            try {
                fromBlock = await this.crawlPairCreatedLogs(fromBlock) + 1;
            } catch (err) { console.log(`Error ${fromBlock}:`, err); }
        }, 3000)
    }

    addPool(block, txIdx, logIdx, factory, token0, token1, pair, idx) {
        if (!this.pools[token0]) this.pools[token0] = [];
        this.pools[token0].push({ token: token1, pair });
        if (!this.pools[token1]) this.pools[token1] = [];
        this.pools[token1].push({ token: token0, pair });
    }

    writePairCreatedLog(block, txIdx, logIdx, factory, token0, token1, pair, idx) {
        this.writer.write(`${block},${txIdx},${logIdx},${factory},${token0},${token1},${pair},${idx}\n`);
        this.addPool(block, txIdx, logIdx, factory, token0, token1, pair, idx);
    }

    async crawlPairCreatedLogs(fromBlock, toBlock = 'latest', sleepMs = 0) {
        const startMs = Date.now();
        const pastLogs = await web3.eth.getPastLogs({
            fromBlock,
            toBlock,
            topics: [PAIR_CREATED_TOPIC],
        })

        let lastBlock = 0;
        for (let log of pastLogs) {
            lastBlock = log.blockNumber;
            try {
                const values = web3.eth.abi.decodeParameters(['address', 'uint256'], log.data)
                const token0 = web3.eth.abi.decodeParameters(['address'], log.topics[1])
                const token1 = web3.eth.abi.decodeParameters(['address'], log.topics[2])
                this.writePairCreatedLog(log.blockNumber, log.transactionIndex, log.logIndex, log.address, token0[0], token1[0], values[0], values[1].toString(10));
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
        console.log(`Crawl pair logs [${fromBlock}-${toBlock}]: ${pastLogs.length} (${ms}ms)`)
        if (ms < sleepMs) await sleep(sleepMs - ms);
        if (lastBlock - this.lastCache > 10) {
            this.createCacheFile();
            this.lastCache = lastBlock;
        }
        return lastBlock;
    }
}

module.exports = PairModel;