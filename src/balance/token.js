const fs = require('fs');
const LineByLine = require('line-by-line');
const { getTokenInfo } = require('../multicall');

const TOKEN_DETAIL_FILE = `db/token-detail.log`;
const opts = { flags: "a" };

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

class Indexer {
    constructor() {
        this.data = {};
    }

    indexing(prefix, info) {
        if (prefix.length == 0) return;
        const list = this.data[prefix] || [];
        list.push(info);
        this.data[prefix] = list;
    }

    add(address, symbol, name) {
        if (symbol == 'Cake-LP') return;
        const prefix1 = symbol.toLowerCase().substr(0, 2);
        this.indexing(prefix1, { address, symbol, name });
        const prefix2 = name.toLowerCase().substr(0, 2);
        if (prefix1 != prefix2) this.indexing(prefix2, { address, symbol, name });
    }

    search(text) {
        text = text.toLowerCase();
        const prefix = text.substr(0, 2);
        const list = this.data[prefix] || [];
        const rs = [];
        for (let token of list) {
            if (token.symbol.toLowerCase().startsWith(text)) rs.push(token);
            else if (token.name.toLowerCase().startsWith(text)) rs.push(token);
        }
        return rs;
    }
}

class TokenModel {
    constructor(readonly = false) {
        this.readonly = readonly;
        this.token = {};
        this.invalid = {};
        this.indexer = new Indexer();
    }

    searchToken(text) {
        if (text.length < 2) return [];
        return this.indexer.search(text);
    }

    getTokenSync(address) {
        if (this.token[address]) {
            return { address, symbol: this.token[address][0], name: this.token[address][1] };
        }
        return { address }
    }

    async getToken(address) {
        if (this.invalid[address]) throw `Invalid token ${address}`;
        if (!this.token[address]) {
            const startMs = Date.now();
            try {
                const tokens = await getTokenInfo([address])
                this.token[tokens[0][0]] = [tokens[0][1], tokens[0][2]];
                this.indexer.add(tokens[0][0], tokens[0][1], tokens[0][2]);
                if (!this.readonly) {
                    const writer = fs.createWriteStream(TOKEN_DETAIL_FILE, opts);
                    writer.write(`${tokens[0][0]},${tokens[0][1]},${tokens[0][2]}\n`);
                    writer.end();
                }
            } catch (err) {
                if (err.toString().includes("Multicall aggregate: call failed")) {
                    this.invalid[address] = true;
                }
            }
            const ms = Date.now() - startMs;
            if (ms < 2000) await sleep(2000 - ms);
        }
        return { address, symbol: this.token[address][0], name: this.token[address][1] };
    }

    loadTokenDetailFile() {
        const lr = new LineByLine(TOKEN_DETAIL_FILE);
        lr.on('line', (line) => {
            const p = line.split(',', 3);
            if (p.length != 3) return;
            this.token[p[0]] = [p[1], p[2]];
            this.indexer.add(p[0], p[1], p[2]);
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }
}

module.exports = TokenModel;