const express = require("express");

const BlockModel = require("./block");
const TokenModel = require("./token");
const SyncModel = require("./sync");
const PairModel = require("./pair");
const { getCache } = require("../cache");
const { ContractAddress, getAddress } = require('../utils/bsc');
const { getNumber } = require('../utils/format');

const app = express();
const blockModel = new BlockModel();
const tokenModel = new TokenModel();
const syncModel = new SyncModel();
const pairModel = new PairModel();
app.use(express.json());

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
    res.json(rs);
})

app.get('/api/v1/pool/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const symbol = (await tokenModel.getToken(token)).symbol
    const price = syncModel.getPrice(token);

    const data = await getCache(`poolhistory-${token}`, async () => {
        const { ts, block } = getStartTsOfDay(10)
        return (await syncModel.getLiquidityHistory(token, block)).map((p, i) => {
            return { date: ts[i], price: p[2], totalAmount: getNumber(p[3]) }
        });
    });
    const lq = syncModel.getLiquidity(token);
    let pools = [];
    for (let pool in lq) {
        pools.push({ address: pool, reserve0: getNumber(lq[pool][0]), reserve1: getNumber(lq[pool][1]), })
    }
    pools = pools.sort((a, b) => b.reserve0 - a.reserve0).slice(0, 3).map(pool => ({
        name: symbol + "/" + tokenModel.getTokenSync(pool.address).symbol,
        liquidity: pool.reserve0 * price,
        reserve0: pool.reserve0,
        reserve1: pool.reserve1,
    }))
    res.json({ data, pools });
})

app.get('/route/:tokenA/:tokenB', async (req, res) => {
    const tokenA = getAddress(req.params.tokenA);
    const tokenB = getAddress(req.params.tokenB);
    const rs = syncModel.getPath(tokenA, tokenB, req.query.in);
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

app.get('/info/lp', async (req, res) => {
    const rs = await Promise.all(req.query.a.split(",").map(a => tokenModel.getToken01(a)));
    res.json(rs);
})

app.get('/liquidity/history', async (req, res) => {
    const { block } = getStartTsOfDay(req.query.n)
    const rs = await syncModel.getLiquidityHistory(req.query.a, block);
    res.json(rs);
})

app.get('/liquidity/now', async (req, res) => {
    const rs = syncModel.getLiquidity(req.query.a);
    res.json(rs);
})

app.get('/price/history', async (req, res) => {
    const { block } = getStartTsOfDay(req.query.n)
    const rs = await syncModel.getPriceHistory(req.query.a, ContractAddress.BUSD, block);
    res.json(rs);
})

app.get('/price/now', async (req, res) => {
    const price = syncModel.getPrice(req.query.a);
    const bnbPrice = syncModel.getPrice(ContractAddress.WBNB);
    res.json({ address: req.query.a, price, bnbPrice });
})

app.get('/pools/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const pools = pairModel.getPools(token);
    const rs = [];
    for (let pool of pools) {
        const reserves = await syncModel.getReserves(pool.pair);
        if (reserves[0] == "0" || reserves[1] == "0") continue;
        rs.push({ reserves, ...pool });
    }
    res.json(rs);
})

async function start(port) {
    const startMs = Date.now();

    // await blockModel.loadLogFile();
    // blockModel.run(60 * 60 * 1000);

    // await tokenModel.loadLpDetailFile();
    // await tokenModel.loadTokenDetailFile();

    await syncModel.warmup();
    await syncModel.run();

    await pairModel.load();
    await pairModel.run();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9610);