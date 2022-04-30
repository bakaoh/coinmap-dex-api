const LineByLine = require('line-by-line');
const { Partitioner } = require('../utils/io');
const Leaderboard = require('../utils/leaderboard');
const { toBN } = require('../utils/bsc');

const DATA_FOLDER = 'db/shark';
const TOP_SIZE = 10;

class SharkModel {
    constructor() {
        this.partitioner = new Partitioner(DATA_FOLDER);
        this.topPools = new Leaderboard(100000);
    }

    getPoolRate(token) {
        return this.topPools.getRank(token);
    }

    loadTopPools() {
        const lr = new LineByLine(`db/pools.total`);
        lr.on('line', (line) => {
            const [token, value] = line.split(',');
            if (value == "0") return;
            this.topPools.push(token, toBN(parseInt(value)));
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    async topWallets(token) {
        const topTotal = new Leaderboard(TOP_SIZE);
        const topProfitByPercent = new Leaderboard(TOP_SIZE);
        const topProfitByUsd = new Leaderboard(TOP_SIZE);
        await this.partitioner.loadLog(token, 166, ([acc, accTotal, accToken, accUsd]) => {
            if (accTotal == '0') return;
            topTotal.push(acc, toBN(accTotal));
            const profitByUsd = toBN(accToken).muln(8).sub(toBN(accUsd));
            topProfitByUsd.push(acc, profitByUsd);
            const profitByPercent = profitByUsd.muln(100).div(toBN(accTotal));
            topProfitByPercent.push(acc, profitByPercent);
        })
        return {
            topTotal: topTotal.getKeys(),
            topProfitByPercent: topProfitByPercent.getKeys(),
            topProfitByUsd: topProfitByUsd.getKeys(),
        };
    }
}

module.exports = SharkModel;