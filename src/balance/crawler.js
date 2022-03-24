const fs = require("fs");
const axios = require("axios");

const { web3, ContractAddress } = require('../utils/bsc');

const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const swapTopic = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';

const opts = { flags: "a" };

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

let writer = {};
let lastFileIdx = 0;

const COMMON_BASE = 'http://128.199.189.253:9610';

const cacheLP = {};

async function getToken01(lpToken) {
    if (!cacheLP[lpToken]) {
        try {
            const lps = (await axios.get(`${COMMON_BASE}/info/lp?a=${lpToken}`)).data;
            cacheLP[lpToken] = lps[0];
        } catch (err) {
            cacheLP[lpToken] = { token0: "", token1: "" };
        }
    }
    return cacheLP[lpToken];
}

async function writeSwapLog(block, txIdx, logIdx, lpToken, from, to, in0, in1, out0, out1) {
    try {
        const { token0, token1 } = await getToken01(lpToken);
        if (token0 == "" || token1 == "") return;
        const idx = Math.floor(block / 100000);
        if (from == ContractAddress.PANCAKE_ROUTER) from = "ROUTER";
        if (to == ContractAddress.PANCAKE_ROUTER) to = "ROUTER";
        if (in0 == '0') {
            // BUY TOKEN 0, SELL TOKEN 1
            getWriter(token0, idx).write(`${block},${txIdx},${logIdx},BUY,${token1},${from},${to},${out0},${in1}\n`);
            getWriter(token1, idx).write(`${block},${txIdx},${logIdx},SELL,${token0},${from},${to},${in1},${out0}\n`);
        } else {
            // SELL TOKEN 0, BUY TOKEN 1
            getWriter(token0, idx).write(`${block},${txIdx},${logIdx},SELL,${token1},${from},${to},${in0},${out1}\n`);
            getWriter(token1, idx).write(`${block},${txIdx},${logIdx},BUY,${token0},${from},${to},${out1},${in0}\n`);
        }
    } catch (err) { console.log(`Error`, block, txIdx, logIdx, lpToken, from, to, in0, in1, out0, out1, err.toString()) }
}

function getWriter(token, idx) {
    if (!writer[token]) {
        fs.mkdirSync(`cake/db/transfer/${token}`, { recursive: true });
        writer[token] = fs.createWriteStream(`cake/db/transfer/${token}/${idx}.log`, opts);
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
        topics: [swapTopic],
    })

    for (let log of pastLogs) {
        try {
            const values = web3.eth.abi.decodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], log.data)
            const from = web3.eth.abi.decodeParameters(['address'], log.topics[1])
            const to = web3.eth.abi.decodeParameters(['address'], log.topics[2])
            writeSwapLog(log.blockNumber, log.transactionIndex, log.logIndex, log.address, from[0], to[0], values[0].toString(10), values[1].toString(10), values[2].toString(10), values[3].toString(10));
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