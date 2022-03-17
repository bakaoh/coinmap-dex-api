const fs = require('fs');
const LineByLine = require('line-by-line');
const Web3 = require("web3");

const opts = { flags: "a" };

class SwapModel {
    constructor() {
        this.lp = {};
    }

    writeLPFile() {
        const keys = Object.keys(this.lp);
        console.log("Total:", keys.length);
        const lp = fs.createWriteStream(`logs/lp.log`, opts);
        keys.forEach(address => {
            lp.write(`${address}\n`);
        })
        lp.end();
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