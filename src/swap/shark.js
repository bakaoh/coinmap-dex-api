const fs = require('fs');
const LineByLine = require('line-by-line');
const { Partitioner } = require('../utils/io');
const Leaderboard = require('../utils/leaderboard');
const { toBN } = require('../utils/bsc');
const { checkIsContract } = require('../multicall')

const DATA_FOLDER = 'db/shark';
const TOP_SIZE = 10;
const ID = 204;
const CACHE_FOLDER = `cache/shark/${ID}`;

async function getTopEOA(addresses) {
    return (await checkIsContract(addresses)).slice(0, TOP_SIZE);
}

class SharkModel {
    constructor() {
        this.partitioner = new Partitioner(DATA_FOLDER);
        this.topPools = [];
        if (!fs.existsSync(CACHE_FOLDER)) fs.mkdirSync(CACHE_FOLDER, { recursive: true });
    }

    getPoolRate(token) {
        return this.topPools.findIndex(el => el[0] == token);
    }

    loadTopPools() {
        const startMs = Date.now();
        const lr = new LineByLine(`db/pools-204.total`);
        lr.on('line', (line) => {
            const [token, value] = line.split(',');
            if (value == "0") return;
            this.topPools.push([token, parseInt(value)]);
        });
        return new Promise((res, rej) => lr.on('end', () => {
            console.log(`Load pools (${Date.now() - startMs}ms)`)
            this.topPools.sort((a, b) => (a[1] > b[1]) ? -1 : 1);
            console.log(`Sort pools (${Date.now() - startMs}ms)`)
            res()
        }).on('error', err => rej(err)));
    }

    async topWallets(token, price) {
        const cacheFile = `${CACHE_FOLDER}/${token}`;
        if (fs.existsSync(cacheFile)) {
            return JSON.parse(fs.readFileSync(cacheFile));
        }
        const topTotal = new Leaderboard(TOP_SIZE * 10);
        const topProfitByPercent = new Leaderboard(TOP_SIZE * 10);
        const topProfitByUsd = new Leaderboard(TOP_SIZE * 10);
        const priceBN = toBN(Math.round(price * 100000000));
        const d = toBN("100000000")
        await this.partitioner.loadLog(token, ID, ([acc, accTotal, accToken, accUsd]) => {
            if (accTotal == '0') return;
            if (acc.length != 42) return;
            topTotal.push(acc, toBN(accTotal));
            const profitByUsd = toBN(accToken).mul(priceBN).div(d).sub(toBN(accUsd));
            topProfitByUsd.push(acc, profitByUsd);
            const profitByPercent = profitByUsd.muln(100).div(toBN(accTotal));
            topProfitByPercent.push(acc, profitByPercent);
        })
        const rs = {
            topTotal: await getTopEOA(topTotal.getKeys()),
            topProfitByPercent: await getTopEOA(topProfitByPercent.getKeys()),
            topProfitByUsd: await getTopEOA(topProfitByUsd.getKeys()),
        };
        fs.writeFileSync(cacheFile, JSON.stringify(rs, null, 2));
        return rs;
    }
}

module.exports = SharkModel;