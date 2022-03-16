const fs = require('fs');
const LineByLine = require('line-by-line');
const Web3 = require("web3");

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const ZERO = Web3.utils.toBN(0);

class BalanceModel {
    constructor() {
        this.balance = new Map();
    }

    totalHolder() {
        return this.balance.size;
    }

    topHolder() {
        
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
        const block = p[0];
        const from = p[1];
        const to = p[2];
        const value = Web3.utils.toBN(p[3]);
        this.desc(from, value);
        this.inc(to, value);
    }

    inc(address, amount) {
        if (address == ADDRESS_ZERO) return;
        let cur = this.balance.get(address);
        if (!cur) cur = ZERO;
        this.balance.set(address, cur.add(amount));
    }

    desc(address, amount) {
        if (address == ADDRESS_ZERO) return;
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