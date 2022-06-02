const LineByLine = require('line-by-line');
const { Partitioner } = require('../utils/io');
const Leaderboard = require('../utils/leaderboard');
const { toBN } = require('../utils/bsc');

const DATA_FOLDER = 'db/shark';
const TOP_SIZE = 10;

class SharkModel {
    constructor() {
        this.partitioner = new Partitioner(DATA_FOLDER);
        this.topPools = [];
    }

    getPoolRate(token) {
        return this.topPools.findIndex(el => el[0] == token);
    }

    loadTopPools() {
        const startMs = Date.now();
        const lr = new LineByLine(`db/pools.total`);
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
        const topTotal = new Leaderboard(TOP_SIZE);
        const topProfitByPercent = new Leaderboard(TOP_SIZE);
        const topProfitByUsd = new Leaderboard(TOP_SIZE);
        await this.partitioner.loadLog(token, 183, ([acc, accTotal, accToken, accUsd]) => {
            if (accTotal == '0') return;
            try {
            topTotal.push(acc, toBN(accTotal));
            const profitByUsd = toBN(accToken).muln(price * 100000000).divn(100000000).sub(toBN(accUsd));
            topProfitByUsd.push(acc, profitByUsd);
            const profitByPercent = profitByUsd.muln(100).div(toBN(accTotal));
            topProfitByPercent.push(acc, profitByPercent);
            } catch (err) {
                console.log(accTotal)
            }
        })
        return {
            topTotal: topTotal.getKeys(),
            topProfitByPercent: topProfitByPercent.getKeys(),
            topProfitByUsd: topProfitByUsd.getKeys(),
        };
    }
}

module.exports = SharkModel;