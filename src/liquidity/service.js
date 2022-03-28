const express = require("express");
const axios = require("axios");

const SyncModel = require("./sync");
const PairModel = require("./pair");
const { getCache } = require("../cache");
const { getAddress, isUSD, toBN } = require('../utils/bsc');
const { getNumber } = require('../utils/format');

const COMMON_BASE = 'http://128.199.189.253:9610';

const app = express();
const syncModel = new SyncModel();
const pairModel = new PairModel();
app.use(express.json());

// app.get('/api/v1/pool/:token', async (req, res) => {
//     const token = getAddress(req.params.token);
//     const symbol = (await tokenModel.getToken(token)).symbol
//     const price = syncModel.getPrice(token);

//     const data = await getCache(`poolhistory-${token}`, async () => {
//         const { ts, block } = getStartTsOfDay(10)
//         return (await syncModel.getLiquidityHistory(token, block)).map((p, i) => {
//             return { date: ts[i], price: p[2], totalAmount: getNumber(p[3]) }
//         });
//     });
//     const lq = syncModel.getLiquidity(token);
//     let pools = [];
//     for (let pool in lq) {
//         pools.push({ address: pool, reserve0: getNumber(lq[pool][0]), reserve1: getNumber(lq[pool][1]), })
//     }
//     pools = pools.sort((a, b) => b.reserve0 - a.reserve0).slice(0, 3).map(pool => ({
//         name: symbol + "/" + tokenModel.getTokenSync(pool.address).symbol,
//         liquidity: pool.reserve0 * price,
//         reserve0: pool.reserve0,
//         reserve1: pool.reserve1,
//     }))
//     res.json({ data, pools });
// })

app.get('/api/v1/pool/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const n = 10;
    const data = await getCache(`poolhistory-${token}`, async () => {
        const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=${n}`)).data;
        const pools = pairModel.getPools(token);
        let pricePool;
        for (let pool of pools) {
            pool.history = await syncModel.getReservesHistory(pool.pair, block, pool.token0 == token);
            if (isUSD(pool.token1) && pool.history[n - 2][1].length > 20) pricePool = pool;
        }
        return ts.map((date, i) => {
            let totalToken = toBN(0);
            for (let pool of pools) {
                totalToken = totalToken.add(toBN(pool.history[i][0]));
            }
            const [reserve0, reserve1] = pricePool.history[i];
            const price = reserve0 == "0" ? toBN(0) : toBN(reserve1).muln(100000).div(toBN(reserve0))
            return { date: Math.round(date / 1000), price: parseInt(price.toString(10)) / 100000, totalAmount: getNumber(totalToken.mul(price).divn(100000).toString(10)) };
        });
    });

    let pools = pairModel.getPools(token);
    for (let pool of pools) {
        const reserves = await syncModel.getReserves(pool.pair);
        const [reserve0, reserve1] = pool.token0 == token ? reserves : reserves.reverse();
        if (pool.token0 == token) {
            pool.reserve0 = getNumber(reserve0);
            pool.reserve1 = getNumber(reserve1);
        } else {
            pool.reserve0 = getNumber(reserve1);
            pool.reserve1 = getNumber(reserve0);
        }
    }
    pools = pools.sort((a, b) => b.reserve0 - a.reserve0).slice(0, 3).map(pool => ({
        name: pool.pair,
        liquidity: pool.reserve0 * data[n - 1].price,
        reserve0: pool.reserve0,
        reserve1: pool.reserve1,
    }))
    res.json({ data, pools });
})

app.get('/pools/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const pools = pairModel.getPools(token);
    const rs = [];
    for (let pool of pools) {
        const reserves = await syncModel.getReserves(pool.pair);
        if (reserves[0] == "0" || reserves[1] == "0") continue;
        rs.push({ ...pool, reserves });
    }
    res.json(rs);
})

async function start(port) {
    const startMs = Date.now();

    await syncModel.runCrawler();

    await pairModel.warmup();
    await pairModel.runCrawler();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9613);