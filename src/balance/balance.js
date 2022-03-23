const fs = require('fs');
const LineByLine = require('line-by-line');

const { web3, ContractAddress, toBN } = require('../utils/bsc');
const { getLastLine, getLastFile } = require('../utils/io');

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const ZERO = Web3.utils.toBN(0);

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BLOCK_FILE = 'logs/transfer.block';
const IGNORE = [ContractAddress.WBNB, ContractAddress.BUSD, ContractAddress.USDT];
const opts = { flags: "a" };

const sortBalance = (a, b) => (a[1].gt(b[1])) ? -1 : 1;

class BalanceModel {
    constructor(checkpoints) {
        this.writer = {};

        this.balance = {};
        this.hastx = {};
        this.checkpoints = checkpoints;
        this.cid = 0;
        this.newholders = [];

        fs.mkdirSync('logs/holders', { recursive: true });
        fs.mkdirSync('logs/topholders', { recursive: true });
        fs.mkdirSync('logs/newholders', { recursive: true });
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
                this.writeTransferLog(log.blockNumber, log.transactionIndex, log.logIndex, log.address, from[0], to[0], values[0].toString(10));
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

    createCacheFile(block) {
        let count = 0;
        const toplist = [];
        const holders = fs.createWriteStream(`logs/holders/${block}.log`, opts);
        for (let address in this.balance) {
            const balance = this.balance[address];
            count++;
            holders.write(`${address},${balance}\n`);
            if (toplist.length < 100) {
                toplist.push([address, balance]);
                toplist.sort(sortBalance);
            } else if (balance.gt(toplist[100 - 1][1])) {
                toplist.pop();
                toplist.push([address, balance]);
                toplist.sort(sortBalance);
            }
        }

        const total = fs.createWriteStream(`logs/cake-total.log`, opts);
        total.write(`${block},${count}\n`);

        const topholders = fs.createWriteStream(`logs/topholders/${block}.log`, opts);
        toplist.forEach((v) => { topholders.write(`${v[0]},${v[1]}\n`); });

        const newholders = fs.createWriteStream(`logs/newholders/${block}.log`, opts);
        this.newholders.forEach((v) => { newholders.write(`${v}\n`); });
        this.newholders = [];
    }

    loadLogFile(file) {
        const lr = new LineByLine(file);
        lr.on('line', this.onLog.bind(this));
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    onLog(line) {
        const p = line.split(',');
        if (p.length != 4) {
            console.log('Invalid log', line);
            return;
        }
        const block = parseInt(p[0]);
        const from = p[1];
        const to = p[2];
        const value = Web3.utils.toBN(p[3]);

        if (block > this.checkpoints[this.cid]) {
            this.createCacheFile(this.checkpoints[this.cid]);
            while (block > parseInt(this.checkpoints[this.cid])) this.cid++;
        }
        this.desc(from, value);
        this.inc(to, value);
    }

    inc(address, amount) {
        if (address == ADDRESS_ZERO || amount.eqn(0)) return;
        const cur = this.balance[address] || ZERO;
        if (!this.hastx[address]) {
            this.newholders.push(address);
            this.hastx[address] = true;
        }
        this.balance[address] = cur.add(amount);
    }

    desc(address, amount) {
        if (address == ADDRESS_ZERO || amount.eqn(0)) return;
        let cur = this.balance[address];
        if (!cur) {
            console.log('Invalid balance', address);
            return;
        }
        cur = cur.sub(amount);
        if (cur.ltn(0)) {
            delete this.balance[address];
            console.log('Invalid balance', address, cur.toString(10));
        } else if (cur.eqn(0)) {
            delete this.balance[address];
        } else {
            this.balance[address] = cur;
        }
    }
}

module.exports = BalanceModel;