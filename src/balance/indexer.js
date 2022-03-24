const fs = require('fs');
const LineByLine = require('line-by-line');

const { toBN } = require('../utils/bsc');
const { getLastFile } = require('../utils/io');

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const ZERO = toBN(0);

const TOP_SIZE = 100;
const opts = { flags: "a" };

const sortBalance = (a, b) => (a[1].gt(b[1])) ? -1 : 1;

class Indexer {
    constructor(token) {
        this.token = token;

        this.balance = {};
        this.dailyaction = {};
        this.newholders = [];
        this.cid = 0;
        this.lastCp = 0;
        this.lastBlock = 0;

        fs.mkdirSync(`cache/holders/${this.token}`, { recursive: true });
        fs.mkdirSync(`cache/topholders/${this.token}`, { recursive: true });
        fs.mkdirSync(`cache/newholders/${this.token}`, { recursive: true });
        fs.mkdirSync(`cache/summary/${this.token}`, { recursive: true });
    }

    async run(checkpoints) {
        this.checkpoints = checkpoints;
        const lastFile = getLastFile(`cache/holders/${this.token}`);
        if (lastFile != "") {
            const startMs = Date.now();
            this.lastCp = parseInt(lastFile);
            await this.loadHoldersFile(this.lastCp);
            console.log(`Indexer load holders done (${Date.now() - startMs}ms)`)
        }
        const fromIdx = Math.floor(this.lastCp / 100000);
        const toIdx = Math.floor(checkpoints[checkpoints.length - 1] / 100000);
        for (let i = fromIdx; i <= toIdx; i++) {
            const startMs = Date.now();
            try {
                await this.loadLogFile(i);
            } catch (err) {
                console.log(`Indexer load log file [${i}] err: ${err}`);
            }
            // console.log(`Indexer load log file [${i}] done (${Date.now() - startMs}ms)`);
        }
    }

    loadHoldersFile(cp) {
        const file = `cache/holders/${this.token}/${cp}.log`
        const lr = new LineByLine(file);
        lr.on('line', (line) => {
            const p = line.split(',');
            if (p.length != 2) {
                console.log('Invalid log', line);
                return;
            }
            this.balance[p[0]] = toBN(p[1]);
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    createCacheFile(block) {
        let count = 0;
        const toplist = [];
        const holders = fs.createWriteStream(`cache/holders/${this.token}/${block}.log`, opts);
        for (let address in this.balance) {
            const balance = this.balance[address];
            if (balance.gtn(0)) count++;
            holders.write(`${address},${balance}\n`);
            if (toplist.length < TOP_SIZE) {
                toplist.push([address, balance]);
                toplist.sort(sortBalance);
            } else if (balance.gt(toplist[TOP_SIZE - 1][1])) {
                toplist.pop();
                toplist.push([address, balance]);
                toplist.sort(sortBalance);
            }
        }
        holders.end();

        const total = fs.createWriteStream(`cache/summary/${this.token}/total-holder.log`, opts);
        total.write(`${block},${count}\n`);
        total.end();

        const topholders = fs.createWriteStream(`cache/topholders/${this.token}/${block}.log`, opts);
        toplist.forEach((v) => { topholders.write(`${v[0]},${v[1]},${this.dailyaction[v[0]] || ZERO}\n`); });
        topholders.end();

        const newholders = fs.createWriteStream(`cache/newholders/${this.token}/${block}.log`, opts);
        this.newholders.forEach((v) => { newholders.write(`${v}\n`); });
        newholders.end();

        this.newholders = [];
        this.dailyaction = {};
    }

    loadLogFile(idx) {
        const file = `db/transfer/${this.token}/${idx}.log`
        const lr = new LineByLine(file);
        lr.on('line', (line) => {
            const p = line.split(',');
            if (p.length != 6) {
                console.log('Invalid log', line);
                return;
            }
            const block = parseInt(p[0]);
            if (block <= this.lastCp) return;
            if (block < this.lastBlock) return;
            this.lastBlock = block;

            const from = p[3];
            const to = p[4];
            const value = toBN(p[5]);

            while (block > parseInt(this.checkpoints[this.cid])) {
                this.createCacheFile(this.checkpoints[this.cid]);
                this.cid++;
            }
            this.desc(from, value);
            this.inc(to, value);
        });
        return new Promise((res, rej) => lr.on('end', () => res())
            .on('error', err => {
                if (!err.toString().includes('no such file')) {
                    const block = idx * 100000;
                    while (block > parseInt(this.checkpoints[this.cid])) {
                        this.createCacheFile(this.checkpoints[this.cid]);
                        this.cid++;
                    }
                } else rej(err)
            }));
    }

    inc(address, amount) {
        if (address == ADDRESS_ZERO || amount.eqn(0)) return;
        const cur = this.balance[address] || ZERO;
        if (!this.balance[address]) {
            this.newholders.push(address);
        }
        this.balance[address] = cur.add(amount);
        this.dailyaction[address] = (this.dailyaction[address] || ZERO).add(amount);
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
            console.log('Invalid balance', address, cur.toString(10));
        }
        this.balance[address] = cur;
        this.dailyaction[address] = (this.dailyaction[address] || ZERO).add(amount);
    }
}

module.exports = Indexer;