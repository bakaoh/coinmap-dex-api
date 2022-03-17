const fs = require('fs');
const LineByLine = require('line-by-line');

const opts = { flags: "a" };
const routerAddress = '0x10ED43C718714eb63d5aA57B78B54704E256024E';

class SwapModel {
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
            const dir = `logs/swap/${token}`;
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            this.file[token] = {
                idx,
                writer: fs.createWriteStream(`${dir}/${idx}.log`, opts)
            }
        }
        return this.file[token].writer;
    }

    async writeSwapLog(block, lpToken, from, to, in0, in1, out0, out1) {
        try {
            const token01 = await this.lp.getToken01(lpToken);
            const idx = Math.floor(block / 100000);
            if (from == routerAddress) from = "ROUTER";
            if (to == routerAddress) to = "ROUTER";
            if (in0 == '0') {
                // BUY TOKEN 0, SELL TOKEN 1
                this.getWriter(token01[0], idx).write(`${block},BUY,${token01[1]},${from},${to},${out0},${in1}\n`);
                this.getWriter(token01[1], idx).write(`${block},SELL,${token01[0]},${from},${to},${in1},${out0}\n`);
            } else {
                // SELL TOKEN 0, BUY TOKEN 1
                this.getWriter(token01[0], idx).write(`${block},SELL,${token01[1]},${from},${to},${in0},${out1}\n`);
                this.getWriter(token01[1], idx).write(`${block},BUY,${token01[0]},${from},${to},${out1},${in0}\n`);
            }
        } catch (err) { console.log(`Error`, block, lpToken, from, to, in0, in1, out0, out1, err.toString()) }
    }

    partitionSwapLogFile(file) {
        const lr = new LineByLine(file);
        lr.on('line', (line) => {
            const p = line.split(',');
            if (p.length != 8) return;
            this.writeSwapLog(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]);
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

}

module.exports = SwapModel;