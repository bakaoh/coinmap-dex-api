const fs = require('fs');
const LineByLine = require('line-by-line');
const Web3 = require("web3");

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const ZERO = Web3.utils.toBN(0);
const opts = { flags: "a" };

const sortBalance = (a, b) => (a[1].gt(b[1])) ? -1 : 1;

class BalanceModel {
    constructor(checkpoints) {
        this.balance = new Map();
        this.hastx = {};
        this.checkpoints = checkpoints;
        this.cid = 0;
        this.newholders = [];
    }

    totalHolder() {
        return this.balance.size;
    }

    topHolder(n) {
        this.balance.forEach((balance, address) => {
            if (rs.length < n) {
                rs.push([address, balance]);
                rs.sort(sortBalance);
            } else if (balance.gt(rs[n - 1][1])) {
                rs.pop();
                rs.push([address, balance]);
                rs.sort(sortBalance);
            }
        });

        return rs;
    }

    createCacheFile(block) {
        const total = fs.createWriteStream(`logs/cake-total.log`, opts);
        total.write(`${block},${this.balance.size}\n`);

        let dir = `logs/holders`;
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const holders = fs.createWriteStream(`${dir}/${block}.log`, opts);

        const toplist = [];
        this.balance.forEach((balance, address) => {
            holders.write(`${address},${balance}\n`);
            if (toplist.length < 100) {
                toplist.push([address, balance]);
                toplist.sort(sortBalance);
            } else if (balance.gt(toplist[100 - 1][1])) {
                toplist.pop();
                toplist.push([address, balance]);
                toplist.sort(sortBalance);
            }
        });

        dir = `logs/topholders`;
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const topholders = fs.createWriteStream(`${dir}/${block}.log`, opts);
        toplist.forEach((v) => {
            topholders.write(`${v[0]},${v[1]}\n`);
        });

        dir = `logs/newholders`;
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const newholders = fs.createWriteStream(`${dir}/${block}.log`, opts);
        this.newholders.forEach((v) => {
            newholders.write(`${v}\n`);
        });
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
        let cur = this.balance.get(address);
        if (!cur) {
            cur = ZERO;
        }
        if (!this.hastx[address]) {
            this.newholders.push(address);
            this.hastx[address] = true;
        }
        this.balance.set(address, cur.add(amount));
    }

    desc(address, amount) {
        if (address == ADDRESS_ZERO || amount.eqn(0)) return;
        let cur = this.balance.get(address);
        if (!cur) {
            console.log('Invalid balance', address);
            return;
        }
        cur = cur.sub(amount);
        if (cur.ltn(0)) {
            this.balance.delete(address);
            console.log('Invalid balance', address, cur.toString(10));
        } else if (cur.eqn(0)) {
            this.balance.delete(address);
        } else {
            this.balance.set(address, cur);
        }
    }
}

module.exports = BalanceModel;