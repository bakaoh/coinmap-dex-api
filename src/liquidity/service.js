const express = require("express");
const axios = require("axios");

const SyncModel = require("./sync");
const SwapModel = require("./swap");
const PairModel = require("./pair");
const { getCache, getToken } = require("../cache");
const { getAddress, ContractAddress, toBN, getFactoryName } = require('../utils/bsc');
const { getNumber, getPrice } = require('../utils/format');

const COMMON_BASE = 'http://10.148.0.39:9612';

const app = express();
const pairModel = new PairModel();
const syncModel = new SyncModel();
const swapModel = new SwapModel(pairModel);
app.use(express.json());

app.get('/api/v1/price/:tokenA/:tokenB', async (req, res) => {
    const tokenA = getAddress(req.params.tokenA);
    const tokenB = getAddress(req.params.tokenB);
    const amountIn = toBN("1000000000000000000");
    const rs = await syncModel.getPath(
        tokenA, tokenB,
        pairModel.getPools(tokenA), pairModel.getPools(tokenB),
        amountIn.toString());
    const amountOut = toBN(rs.amountOut);
    const decimalsA = (await getToken(tokenA)).decimals;
    const decimalsB = (await getToken(tokenB)).decimals;
    const price = parseInt(amountOut.mul(toBN("100000000")).div(amountIn).div(toBN(10).pow(toBN(decimalsA - decimalsB))).toString(10)) / 100000000;
    res.json({ price });
})

app.get('/api/v1/pool/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const { symbol, decimals } = (await getToken(token));
    const { tokenPrice, pools, pricePool } = (await syncModel.getPools(token, pairModel.getPools(token)));

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
                totalToken = totalToken.add(pool.history[i][0]);
            }
            const price = getPrice(syncModel.calcPrice(pricePool.history[i]), decimals) * quotePrice;
            return { date, price, totalAmount: getNumber(totalToken.toString(10), 0, decimals) * price };
        });
    });

    const details = pools.slice(0, 3);
    for (let p of details) {
        p.name = symbol + "/" + (await getToken(p.token0 == token ? p.token1 : p.token0)).symbol;
        p.liquidity = getNumber((p.token0 == token ? p.reserve0 : p.reserve1).toString(), 0, decimals) * getPrice(tokenPrice, decimals);
        p.reserve0 = getNumber(p.reserve0.toString());
        p.reserve1 = getNumber(p.reserve1.toString());
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
    const { tokenPrice } = (await syncModel.getPools(token, pairModel.getPools(token)));
    let price = getPrice(tokenPrice, decimals);
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
        const newprice = parseInt(txTotal.mul(toBN("100000000")).div(amount0BN).div(dd).toString(10)) / 100000000;
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
app.get('/candle/:token', async (req, res) => {
    const resolution = parseInt(req.query.resolution) || 1;
    const ts = parseInt(req.query.to) || Math.round(Date.now() / 1000);
    const countback = parseInt(req.query.countback) || 300;

    const token = getAddress(req.params.token);
    const { decimals } = await getToken(token);
    const { pools } = (await syncModel.getPools(token, pairModel.getPools(token)));
    const block = (await axios.get(`${COMMON_BASE}/block/estimate?ts=${ts}`)).data;
    const rs = await syncModel.getChart(pools[0], token, block, ts, countback, resolution);
    if (decimals != 18) {
        for (let t in rs) {
            rs[t].o = getPrice(rs[t].o, decimals);
            rs[t].c = getPrice(rs[t].c, decimals);
            rs[t].h = getPrice(rs[t].h, decimals);
            rs[t].l = getPrice(rs[t].l, decimals);
        }
    }
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
    await syncModel.loadBNBCandles();

    await pairModel.runCrawler();
    await syncModel.runCrawler();
    await swapModel.runCrawler();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9613);