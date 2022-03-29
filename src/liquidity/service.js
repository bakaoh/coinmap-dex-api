const express = require("express");
const axios = require("axios");

const SyncModel = require("./sync");
const SwapModel = require("./swap");
const PairModel = require("./pair");
const { getCache } = require("../cache");
const { getAddress, ContractAddress, toBN } = require('../utils/bsc');
const { getNumber } = require('../utils/format');

const COMMON_BASE = 'http://128.199.189.253:9610';

const app = express();
const syncModel = new SyncModel();
const swapModel = new SwapModel();
const pairModel = new PairModel();
app.use(express.json());

app.get('/api/v1/pool/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const n = 10;
    const data = await getCache(`poolhistory-${token}`, async () => {
        const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=${n}`)).data;
        const pools = pairModel.getPools(token);
        let pricePool;
        for (let pair in pools) {
            pools[pair].history = await syncModel.getReservesHistory(pair, block, pools[pair].token0 == token);
            if (pools[pair].token1 == ContractAddress.BUSD) pricePool = pools[pair];
        }
        return ts.map((date, i) => {
            let totalToken = toBN(0);
            for (let pair in pools) {
                totalToken = totalToken.add(toBN(pools[pair].history[i][0]));
            }
            const [reserve0, reserve1] = pricePool.history[i];
            const price = reserve0 == "0" ? toBN(0) : toBN(reserve1).muln(100000).div(toBN(reserve0))
            return { date: Math.round(date / 1000), price: parseInt(price.toString(10)) / 100000, totalAmount: getNumber(totalToken.mul(price).divn(100000).toString(10)) };
        });
    });

    const pools = (await syncModel.getPools(token, pairModel.getPools(token))).slice(0, 3);
    res.json({ data, pools });
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