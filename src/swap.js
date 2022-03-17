const fs = require('fs');
const LineByLine = require('line-by-line');
const Web3 = require("web3");

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const ZERO = Web3.utils.toBN(0);

const sortBalance = (a, b) => (a[1].gt(b[1])) ? -1 : 1;

class SwapModel {
    constructor() {
        this.lp = {};
    }

    print() {
        const keys = Object.keys(this.lp);
        console.log("Total:", keys.length);
        console.log(keys);
    }

    loadLogFile(file) {
        const lr = new LineByLine(file);
        lr.on('line', this.onLog.bind(this));
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    onLog(line) {
        const p = line.split(',');
        if (p.length != 8) {
            console.log('Invalid log', line);
            return;
        }
        const block = p[0];
        const address = p[1];
        this.lp[address] = true;
    }
}

module.exports = SwapModel;