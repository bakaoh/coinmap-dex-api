const fs = require('fs');
const { web3, ContractAddress } = require('../utils/bsc');
const { getLastLine } = require('../utils/io');

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BLOCK_FILE = 'logs/transfer.block';
const IGNORE = [ContractAddress.WBNB, ContractAddress.BUSD, ContractAddress.USDT];
const opts = { flags: "a" };

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

class Crawler {
    constructor() {
        this.writer = {};
    }

    async run() {
        const batchSize = 50;
        const lastLine = await getLastLine(BLOCK_FILE);
        let fromBlock = lastLine ? parseInt(lastLine) + 1 : 0;
        const latest = await web3.eth.getBlockNumber();
        console.log(`BalanceModel start running from block ${fromBlock}, latest ${latest}`);

        this.blockWriter = fs.createWriteStream(BLOCK_FILE, opts);
        while (fromBlock < latest) {
            try {
                fromBlock = await this.crawlTransferLogs(fromBlock, fromBlock + batchSize - 1) + 1;
            } catch (err) { console.log(`Error ${fromBlock}:`, err); await sleep(2000); }
        }

        this.interval = setInterval(async () => {
            try {
                fromBlock = await this.crawlTransferLogs(fromBlock) + 1;
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
            const dir = `db/transfer/${token}`;
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            this.writer[token] = {
                idx,
                writer: fs.createWriteStream(`${dir}/${idx}.log`, opts)
            }
        }
        return this.writer[token].writer;
    }

    async writeTransferLog(block, txIdx, logIdx, token, from, to, value) {
        try {
            const idx = Math.floor(block / 100000);
            this.getWriter(token, idx).write(`${block},${txIdx},${logIdx},${from},${to},${value}\n`);
        } catch (err) { console.log(`Error`, block, txIdx, logIdx, token, from, to, value, err.toString()) }
    }

    async crawlTransferLogs(fromBlock, toBlock = 'latest') {
        const startMs = Date.now();
        const pastLogs = await web3.eth.getPastLogs({
            fromBlock,
            toBlock,
            topics: [TRANSFER_TOPIC],
        })

        let lastBlock = 0;
        for (let log of pastLogs) {
            lastBlock = log.blockNumber;
            try {
                if (IGNORE.includes(log.address)) continue;
                if (log.topics.length != 3 || log.data == '0x') continue;
                const values = web3.eth.abi.decodeParameters(['uint256'], log.data)
                const from = web3.eth.abi.decodeParameters(['address'], log.topics[1])
                const to = web3.eth.abi.decodeParameters(['address'], log.topics[2])
                await this.writeTransferLog(log.blockNumber, log.transactionIndex, log.logIndex, log.address, from[0], to[0], values[0].toString(10));
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
        console.log(`Crawl transfer logs [${fromBlock}-${toBlock}]: ${pastLogs.length} (${ms}ms)`)
        if (ms < 2000) await sleep(2000 - ms);

        return lastBlock;
    }
}

module.exports = Crawler;