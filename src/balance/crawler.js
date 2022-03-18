const fs = require("fs");
const Web3 = require("web3");

const endpoint = "https://bsc-dataseed.binance.org";
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const cakeAddress = '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82';
const opts = { flags: "a" };

const web3 = new Web3(endpoint);

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const BUSD = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56';
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const CAKE = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';

const IGNORE = [WBNB, BUSD, USDT, CAKE];

let writer = {};
let lastFileIdx = 0;

function getWriter(token, idx) {
    if (!writer[token]) {
        fs.mkdirSync(`db/transfer/${token}`, { recursive: true });
        writer[token] = fs.createWriteStream(`db/transfer/${token}/${idx}.log`, opts);
    }
    return writer[token];
}

async function crawlLogs(fromBlock, toBlock) {
    const fileIdx = Math.floor(fromBlock / 100000);
    if (fileIdx != lastFileIdx) {
        for (let a in writer) writer[a].end();
        writer = {};
        lastFileIdx = fileIdx;
    }

    const startMs = Date.now();
    const pastLogs = await web3.eth.getPastLogs({
        fromBlock,
        toBlock,
        topics: [transferTopic],
    })

    for (let log of pastLogs) {
        if (IGNORE.includes(log.address)) continue;
        const fileLog = getWriter(log.address, fileIdx);
        const value = web3.eth.abi.decodeParameters(['uint256'], log.data)
        const from = web3.eth.abi.decodeParameters(['address'], log.topics[1])
        const to = web3.eth.abi.decodeParameters(['address'], log.topics[2])
        fileLog.write(`${log.blockNumber},${log.transactionIndex},${log.logIndex},${from[0]},${to[0]},${value[0].toString(10)}\n`);
    }
    const ms = Date.now() - startMs;
    console.log(`Crawl [${fromBlock}-${toBlock}]: ${pastLogs.length} (${ms}ms)`)
    if (ms < 2000) await sleep(2000 - ms);
    return pastLogs.length;
}

async function run() {
    let from = 0;
    let batchSize = 100;
    while (from < 16165330) {
        try {
            const size = await crawlLogs(from, from + batchSize - 1);
            if (size > 100000) batchSize = Math.round(batchSize / 20);
            else if (size > 10000) batchSize = Math.round(batchSize / 2);
            else if (size < 50000) batchSize = batchSize * 2;
            if (batchSize < 10) batchSize = 10;
        } catch (err) { console.log(`Error ${from}:`, err) }
        from += batchSize;
    }
}

run();