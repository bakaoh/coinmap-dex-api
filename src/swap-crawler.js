const fs = require("fs");
const Web3 = require("web3");

const batchSize = 100;
const endpoint = "https://bsc-dataseed.binance.org";
const swapTopic = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const syncTopic = '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1';
const routerAddress = '0x10ed43c718714eb63d5aa57b78b54704e256024e';
const opts = { flags: "a" };

const web3 = new Web3(endpoint);

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function crawlSwapLogs(fromBlock, toBlock) {
    const fileIdx = Math.floor(fromBlock / 100000);
    const swapLog = fs.createWriteStream(`logs/swap-${fileIdx}.log`, opts);

    const startMs = Date.now();
    const pastLogs = await web3.eth.getPastLogs({
        fromBlock,
        toBlock,
        // address: routerAddress,
        topics: [swapTopic],
    })

    for (let log of pastLogs) {
        const values = web3.eth.abi.decodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], log.data)
        const from = web3.eth.abi.decodeParameters(['address'], log.topics[1])
        const to = web3.eth.abi.decodeParameters(['address'], log.topics[2])
        swapLog.write(`${log.blockNumber},${log.address},${from[0]},${to[0]},${values[0].toString(10)},${values[1].toString(10)},${values[2].toString(10)},${values[3].toString(10)}\n`);
    }
    swapLog.end();
    const ms = Date.now() - startMs;
    console.log(`Crawl swap logs [${fromBlock}-${toBlock}]: ${pastLogs.length} (${ms}ms)`)
    if (ms < 2000) await sleep(2000 - ms);
}


async function crawlSyncLogs(fromBlock, toBlock) {
    const fileIdx = Math.floor(fromBlock / 100000);
    const syncLog = fs.createWriteStream(`logs/sync-${fileIdx}.log`, opts);

    const startMs = Date.now();
    const pastLogs = await web3.eth.getPastLogs({
        fromBlock,
        toBlock,
        // address: routerAddress,
        topics: [syncTopic],
    })

    for (let log of pastLogs) {
        const values = web3.eth.abi.decodeParameters(['uint256', 'uint256'], log.data)
        syncLog.write(`${log.blockNumber},${log.address},${values[0].toString(10)},${values[1].toString(10)}\n`);
    }
    syncLog.end();
    const ms = Date.now() - startMs;
    console.log(`Crawl sync logs [${fromBlock}-${toBlock}]: ${pastLogs.length} (${ms}ms)`)
    if (ms < 2000) await sleep(2000 - ms);
}

async function run() {
    let from = 15000000;
    while (from < 16103000) {
        try {
            await crawlSwapLogs(from, from + batchSize - 1);
        } catch (err) { console.log(`Error ${from}:`, err) }
        from += batchSize;
    }
    let from = 15000000;
    while (from < 16103000) {
        try {
            await crawlSyncLogs(from, from + batchSize - 1);
        } catch (err) { console.log(`Error ${from}:`, err) }
        from += batchSize;
    }
}

run();