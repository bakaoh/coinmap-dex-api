const express = require("express");
const axios = require("axios");

const SyncModel = require("./sync");
const SwapModel = require("./swap");
const PairModel = require("./pair");
const { getCache } = require("../cache");
const { getAddress, ContractAddress, toBN, isUSD, getFactoryName } = require('../utils/bsc');
const { getNumber } = require('../utils/format');

const COMMON_BASE = 'http://10.148.0.39:9612';

const app = express();
const pairModel = new PairModel();
const syncModel = new SyncModel();
const swapModel = new SwapModel(pairModel);
app.use(express.json());

const tokenCache = {};
const getToken = async (token) => {
    if (!tokenCache[token]) {
        tokenCache[token] = (await axios.get(`${COMMON_BASE}/info/token?a=${token}`)).data[0];
        tokenCache[token].decimals = parseInt(tokenCache[token].decimals);
    }
    return tokenCache[token];
};

app.get('/api/v1/pool/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const { symbol, decimals } = (await getToken(token));
    const { tokenPrice, pools, pricePool } = (await syncModel.getPools(token, pairModel.getPools(token), decimals));

    const data = await getCache(`poolhistory-${token}`, async () => {
        const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=10`)).data;
        for (let pool of pools) {
            pool.history = await syncModel.getReservesHistory(pool.pair, block, pool.token0 == token);
        }
        let quotePrice = 1;
        if (pricePool && token != ContractAddress.WBNB && (pricePool.token0 == ContractAddress.WBNB || pricePool.token1 == ContractAddress.WBNB)) quotePrice = await syncModel.getBNBPrice()
        return ts.map((date, i) => {
            let totalToken = toBN(0);
            for (let pool of pools) {
                totalToken = totalToken.add(toBN(pool.history[i][0]));
            }
            const price = syncModel.calcPrice(pricePool.history[i], decimals) * quotePrice;
            return { date, price, totalAmount: getNumber(totalToken.toString(10), 0, decimals) * price };
        });
    });

    const details = pools.slice(0, 3);
    for (let p of details) {
        p.name = symbol + "/" + (await getToken(p.token0 == token ? p.token1 : p.token0)).symbol;
        p.liquidity = getNumber(p.token0 == token ? p.reserve0 : p.reserve1, 0, decimals) * tokenPrice;
        p.reserve0 = getNumber(p.reserve0);
        p.reserve1 = getNumber(p.reserve1);
        p.exchange = getFactoryName(p.factory);
    }

    res.json({ data, pools: details });
})

app.get('/api/v1/volume/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const { decimals } = await getToken(token);
    const rs = await getCache(`volume-${token}`, async () => {
        const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=8`)).data;
        return (await swapModel.getVolumeHistory(token, block)).map((p, i) => ({
            date: ts[i],
            totalTransaction: getNumber(p[1], 0, decimals),
            totalAmountSell: getNumber(p[2], 0, decimals),
            totalAmountBuyByNewWallet: getNumber(p[3], 0, decimals),
        }));
    });
    res.json(rs);
})

app.get('/api/v1/transaction/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const buyOrder = [], sellOrder = [], transaction = [];
    const lastTx = await swapModel.getLastTx(token, 30);
    const bnbPriceBN = toBN(Math.round(await syncModel.getBNBPrice()));
    const { decimals } = await getToken(token);
    const { tokenPrice } = (await syncModel.getPools(token, pairModel.getPools(token), decimals));
    let price = tokenPrice;
    const dd = toBN(10).pow(toBN(18 - decimals));
    lastTx.forEach(tx => {
        if (tx.amount0 == "0") return;
        const amount0BN = toBN(tx.amount0);
        let txTotal;
        if (tx.amountUSD != "0") {
            txTotal = toBN(tx.amountUSD);
        } else if (tx.amountBNB != "0") {
            txTotal = toBN(tx.amountBNB).mul(bnbPriceBN);
        } else return;
        const newprice = parseInt(txTotal.muln(100000).div(amount0BN).div(dd).toString(10)) / 100000;
        if (Math.abs(price - newprice) * 5 > price) return;
        price = newprice;
        const item = {
            price,
            total: getNumber(txTotal.toString(10), 5),
            amount: getNumber(tx.amount0, 5, decimals),
            from: tx.from,
            type: tx.bs,
        }
        transaction.push(item);
        (tx.bs == "SELL" ? sellOrder : buyOrder).push(item);
    });
    res.json({ buyOrder, sellOrder, transaction, price });
})

app.get('/api/v1/bigtx/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const { decimals } = await getToken(token);
    const rs = await getCache(`shark-${token}`, async () => {
        const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=8`)).data;
        return (await swapModel.getBigTransaction(token, block)).map((p, i) => ({
            date: ts[i],
            total: getNumber(p[1], 0, decimals),
        }));
    });
    res.json(rs);
})

// internal api
app.get('/price/:pair/:block', async (req, res) => {
    const rs = await syncModel.getTick(req.params.pair, req.params.block);
    res.json(rs);
})

const getTicker = (ticks, ticksBNB, isToken0, fromBlock, toBlock, startTs, minuteCount = 1) => {
    const blockInterval = 20 * minuteCount;
    let t = startTs;
    const rs = {};
    const updateRs = (t, { o, c, h, l }) => {
        if (!rs[t]) rs[t] = { o, c, h, l };
        rs[t].c = c;
        if (rs[t].h < h) rs[t].h = h;
        if (rs[t].l > l) rs[t].l = l;
    }
    for (let block = fromBlock; block <= toBlock; block++) {
        if (!ticks[block]) continue;
        if (ticksBNB && !ticksBNB[block]) continue;
        const tick = ticks[block];
        if (ticksBNB && isToken0) {
            tick.o *= ticksBNB[block].o
            tick.c *= ticksBNB[block].c
            tick.h *= ticksBNB[block].h
            tick.l *= ticksBNB[block].l
        } else if (ticksBNB) {
            tick.o /= ticksBNB[block].o
            tick.c /= ticksBNB[block].c
            tick.h /= ticksBNB[block].h
            tick.l /= ticksBNB[block].l
        } else if (!isToken0) {
            tick.o /= 1
            tick.c /= 1
            tick.h /= 1
            tick.l /= 1
        }
        const t = Math.floor((block - fromBlock) / blockInterval) * blockInterval * 3 + startTs;
        updateRs(t, tick);
    }
    return rs;
}

app.get('/tick/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const { decimals } = (await getToken(token));
    const { pools } = (await syncModel.getPools(token, pairModel.getPools(token), decimals));
    const pool = pools[0];
    const ticks = await syncModel.getTicks(pool.pair);
    const isToken0 = pool.token0 == token;
    const quote = pool.token0 == token ? pool.token1 : pool.token0;
    const ticksBNB = quote == ContractAddress.WBNB ? await syncModel.getTicks(ContractAddress.PAIR_WBNB_BUSD) : undefined;
    const rs = getTicker(ticks, ticksBNB, isToken0, 18650096 - 6000, 18650096, Math.floor(Date.now() / 1000) - 300 * 60, 1);
    res.json(rs);
})

app.get('/route/:tokenA/:tokenB', async (req, res) => {
    const tokenA = getAddress(req.params.tokenA);
    const tokenB = getAddress(req.params.tokenB);
    const rs = await syncModel.getPath(
        tokenA, tokenB,
        pairModel.getPools(tokenA), pairModel.getPools(tokenB),
        req.query.in);
    res.json(rs);
})

async function start(port) {
    const startMs = Date.now();

    await pairModel.warmup();
    await syncModel.loadBNBPrice();

    await pairModel.runCrawler();
    await syncModel.runCrawler();
    await swapModel.runCrawler();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9613);