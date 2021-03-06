const fs = require("fs");
const axios = require("axios");

const { web3, ContractAddress } = require('../utils/bsc');
const { Partitioner } = require('../utils/io');

const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const swapTopic = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const syncTopic = '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1';

const opts = { flags: "a" };

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

let writer = {};
let lastFileIdx = 0;

function getSyncWriter(token, idx) {
    if (!writer[token]) {
        fs.mkdirSync(`db/lpsync/${token}`, { recursive: true });
        writer[token] = fs.createWriteStream(`db/lpsync/${token}/${idx}`, opts);
    }
    return writer[token];
}

async function writeSyncLog(block, txIdx, logIdx, lpToken, reserve0, reserve1) {
    try {
        const idx = Math.floor(block / Partitioner.BPF);
        getSyncWriter(lpToken, idx).write(`${block},${txIdx},${logIdx},${reserve0},${reserve1}\n`);
    } catch (err) { console.log(`Error`, block, txIdx, logIdx, lpToken, reserve0, reserve1, err.toString()) }
}

function getSwapWriter(token, idx) {
    if (!writer[token]) {
        fs.mkdirSync(`db/lpswap/${token}`, { recursive: true });
        writer[token] = fs.createWriteStream(`db/lpswap/${token}/${idx}`, opts);
    }
    return writer[token];
}

async function writeSwapLog(block, txIdx, logIdx, lpToken, from, to, in0, in1, out0, out1) {
    try {
        const idx = Math.floor(block / Partitioner.BPF);
        if (from == ContractAddress.PANCAKE_ROUTER) from = "ROUTER";
        if (to == ContractAddress.PANCAKE_ROUTER) to = "ROUTER";
        getSwapWriter(lpToken, idx).write(`${block},${txIdx},${logIdx},${from},${to},${in0},${in1},${out0},${out1}\n`);
    } catch (err) { console.log(`Error`, block, txIdx, logIdx, lpToken, from, to, in0, in1, out0, out1, err.toString()) }
}

async function crawlLogs(fromBlock, toBlock) {
    const fileIdx = Math.floor(fromBlock / Partitioner.BPF);
    if (fileIdx != lastFileIdx) {
        for (let a in writer) writer[a].end();
        writer = {};
        lastFileIdx = fileIdx;
    }

    const startMs = Date.now();
    const pastLogs = await web3.eth.getPastLogs({
        fromBlock,
        toBlock,
        topics: [syncTopic],
    })

    for (let log of pastLogs) {
        try {
            // const values = web3.eth.abi.decodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], log.data)
            // const from = web3.eth.abi.decodeParameters(['address'], log.topics[1])
            // const to = web3.eth.abi.decodeParameters(['address'], log.topics[2])
            // writeSwapLog(log.blockNumber, log.transactionIndex, log.logIndex, log.address, from[0], to[0], values[0].toString(10), values[1].toString(10), values[2].toString(10), values[3].toString(10));
            const values = web3.eth.abi.decodeParameters(['uint256', 'uint256'], log.data)
            await writeSyncLog(log.blockNumber, log.transactionIndex, log.logIndex, log.address, values[0].toString(10), values[1].toString(10));
        } catch (err) {
            console.log(`Write log error`, log, err);
        }
    }
    const ms = Date.now() - startMs;
    console.log(`Crawl [${fromBlock}-${toBlock}]: ${pastLogs.length} (${ms}ms)`)
    if (ms < 1000) await sleep(1000 - ms);
    return ms;
}

async function run() {
    const iid = parseInt(process.env.IID_OFFSET);
    let from = iid * 1000000;
    let batchSize = 1000;
    let ms = 0;
    while (from < ((iid + 1) * 1000000 - 1)) {
        try {
            ms = await crawlLogs(from, from + batchSize - 1);
            from += batchSize;
            if (ms < 2000 && batchSize < 1500) batchSize += 50
            else if (ms > 5000 && batchSize > 50) batchSize -= 50;
        } catch (err) {
            if (ms > 5000 && batchSize > 50) batchSize -= 50;
            console.log(`Error ${from}: ${err}`)
            await sleep(2000);
        }
    }
}

run();