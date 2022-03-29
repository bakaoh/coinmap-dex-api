const express = require("express");
const axios = require("axios");

const SyncModel = require("./sync");
const SwapModel = require("./swap");
const PairModel = require("./pair");
const { getCache } = require("../cache");
const { getAddress, ContractAddress, toBN, isUSD } = require('../utils/bsc');
const { getNumber } = require('../utils/format');

const COMMON_BASE = 'http://128.199.189.253:9610';

const app = express();
const syncModel = new SyncModel();
const swapModel = new SwapModel();
const pairModel = new PairModel();
app.use(express.json());

app.get('/api/v1/pool/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const { tokenPrice, pools } = (await syncModel.getPools(token, pairModel.getPools(token)));

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
            return { date: Math.round(date / 1000), price, totalAmount: getNumber(totalToken) * price };
        });
    });

    res.json({
        data,
        pools: pools.slice(0, 3).map(pool => ({
            name: pool.pair,
            liquidity: getNumber(pool.token0 == token ? reserve0 : reserve1) * tokenPrice,
            reserve0: getNumber(pool.reserve0),
            reserve1: getNumber(pool.reserve1)
        }))
    });
})

async function start(port) {
    const startMs = Date.now();

    await syncModel.runCrawler();
    await swapModel.runCrawler();
    await pairModel.warmup();
    await pairModel.runCrawler();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9613);