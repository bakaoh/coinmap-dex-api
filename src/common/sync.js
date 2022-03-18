const fs = require('fs');
const LineByLine = require('line-by-line');
const Web3 = require("web3");

const opts = { flags: "a" };

const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const BUSD = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56';
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const CAKE = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';

class SyncModel {
    constructor(lp) {
        this.lp = lp;
        this.file = {};
    }

    closeAll() {
        const keys = Object.keys(this.file);
        keys.forEach(address => { this.file[address].writer.end(); });
    }

    getWriter(token, idx) {
        if (!this.file[token] || this.file[token].idx != idx) {
            if (this.file[token]) this.file[token].writer.end();
            const dir = `logs/sync/${token}`;
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            this.file[token] = {
                idx,
                writer: fs.createWriteStream(`${dir}/${idx}.log`, opts)
            }
        }
        return this.file[token].writer;
    }

    async getLiquidity(token0, checkpoints, details = false) {
        let cid = 0;
        let liquidity = {};
        let price = Web3.utils.toBN(0);
        const fromIdx = Math.floor(checkpoints[0] / 100000);
        const toIdx = Math.ceil(checkpoints[checkpoints.length - 1] / 100000);
        const rs = [];
        for (let idx = fromIdx; idx <= toIdx; idx++) {
            try {
                await this.loadSyncLog(token0, idx, (block, othertoken, reserve0, reserve1) => {
                    liquidity[othertoken] = [reserve0, reserve1];
                    if (othertoken == BUSD) price = Web3.utils.toBN(reserve1).muln(100000).div(Web3.utils.toBN(reserve0))
                    if (block > checkpoints[cid]) {
                        let total = Web3.utils.toBN(0);
                        for (let token1 in liquidity) {
                            total = total.add(Web3.utils.toBN(liquidity[token1][0]))
                        }
                        rs.push([checkpoints[cid], total.toString(10), total.mul(price).divn(100000).toString(10), details ? JSON.parse(JSON.stringify(liquidity)) : {}]);
                        while (block > checkpoints[cid]) cid++;
                    }
                });
            } catch (err) { console.log(err) }
        }
        return rs;
    }

    async getPrices(token0, token1, checkpoints) {
        let cid = 0;
        const fromIdx = Math.floor(checkpoints[0] / 100000);
        const toIdx = Math.ceil(checkpoints[checkpoints.length - 1] / 100000);
        const rs = [];
        for (let idx = fromIdx; idx <= toIdx; idx++) {
            try {
                await this.loadSyncLog(token0, idx, (block, othertoken, reserve0, reserve1) => {
                    if (token1 != othertoken) return;
                    if (block > checkpoints[cid]) {
                        const price = Web3.utils.toBN(reserve1).muln(100000).div(Web3.utils.toBN(reserve0))
                        rs.push([checkpoints[cid], parseInt(price.toString(10)) / 100000]);
                        while (block > checkpoints[cid]) cid++;
                    }
                });
            } catch (err) { console.log(err) }
        }
        return rs;
    }

    loadSyncLog(token, idx, cb) {
        const lr = new LineByLine(`logs/sync/${token}/${idx}.log`);
        lr.on('line', (line) => {
            const p = line.split(',');
            if (p.length != 4) return;
            cb(p[0], p[1], p[2], p[3]);
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    async writeSyncLog(block, lpToken, reserve0, reserve1) {
        try {
            const token01 = await this.lp.getToken01(lpToken);
            const idx = Math.floor(block / 100000);
            this.getWriter(token01[1], idx).write(`${block},${token01[2]},${reserve0},${reserve1}\n`);
            this.getWriter(token01[2], idx).write(`${block},${token01[1]},${reserve1},${reserve0}\n`);
        } catch (err) { console.log(`Error`, block, lpToken, reserve0, reserve1, err.toString()) }
    }

    partitionSyncLogFile(file) {
        const lr = new LineByLine(file);
        lr.on('line', (line) => {
            const p = line.split(',');
            if (p.length != 4) return;
            this.writeSyncLog(p[0], p[1], p[2], p[3]);
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

}

module.exports = SyncModel;