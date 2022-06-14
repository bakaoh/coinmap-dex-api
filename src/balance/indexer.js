const fs = require('fs');
const LineByLine = require('line-by-line');
const Leaderboard = require('../utils/leaderboard');

const { toBN } = require('../utils/bsc');
const { getLastFile, Partitioner } = require('../utils/io');

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
        this.mint = toBN(0);
        this.cid = 0;
        this.lastCp = 0;
        this.lastBlock = 0;
        this.first = true;

        fs.mkdirSync(`cache/holders/${this.token}`, { recursive: true });
        fs.mkdirSync(`cache/topholders/${this.token}`, { recursive: true });
        fs.mkdirSync(`cache/newholders/${this.token}`, { recursive: true });
        fs.mkdirSync(`cache/summary/${this.token}`, { recursive: true });
    }

    async run(checkpoints) {
        this.checkpoints = checkpoints;
        const lastFile = getLastFile(`cache/holders/${this.token}`);
        if (lastFile != "") {
            this.first = false;
            const startMs = Date.now();
            this.lastCp = parseInt(lastFile);
            await this.loadHoldersFile(this.lastCp);
            const block = this.lastCp;
            while (block >= parseInt(this.checkpoints[this.cid])) {
                this.cid++;
                if (this.cid >= this.checkpoints.length) return;
            }
            console.log(`Indexer load holders done (${Date.now() - startMs}ms)`)
        }
        const fromIdx = Math.floor(this.lastCp / Partitioner.BPF);
        const toIdx = Math.floor(checkpoints[checkpoints.length - 1] / Partitioner.BPF);
        for (let i = fromIdx; i <= toIdx; i++) {
            try {
                await this.loadLogFile(i);
            } catch (err) {
                if (err.toString().includes('no such file')) {
                    const block = i * Partitioner.BPF;
                    while (block > parseInt(this.checkpoints[this.cid])) {
                        this.createCacheFile(this.checkpoints[this.cid]);
                        this.cid++;
                    }
                } else {
                    console.log(`Indexer load log file [${i}] err: ${err}`);
                }
            }
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
        const top = new Leaderboard(TOP_SIZE);
        const holders = fs.createWriteStream(`cache/holders/${this.token}/${block}.log`, opts);
        for (let address in this.balance) {
            const balance = this.balance[address];
            if (balance.gtn(0)) count++;
            holders.write(`${address},${balance}\n`);
            top.push(address, balance);
        }
        holders.end();

        const totalHolder = fs.createWriteStream(`cache/summary/${this.token}/total-holder.log`, opts);
        totalHolder.write(`${block},${count}\n`);
        totalHolder.end();

        const topHolders = fs.createWriteStream(`cache/topholders/${this.token}/${block}.log`, opts);
        top.getList().forEach((v) => { topHolders.write(`${v[0]},${v[1]},${this.dailyaction[v[0]] || ZERO}\n`); });
        topHolders.end();

        const newHolders = fs.createWriteStream(`cache/newholders/${this.token}/${block}.log`, opts);
        this.newholders.forEach((v) => { newHolders.write(`${v}\n`); });
        newHolders.end();

        const totalMint = fs.createWriteStream(`cache/summary/${this.token}/total-mint.log`, opts);
        totalMint.write(`${block},${this.mint}\n`);
        totalMint.end();

        this.newholders = [];
        this.dailyaction = {};
        this.first = false;
        this.mint = toBN(0);
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
            if (from == ADDRESS_ZERO) {
                this.mint = this.mint.add(value);
            }
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    inc(address, amount) {
        if (address == ADDRESS_ZERO || amount.eqn(0)) return;
        const cur = this.balance[address] || ZERO;
        if (!this.balance[address] && !this.first) {
            this.newholders.push(address);
        }
        this.balance[address] = cur.add(amount);
        this.dailyaction[address] = (this.dailyaction[address] || ZERO).add(amount);
    }

    desc(address, amount) {
        if (address == ADDRESS_ZERO || amount.eqn(0)) return;
        let cur = this.balance[address];
        if (!cur) return;
        cur = cur.sub(amount);
        this.balance[address] = cur;
        this.dailyaction[address] = (this.dailyaction[address] || ZERO).add(amount);
    }
}

module.exports = Indexer;