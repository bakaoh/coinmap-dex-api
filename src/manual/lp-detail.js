const fs = require('fs');
const LineByLine = require('line-by-line');
const { ContractAddress, getPairAddress } = require('../utils/bsc');

const LP_FILE = `logs/lp.log`;
const LP_DETAIL_FILE = `logs/lp-detail.log`;
const LP_ERROR_FILE = `logs/lp-detail.err`;
const opts = { flags: "a" };

class Collector {
    constructor() {
        this.lp = {};
    }

    loadLogFile(token, idx) {
        const file = `db/transfer/${token}/${idx}.log`
        const lr = new LineByLine(file);
        lr.on('line', (line) => {
            const p = line.split(',');
            if (p.length != 6) {
                console.log('Invalid log', line);
                return;
            }
            const from = p[3];
            if (!this.lp[from]) return;
            this.lp[from][token] = true;
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    loadLpFile() {
        const lr = new LineByLine(LP_FILE);
        lr.on('line', (line) => {
            this.lp[line] = {};
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    async createLpDetailFile() {
        const writer = fs.createWriteStream(LP_DETAIL_FILE, opts);
        const err_writer = fs.createWriteStream(LP_ERROR_FILE, opts);
        for (let lpAddress in this.lp) {
            const keys = Object.keys(this.lp[lpAddress]);
            if (keys.length == 1) {
                const tokenA = keys[0];
                let tokenB = "";
                if (getPairAddress(tokenA, ContractAddress.WBNB) == lpAddress) {
                    tokenB = ContractAddress.WBNB;
                } else if (getPairAddress(tokenA, ContractAddress.BUSD) == lpAddress) {
                    tokenB = ContractAddress.BUSD;
                } else if (getPairAddress(tokenA, ContractAddress.USDT) == lpAddress) {
                    tokenB = ContractAddress.USDT;
                } else {
                    err_writer.write(`${lpAddress},${keys}\n`);
                    continue;
                }
                const tokens = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA]
                writer.write(`${lpAddress},${tokens[0]},${tokens[1]}\n`);
            } else if (keys.length != 2) {
                err_writer.write(`${lpAddress},${keys}\n`);
            } else {
                const [tokenA, tokenB] = keys;
                const tokens = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA]
                writer.write(`${lpAddress},${tokens[0]},${tokens[1]}\n`);
            }
        }
        writer.end();
        err_writer.end();
    }
}

async function run() {
    const startMs = Date.now();
    const collector = new Collector();
    await collector.loadLpFile();
    let folders = fs.readdirSync('db/transfer');

    let c = 0;
    for (let token of folders) {
        const startMs = Date.now();
        try {
            for (let idx = 0; idx < 164; idx++) {
                await collector.loadLogFile(token, idx);
            }
        } catch (err) { }
        console.log(`Scan token [${c++}] ${token} (${Date.now() - startMs}ms)`)
    }
    await collector.createLpDetailFile();
    console.log(`Scan done (${Date.now() - startMs}ms)`)
}

run();