const fs = require("fs");
const Web3 = require("web3");

const batchSize = 1000;
const endpoint = "https://bsc-dataseed.binance.org";
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const cakeAddress = '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82';
const opts = { flags: "a" };

const web3 = new Web3(endpoint);

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function crawlLogs(fromBlock, toBlock) {
    const fileIdx = Math.floor(fromBlock / 100000);
    const fileLog = fs.createWriteStream(`logs/cake-${fileIdx}.log`, opts);

    const startMs = Date.now();
    const pastLogs = await web3.eth.getPastLogs({
        fromBlock,
        toBlock,
        address: cakeAddress,
        topics: [transferTopic],
    })

    for (let log of pastLogs) {
        const value = web3.eth.abi.decodeParameters(['uint256'], log.data)
        const from = web3.eth.abi.decodeParameters(['address'], log.topics[1])
        const to = web3.eth.abi.decodeParameters(['address'], log.topics[2])
        fileLog.write(`${log.blockNumber},${from[0]},${to[0]},${value[0].toString(10)}\n`);
    }
    fileLog.end();
    const ms = Date.now() - startMs;
    console.log(`Crawl [${fromBlock}-${toBlock}]: ${pastLogs.length} (${ms}ms)`)
    if (ms < 2000) await sleep(2000 - ms);
}

async function run() {
    let from = 1000000;
    while (from < 16103000) {
        try {
            await crawlLogs(from, from + batchSize - 1);
        } catch (err) { console.log(`Error ${from}:`, err) }
        from += batchSize;
    }
}

run();