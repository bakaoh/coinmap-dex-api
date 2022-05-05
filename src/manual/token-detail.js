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
        const addresses = tokens.slice[idx, idx + 100];
        const { names, symbols, decimals } = await getTokenMetadata(addresses);
        for (let i = 0; i < addresses.length; i++) {
            if (symbols[i] == '') continue;
            writer.write(`${addresses[i]},${decimals[i]},${symbols[i]},${names[i]}\n`);
        }
        idx = idx + 100;
        console.log(`Get metadata [${idx}](${Date.now() - startMs})`);x
    }
    writer.end();
}

updateDetailFile();