const fs = require('fs');
const LineByLine = require('line-by-line');
const { getLPToken01, getTokenInfo } = require('../multicall');

const LP_FILE = `logs/lp.log`;
const LP_DETAIL_FILE = `logs/lp-detail.log`;
const TOKEN_DETAIL_FILE = `logs/token-detail.log`;
const opts = { flags: "a" };

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

class LpModel {
    constructor() {
        this.lp = {};
        this.token = {};
        this.invalid = {};
    }

    async getToken01(lpAddress) {
        if (this.invalid[lpAddress]) throw `Invalid lp token ${lpAddress}`;
        if (!this.lp[lpAddress]) {
            const startMs = Date.now();
            try {
                const tokens = await getLPToken01([lpAddress])
                this.lp[tokens[0][0]] = [tokens[0][1], tokens[0][2]];
                const lp = fs.createWriteStream(LP_DETAIL_FILE, opts);
                lp.write(`${tokens[0][0]},${tokens[0][1]},${tokens[0][2]}\n`);
                lp.end();
            } catch (err) {
                if (err.toString().includes("Multicall aggregate: call failed")) {
                    this.invalid[lpAddress] = true;
                }
            }
            const ms = Date.now() - startMs;
            if (ms < 2000) await sleep(2000 - ms);
        }
        return [lpAddress, ...this.lp[lpAddress]];
    }

    async getToken(address) {
        if (this.invalid[address]) throw `Invalid token ${address}`;
        if (!this.token[address]) {
            const startMs = Date.now();
            try {
                const tokens = await getTokenInfo([address])
                this.token[tokens[0][0]] = [tokens[0][1], tokens[0][2]];
                const writer = fs.createWriteStream(TOKEN_DETAIL_FILE, opts);
                writer.write(`${tokens[0][0]},${tokens[0][1]},${tokens[0][2]}\n`);
                writer.end();
            } catch (err) {
                if (err.toString().includes("Multicall aggregate: call failed")) {
                    this.invalid[address] = true;
                }
            }
            const ms = Date.now() - startMs;
            if (ms < 2000) await sleep(2000 - ms);
        }
        return [address, ...this.token[address]];
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

    createLpFile() {
        const keys = Object.keys(this.lp);
        console.log("Total:", keys.length);
        const lp = fs.createWriteStream(LP_FILE, opts);
        keys.forEach(address => {
            lp.write(`${address}\n`);
        })
        lp.end();
    }

    loadLpFile() {
        const lr = new LineByLine(LP_FILE);
        lr.on('line', (line) => {
            this.lp[line] = true;
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    async createLpDetailFile() {
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

    loadLpDetailFile() {
        const lr = new LineByLine(LP_DETAIL_FILE);
        lr.on('line', (line) => {
            const p = line.split(',');
            if (p.length != 3) return;
            this.lp[p[0]] = [p[1], p[2]];
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    async createTokenDetailFile() {
        const batchSize = 1;
        const all = new Set();
        for (let address in this.lp) {
            all.add(this.lp[address][0]);
            all.add(this.lp[address][1]);
        }
        const keys = [...all];
        console.log(`Total token ${keys.length}`);

        const writer = fs.createWriteStream(TOKEN_DETAIL_FILE, opts);
        let from = 0;
        while (from < keys.length) {
            const to = from + batchSize < keys.length ? from + batchSize : keys.length;
            try {
                const startMs = Date.now();
                const tokens = await getTokenInfo(keys.slice(from, to))
                tokens.forEach(i => {
                    writer.write(`${i[0]},${i[1]},${i[2]}\n`);
                });
                const ms = Date.now() - startMs;
                console.log(`Query token [${from}-${to}] (${ms}ms)`)
                if (ms < 1000) await sleep(1000 - ms);
            } catch (err) {
                console.log(`Query token [${from}-${to}] error ${err}`, keys.slice(from, to))
            }
            from = to;
        }
        writer.end();
    }

    loadTokenDetailFile() {
        const lr = new LineByLine(TOKEN_DETAIL_FILE);
        lr.on('line', (line) => {
            const p = line.split(',', 3);
            if (p.length != 3) return;
            this.token[p[0]] = [p[1], p[2]];
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }
}

module.exports = LpModel;