const express = require("express");
const BlockModel = require("./block");
const TokenModel = require("./token");
const SyncModel = require("./sync");
const { ContractAddress, getAddress } = require('../utils/bsc');

const app = express();
const blockModel = new BlockModel();
const tokenModel = new TokenModel();
const syncModel = new SyncModel(tokenModel);
app.use(express.json());

function getStartTsOfDay(n) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const rs = [];
    let ts = start.getTime();
    for (let i = 0; i < n; i++) {
        rs.push(ts);
        ts -= 60 * 60 * 24 * 1000;
    }
    return rs.reverse();
}

app.get('/api/v1/search', async (req, res) => {
    const rs = tokenModel.searchToken(req.query.q);
    res.json(rs);
})

app.get('/api/v1/pool/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const name = (await tokenModel.getToken(token)).name
    const ts = getStartTsOfDay(7)
    const block = ts.map(ms => blockModel.estimateBlock(ms));
    const data = (await syncModel.getLiquidityHistory(token, block)).map((p, i) => {
        return {
            date: ts[i] * 1000,
            price: p[2],
            totalAmount: p[3].substr(0, p[3].length - 18),
        }
    });
    const lq = syncModel.getLiquidity(token);
    const pools = [];
    for (let pool in lq) {
        pools.push({
            name: name + "-" + (await tokenModel.getToken(getAddress(pool))).name,
            liquidity: lq[pool][0].substr(0, lq[pool][0].length - 18),
        })
    }
    res.json({ data, pools });
})

// internal api
app.get('/block/estimate', (req, res) => {
    const rs = blockModel.estimateBlock(req.query.ts);
    res.json(rs);
})

app.get('/block/startofday', (req, res) => {
    const ts = getStartTsOfDay(req.query.n)
    const block = ts.map(ms => blockModel.estimateBlock(ms));
    res.json({ ts, block });
})

app.get('/info/token', async (req, res) => {
    const rs = await Promise.all(req.query.a.split(",").map(a => tokenModel.getToken(a)));
    res.json(rs);
})

app.get('/info/lp', async (req, res) => {
    const rs = await Promise.all(req.query.a.split(",").map(a => tokenModel.getToken01(a)));
    res.json(rs);
})

app.get('/liquidity/history', async (req, res) => {
    const ts = getStartTsOfDay(req.query.n)
    const block = ts.map(ms => blockModel.estimateBlock(ms));
    const rs = await syncModel.getLiquidityHistory(req.query.a, block, req.query.d === 'true');
    res.json(rs);
})

app.get('/liquidity/now', async (req, res) => {
    const rs = syncModel.getLiquidity(req.query.a);
    res.json(rs);
})

app.get('/price/history', async (req, res) => {
    const ts = getStartTsOfDay(req.query.n)
    const block = ts.map(ms => blockModel.estimateBlock(ms));
    const rs = await syncModel.getPriceHistory(req.query.a, ContractAddress.BUSD, block);
    res.json(rs);
})

app.get('/price/now', async (req, res) => {
    const price = syncModel.getPrice(req.query.a);
    const bnbPrice = syncModel.getPrice(ContractAddress.WBNB);
    res.json({ address: req.query.a, price, bnbPrice });
})

async function start(port) {
    const startMs = Date.now();

    await blockModel.loadLogFile();
    blockModel.run(60 * 60 * 1000);

    await tokenModel.loadLpDetailFile();
    await tokenModel.loadTokenDetailFile();

    await syncModel.warmup();
    await syncModel.run();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9610);