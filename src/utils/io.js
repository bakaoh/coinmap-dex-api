const fs = require('fs');
const LineByLine = require('line-by-line');

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
    let files = fs.readdirSync('logs');
    if (files.length == 0) return "";
    return files.sort()[0];
}

module.exports = { getLastLine, getLastFile }