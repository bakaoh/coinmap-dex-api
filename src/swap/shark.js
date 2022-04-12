const { Partitioner } = require('../utils/io');
const { toBN } = require('../utils/bsc');

const DATA_FOLDER = 'db/shark';
const TOP_SIZE = 10;

const sortValue = (a, b) => (a[1].gt(b[1])) ? -1 : 1;

class TopList {
    constructor(size) {
        this.size = size;
        this.list = [];
    }

    push(key, value) {
        if (this.list.length < this.size) {
            this.list.push([key, value]);
            this.list.sort(sortValue);
        } else if (value.gt(this.list[this.size - 1][1])) {
            this.list.pop();
            this.list.push([key, value]);
            this.list.sort(sortValue);
        }
    }

    getKeys() {
        return this.list.map(i => i[0]);
    }
}

class SharkModel {
    constructor() {
        this.partitioner = new Partitioner(DATA_FOLDER);
    }

    async topWallets(token) {
        const topTotal = new TopList(TOP_SIZE);
        const topProfitByPercent = new TopList(TOP_SIZE);
        const topProfitByUsd = new TopList(TOP_SIZE);
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