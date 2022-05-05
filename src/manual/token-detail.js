const fs = require('fs');
const LineByLine = require('line-by-line');
const { getTokenMetadata } = require('../multicall');

const TOKEN_DETAIL_FILE = `db/token-detail.log`;
const TOKEN_DETAIL_V2_FILE = `db/token-detail-v2.log`;
const opts = { flags: "a" };

const tokens = [];

const loadTokenDetailFile = () => {
    const lr = new LineByLine(TOKEN_DETAIL_FILE);
    lr.on('line', (line) => {
        const p = line.split(',', 3);
        if (p.length != 3) return;
        tokens.push(p[0]);
    });
    return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
}

async function updateDetailFile() {
    await loadTokenDetailFile();
    console.log(`Total token: ${tokens.length}`);
    const writer = fs.createWriteStream(TOKEN_DETAIL_V2_FILE, opts);
    let idx = 0;
    while (idx < tokens.length) {
        const startMs = Date.now();
        const rs = await getTokenMetadata(tokens.slice(idx, idx + 100));
        for (let i = 0; i < rs.length; i++) {
            if (rs[i][2] == '') continue;
            writer.write(`${rs[i][0]},${rs[i][3]},${rs[i][2]},${rs[i][1]}\n`);
        }
        idx = idx + 100;
        console.log(`Get metadata [${idx}](${Date.now() - startMs})`);
    }
    writer.end();
}

updateDetailFile();