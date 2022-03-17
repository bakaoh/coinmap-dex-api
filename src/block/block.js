const fs = require('fs');
const LineByLine = require('line-by-line');
const Web3 = require("web3");

const BLOCK_LOG = `logs/block.log`;
const endpoint = "https://bsc-dataseed.binance.org";
const web3 = new Web3(endpoint);
const opts = { flags: "a" };
const fileLog = fs.createWriteStream(BLOCK_LOG, opts);

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function getBlockTimestamp(block = 'latest') {
    const rs = await web3.eth.getBlock(block, false);
    return [rs.number, rs.timestamp];
}

class BlockModel {
    constructor() {
        this.block = [];
    }

    async crawl() {
        let from = 0;
        let batchSize = 10000;
        const latest = await getBlockTimestamp();
        while (from < latest[0]) {
            const startMs = Date.now();
            try {
                const [number, ts] = await getBlockTimestamp(from);
                fileLog.write(`${number},${ts}\n`);
            } catch (err) { }

            const ms = Date.now() - startMs;
            console.log(`Get blocktime ${from} (${ms}ms)`)
            if (ms < 2000) await sleep(2000 - ms);
            from += batchSize;
        }
        fileLog.end();
    }

    estimateBlock(ms) {
        const ts = Math.round(ms / 1000);
        for (let i = 0; i < this.block.length; i++) {
            if (this.block[i][1] >= ts) {
                return this.block[i][0] - Math.round((this.block[i][1] - ts) / 3);
            }
        }
        const l = this.block.length - 1;
        return this.block[l][0] + Math.round((ts - this.block[l][1]) / 3);
    }

    loadLogFile() {
        const lr = new LineByLine(BLOCK_LOG);
        lr.on('line', this.onLog.bind(this));
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    run(ms) {
        this.interval = setInterval(async () => {
            try {
                const [number, ts] = await getBlockTimestamp();
                fileLog.write(`${number},${ts}\n`);
                this.block.push([number, ts]);
            } catch (err) { }
        }, ms)
    }

    onLog(line) {
        const p = line.split(',');
        if (p.length != 2) {
            console.log('Invalid log', line);
            return;
        }
        const number = parseInt(p[0]);
        const ts = parseInt(p[1]);
        this.block.push([number, ts]);
    }
}

module.exports = BlockModel;