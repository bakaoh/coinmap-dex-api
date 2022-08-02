const express = require("express");
const axios = require("axios");

const BalanceModel = require("./balance");
const BlockModel = require("./block");
const TokenModel = require("./token");

const { getCache } = require("../cache");
const { ContractAddress, getAddress, isUSD } = require('../utils/bsc');
const { getNumber } = require('../utils/format');

const app = express();
const blockModel = new BlockModel();
const tokenModel = new TokenModel();
const balanceModel = new BalanceModel(tokenModel);

app.use(express.json());

const LIQUIDITY_BASE = 'http://10.148.0.34:9613';

function getStartTsOfDay(n) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    let ts = [];
    let t = Math.round(start.getTime() / 1000);
    for (let i = 0; i < n; i++) {
        ts.push(t);
        t -= 60 * 60 * 24;
    }
    ts = ts.reverse();
    const block = ts.map(s => blockModel.estimateBlock(s));
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
        const { ts, block } = getStartTsOfDay(30);
        return (await balanceModel.getTotalHolders(token, 30)).map((p, i) => ({
            date: ts[i],
            num: parseInt(p.total),
        }));
    });
    res.json(rs);
})

app.get('/api/v1/inflation/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const rs = await getCache(`inflation-${token}`, async () => {
        let rate = (await balanceModel.getInflationary(token));
        if (rate != '0') {
            const { decimals } = await tokenModel.getToken(token);
            rate = getNumber(rate, 0, parseInt(decimals))
        }
        return { inflationary: (rate != '0'), rate };
    });
    res.json(rs);
})

app.get('/api/v1/shark/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const { decimals } = await tokenModel.getToken(token);
    const rs = await getCache(`shark-${token}`, async () => {
        const { ts, block } = getStartTsOfDay(8);
        const data = await balanceModel.getSharkHistory(token, block);
        const bigtx = (await axios.get(`${LIQUIDITY_BASE}/api/v1/bigtx/${token}`)).data;
        return bigtx.map((p, i) => ({
            date: ts[i],
            totalBalance: getNumber(data[i].totalToken.toString(10), 0, parseInt(decimals)),
            totalTransaction: getNumber(data[i].totalAction.toString(10), 0, parseInt(decimals)),
            totalTransactionHighValue: p.total,
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