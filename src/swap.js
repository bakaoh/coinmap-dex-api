const fs = require('fs');
const LineByLine = require('line-by-line');
const Web3 = require("web3");
const { getLPToken01 } = require('./multicall');
const PancakePairAbi = require('./abi/PancakePair.json');

const LP_FILE = `logs/lp.log`;
const LP_DETAIL_FILE = `logs/lp-detail.log`;
const endpoint = "https://bsc-dataseed.binance.org";
const opts = { flags: "a" };
const web3 = new Web3(endpoint);

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

class SwapModel {
    constructor() {
        this.lp = {};
    }

    async getToken(lpAddress) {
        const pair = new web3.eth.Contract(PancakePairAbi, lpAddress);
        const token0 = await pair.methods.token0().call();
        const token1 = await pair.methods.token1().call();
        console.log(token0, token1)
    }

    createLPFile() {
        const keys = Object.keys(this.lp);
        console.log("Total:", keys.length);
        const lp = fs.createWriteStream(LP_FILE, opts);
        keys.forEach(address => {
            lp.write(`${address}\n`);
        })
        lp.end();
    }

    loadLPFile() {
        const lr = new LineByLine(LP_FILE);
        lr.on('line', (line) => {
            this.lp[line] = true;
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    async createLPDetailFile() {
        const batchSize = 200;
        const keys = Object.keys(this.lp);
        const lp = fs.createWriteStream(LP_DETAIL_FILE, opts);
        let from = 0;
        while (from < keys.length) {
            const to = from + batchSize < keys.length ? from + batchSize : keys.length;
            try {
                const startMs = Date.now();
                const tokens = await getLPToken01(keys.slice(from, to))
                tokens.forEach(i => {
                    lp.write(`${i[0]},${i[1]},${i[2]}\n`);
                });
                const ms = Date.now() - startMs;
                console.log(`Query LP token [${from}-${to}] (${ms}ms)`)
                if (ms < 2000) await sleep(2000 - ms);
            } catch (err) {
                console.log(`Query LP token [${from}-${to}] error ${err}`)
            }
            from = to;
        }
        lp.end();
    }

    loadSwapLogFile(file) {
        const lr = new LineByLine(file);
        lr.on('line', (line) => {
            const p = line.split(',');
            if (p.length != 8) return;
            this.lp[p[1]] = true;
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

}

module.exports = SwapModel;