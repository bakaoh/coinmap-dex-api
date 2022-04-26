const express = require("express");
const axios = require("axios");

const SyncModel = require("./sync");
const SwapModel = require("./swap");
const PairModel = require("./pair");
const { getCache } = require("../cache");
const { getAddress, ContractAddress, toBN, isUSD } = require('../utils/bsc');
const { getNumber } = require('../utils/format');

const COMMON_BASE = 'http://10.148.0.33:9612';

const app = express();
const pairModel = new PairModel();
const syncModel = new SyncModel();
const swapModel = new SwapModel(pairModel);
app.use(express.json());

const symbolCache = {};
const getSymbol = async (token) => {
    if (!symbolCache[token]) {
        const { symbol } = (await axios.get(`${COMMON_BASE}/info/token?a=${token}`)).data[0];
        symbolCache[token] = symbol;
    }
    return symbolCache[token];
};

app.get('/route/:tokenA/:tokenB', async (req, res) => {
    const tokenA = getAddress(req.params.tokenA);
    const tokenB = getAddress(req.params.tokenB);
    const rs = await syncModel.getPath(
        tokenA, tokenB,
        pairModel.getPools(tokenA), pairModel.getPools(tokenB),
        req.query.in);
    res.json(rs);
})

app.get('/api/v1/pool/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const { tokenPrice, pools } = (await syncModel.getPools(token, pairModel.getPools(token)));
    const symbol = await getSymbol(token);

    const data = await getCache(`poolhistory-${token}`, async () => {
        const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=10`)).data;
        let pricePool;
        for (let pool of pools) {
            pool.history = await syncModel.getReservesHistory(pool.pair, block, pool.token0 == token);
            if (!pricePool && (isUSD(pool.token1))) pricePool = pool;
        }
        return ts.map((date, i) => {
            let totalToken = toBN(0);
            for (let pool of pools) {
                totalToken = totalToken.add(toBN(pool.history[i][0]));
            }
            const price = syncModel.calcPrice(pricePool.history[i]);
            return { date: Math.round(date / 1000), price, totalAmount: getNumber(totalToken.toString(10)) * price };
        });
    });

    const details = pools.slice(0, 3);
    for (let p of details) {
        p.name = symbol + "/" + (await getSymbol(p.token0 == token ? p.token1 : p.token0));
        p.liquidity = getNumber(p.token0 == token ? p.reserve0 : p.reserve1) * tokenPrice;
        p.reserve0 = getNumber(p.reserve0);
        p.reserve1 = getNumber(p.reserve1);
    }

    res.json({ data, pools: details });
})

app.get('/api/v1/volume/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const rs = await getCache(`volume-${token}`, async () => {
        const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=8`)).data;
        return (await swapModel.getVolumeHistory(token, block)).map((p, i) => ({
            date: ts[i],
            totalTransaction: getNumber(p[1]),
            totalAmountSell: getNumber(p[2]),
            totalAmountBuyByNewWallet: getNumber(p[3]),
        }));
    });
    res.json(rs);
})

async function start(port) {
    const startMs = Date.now();

    await pairModel.warmup();
    await pairModel.runCrawler();
    await syncModel.runCrawler();
    await swapModel.runCrawler();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9613);