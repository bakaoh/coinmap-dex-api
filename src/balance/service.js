const express = require("express");
const axios = require("axios");
const Web3 = require("web3");

const BalanceModel = require("./balance");
const BlockModel = require("./block");
const TokenModel = require("./token");

const { getCache } = require("../cache");
const { ContractAddress, getAddress, isUSD } = require('../utils/bsc');
const { getNumber } = require('../utils/format');

const app = express();
const balanceModel = new BalanceModel();
const blockModel = new BlockModel();
const tokenModel = new TokenModel();

app.use(express.json());

const COMMON_BASE = 'http://128.199.189.253:9610';
const SWAP_BASE = 'http://128.199.189.253:9611';

function getStartTsOfDay(n) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    let ts = [];
    let t = start.getTime();
    for (let i = 0; i < n; i++) {
        ts.push(t);
        t -= 60 * 60 * 24 * 1000;
    }
    ts = ts.reverse();
    const block = ts.map(ms => blockModel.estimateBlock(ms));
    return { ts, block }
}

app.get('/api/v1/search', async (req, res) => {
    const rs = tokenModel.searchToken(req.query.q);
    for (let t of rs) {
        try {
            t.logo = `https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/${t.address}/logo.png`;
            t.holder = parseInt((await balanceModel.getTotalHolders(t.address, 1))[0].total);
        } catch (err) { }
    }
    res.json(rs);
})

app.get('/api/v1/holder/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const rs = await getCache(`holder-${token}`, async () => {
        const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=30`)).data;
        return (await balanceModel.getTotalHolders(token, 30)).map((p, i) => ({
            date: ts[i],
            num: parseInt(p.total),
        }));
    });
    res.json(rs);
})

app.get('/api/v1/shark/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const rs = await getCache(`shark-${token}`, async () => {
        const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=8`)).data;
        const data = await balanceModel.getSharkHistory(token, block);
        const swapData = (await axios.get(`${SWAP_BASE}/api/v1/shark/${token}`)).data;
        return swapData.map((p, i) => ({
            date: ts[i],
            totalBalance: getNumber(data[i].totalToken.toString(10)),
            totalTransaction: getNumber(data[i].totalAction.toString(10)),
            totalTransactionHighValue: p.totalTransactionHighValue,
        }));
    });
    res.json(rs);
})

// internal api
app.get('/block/estimate', (req, res) => {
    const rs = blockModel.estimateBlock(req.query.ts);
    res.json(rs);
})

app.get('/block/startofday', (req, res) => {
    const { ts, block } = getStartTsOfDay(req.query.n)
    res.json({ ts, block });
})

app.get('/info/token', async (req, res) => {
    const rs = await Promise.all(req.query.a.split(",").map(a => tokenModel.getToken(a)));
    res.json(rs);
})

async function start(port) {
    const startMs = Date.now();

    await blockModel.loadLogFile();
    blockModel.run(60 * 60 * 1000);
    await tokenModel.loadTokenDetailFile();
    await balanceModel.run();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9612);