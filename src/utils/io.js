const fs = require('fs');
const LineByLine = require('line-by-line');
const opts = { flags: "a" };

function getLastLine(file, minLen = 3) {
    const lr = new LineByLine(file);
    let lastLine = "";
    lr.on('line', (line) => {
        if (line.length >= minLen) lastLine = line;
    });
    return new Promise((res, rej) =>
        lr.on('end', () => res(lastLine))
            .on('error', err => rej(err)));
}

function getLastFile(dir) {
    let files = fs.readdirSync(dir);
    if (files.length == 0) return "";
    return files.sort((a, b) => parseInt(b) - parseInt(a))[0];
}

function getLastFiles(dir) {
    let files = fs.readdirSync(dir);
    return files.sort((a, b) => parseInt(b) - parseInt(a));
}

class Partitioner {
    constructor(prefix, suffix = "") {
        this.prefix = prefix;
        this.suffix = suffix;
        this.writers = {};
    }

    closeAll() {
        const keys = Object.keys(this.writers);
        keys.forEach(address => { this.writers[address].writer.end(); });
    }

    getWriter(token, idx) {
        if (!this.writers[token] || this.writers[token].idx != idx) {
            if (this.writers[token]) this.writers[token].writer.end();
            const dir = `${this.prefix}/${token}`;
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            this.writers[token] = {
                idx,
                writer: fs.createWriteStream(`${dir}/${idx}${this.suffix}`, opts)
            }
        }
        return this.writers[token].writer;
    }

    loadLog(token, idx, cb) {
        const lr = new LineByLine(`${this.prefix}/${token}/${idx}${this.suffix}`);
        lr.on('line', (line) => {
            cb(line.split(','));
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }
}

module.exports = { getLastLine, getLastFile, getLastFiles, Partitioner }