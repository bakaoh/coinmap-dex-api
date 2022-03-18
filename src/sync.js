const fs = require('fs');
const LineByLine = require('line-by-line');
const Web3 = require("web3");

const opts = { flags: "a" };

class SyncModel {
    constructor(lp) {
        this.lp = lp;
        this.file = {};
    }

    closeAll() {
        const keys = Object.keys(this.file);
        keys.forEach(address => {
            this.file[address].writer.end();
        });
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

    async getPrice(token0, token1, checkpoints) {
        let cid = 0;
        for (let idx = 150; idx <= 160; idx++) {
            try {
                await this.loadSyncLog(token0, idx, (block, othertoken, reserve0, reserve1) => {
                    if (token1 != othertoken) return;
                    if (block > checkpoints[cid]) {
                        const price = Web3.utils.toBN(reserve1).muln(100000).div(Web3.utils.toBN(reserve0))
                        console.log(checkpoints[cid], parseInt(price.toString(10)) / 100000);
                        while (block > checkpoints[cid]) cid++;
                    }
                });
            } catch (err) { console.log(err) }
        }
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
            this.getWriter(token01[0], idx).write(`${block},${token01[1]},${reserve0},${reserve1}\n`);
            this.getWriter(token01[1], idx).write(`${block},${token01[0]},${reserve1},${reserve0}\n`);
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