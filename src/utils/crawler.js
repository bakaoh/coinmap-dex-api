const fs = require('fs');
const Web3 = require("web3");
const { web3 } = require('./bsc');
const { getLastLine } = require('./io');

const opts = { flags: "a" };
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

class Crawler {
    constructor(name, topic, blockFile, onLog, batchSize = 50, onLogs = undefined) {
        this.name = name;
        this.topic = topic;
        this.blockFile = blockFile;
        this.onLog = onLog;
        this.onLogs = onLogs;
        this.batchSize = batchSize;
        this.web3 = web3;
    }

    setWeb3(url) {
        this.web3 = new Web3(url);
    }

    async getReserves(pair) {
        if (!this.reserves[pair]) {
            this.reserves[pair] = getReserveFromLogs(pair);
        }
        return this.reserves[pair];
    }

    async run() {
        const batchSize = this.batchSize;
        const lastLine = await getLastLine(this.blockFile);
        let fromBlock = lastLine ? parseInt(lastLine) + 1 : 0;
        const latest = await this.web3.eth.getBlockNumber();
        console.log(`${this.name} start running from block ${fromBlock}, latest ${latest}`);

        this.blockWriter = fs.createWriteStream(this.blockFile, opts);
        while (fromBlock < latest) {
            try {
                fromBlock = await this.crawlLogs(fromBlock, fromBlock + batchSize - 1, 2000) + 1;
            } catch (err) { console.log(`Error ${fromBlock}:`, err); await sleep(10000); }
        }
        if (fromBlock > latest) fromBlock = latest;

        this.interval = setInterval(async () => {
            try {
                fromBlock = await this.crawlLogs(fromBlock) + 1;
            } catch (err) { console.log(`Error ${fromBlock}:`, err); }
        }, 30000)
    }

    async crawlLogs(fromBlock, toBlock = 'latest', sleepMs = 0) {
        const startMs = Date.now();
        const pastLogs = await this.web3.eth.getPastLogs({
            fromBlock,
            toBlock,
            topics: [this.topic],
        })

        let lastBlock = 0;
        for (let log of pastLogs) {
            lastBlock = log.blockNumber;
            if (this.onLog) try {
                await this.onLog(log);
            } catch (err) { console.log(`Process log error`, log, err) }
        }
        if (this.onLogs) try {
            await this.onLogs(pastLogs);
        } catch (err) { console.log(`Process logs error`, pastLogs.length, err) }

        if (lastBlock != 0) {
            this.blockWriter.write(`${lastBlock}\n`);
        } else if (toBlock != 'latest') {
            this.blockWriter.write(`${fromBlock}\n`);
            lastBlock = toBlock;
        } else {
            lastBlock = await this.web3.eth.getBlockNumber() - 1;
        }

        const ms = Date.now() - startMs;
        console.log(`Crawl ${this.name} logs [${fromBlock}-${toBlock}]: ${pastLogs.length} (${ms}ms)`)
        if (ms < sleepMs) await sleep(sleepMs - ms);
        return lastBlock;
    }
}

module.exports = Crawler;