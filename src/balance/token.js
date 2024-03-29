const fs = require('fs');
const LineByLine = require('line-by-line');
const { getTokenMetadata } = require('../multicall');
const { getAddress } = require('../utils/bsc');

const TOKEN_DETAIL_FILE = `db/token-detail-v2.log`;
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

    add(address, decimals, symbol, name) {
        if (symbol == 'Cake-LP') return;
        const prefix1 = symbol.toLowerCase().substr(0, 2);
        this.indexing(prefix1, { address, symbol, name });
        const prefix2 = name.toLowerCase().substr(0, 2);
        if (prefix1 != prefix2) this.indexing(prefix2, { address, decimals, symbol, name });
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
        if (text.length < 3) return [];
        if (text.length == 42) {
            const address = getAddress(text);
            if (this.token[address]) return [{ address, decimals: this.token[address][0], symbol: this.token[address][1], name: this.token[address][2] }];
        }
        return this.indexer.search(text);
    }

    getTokenSync(address) {
        if (this.token[address]) {
            return { address, decimals: this.token[address][0], symbol: this.token[address][1], name: this.token[address][2] };
        }
        return { address }
    }

    async getToken(address) {
        if (this.invalid[address]) throw `Invalid token ${address}`;
        if (!this.token[address]) {
            const startMs = Date.now();
            try {
                const tokens = await getTokenMetadata([address])
                this.token[tokens[0][0]] = [tokens[0][3], tokens[0][2], tokens[0][1]];
                this.indexer.add(tokens[0][0], tokens[0][3], tokens[0][2], tokens[0][1]);
                if (!this.readonly) {
                    const writer = fs.createWriteStream(TOKEN_DETAIL_FILE, opts);
                    writer.write(`${tokens[0][0]},${tokens[0][3]},${tokens[0][2]},${tokens[0][1]}\n`);
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
        return { address, decimals: this.token[address][0], symbol: this.token[address][1], name: this.token[address][2] };
    }

    async prefetchTokens(addresses) {
        addresses = addresses.filter(a => !this.invalid[a] && !this.token[a]);
        if (addresses.length == 0) return;
        const tokens = await getTokenMetadata(addresses)
        const writer = fs.createWriteStream(TOKEN_DETAIL_FILE, opts);
        for (let i = 0; i < tokens.length; i++) {
            this.token[tokens[i][0]] = [tokens[i][3], tokens[i][2], tokens[i][1]];
            this.indexer.add(tokens[i][0], tokens[i][3], tokens[i][2], tokens[i][1]);
            if (!this.readonly) {
                writer.write(`${tokens[i][0]},${tokens[i][3]},${tokens[i][2]},${tokens[i][1]}\n`);
            }
        }
        writer.end();
    }

    loadTokenDetailFile() {
        const lr = new LineByLine(TOKEN_DETAIL_FILE);
        lr.on('line', (line) => {
            const p = line.split(',', 4);
            if (p.length != 4) return;
            this.token[p[0]] = [p[1], p[2], p[3]];
            this.indexer.add(p[0], p[1], p[2], p[3]);
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }
}

module.exports = TokenModel;