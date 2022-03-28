const express = require("express");
const axios = require("axios");
const Web3 = require("web3");

const TokenModel = require("../common/token");
const SwapModel = require("./swap");
const { getCache } = require("../cache");
const { get1D } = require("./ticker");
const { ContractAddress, getAddress, isUSD } = require('../utils/bsc');
const { getNumber } = require('../utils/format');

const app = express();
const tokenModel = new TokenModel(true);
const swapModel = new SwapModel(tokenModel);
app.use(express.json());

const COMMON_BASE = 'http://localhost:9610';

app.get('/api/v1/ticker', async (req, res) => {
    const tokens = req.query.symbol.split("~");
    const base = getAddress(tokens[0]);
    const quote = tokens[1] == "0" ? ContractAddress.BUSD : getAddress(tokens[1]);
    const bars500 = await getCache(`ticker-1d-${base}-${quote}`, async () => {
        return await get1D(base, quote);
    });
    
    let from = parseInt(req.query.from);
    const to = parseInt(req.query.to) || Math.round(Date.now() / 1000);
    if (req.query.countback) {
        from = to - parseInt(req.query.countback) * 86400;
    }

    const t = [], c = [], o = [], h = [], l = [], v = [];
    for (let i = bars500.t.length - 1; i > 0; i--) {
        if (bars500.t[i] >= from && bars500.t[i] < to) {
            t.push(bars500.t[i]);
            c.push(bars500.c[i]);
            o.push(bars500.o[i]);
            h.push(bars500.h[i]);
            l.push(bars500.l[i]);
            v.push(bars500.v[i]);
        }
    }
    res.json({ s: "ok", t, c, o, h, l, v });
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

app.get('/api/v1/shark/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const rs = await getCache(`shark-${token}`, async () => {
        const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=8`)).data;
        return (await swapModel.getSharkHistory(token, block)).map((p, i) => ({
            date: ts[i],
            totalBalance: getNumber(p[1]),
            totalTransaction: getNumber(p[2]),
            totalTransactionHighValue: getNumber(p[3]),
        }));
    });
    res.json(rs);
})

app.get('/api/v1/transaction/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const { price, bnbPrice } = (await axios.get(`${COMMON_BASE}/price/now?a=${token}`)).data
    const buyOrder = [];
    const sellOrder = [];
    const lastTx = await swapModel.getLastTx(token, 20);
    const bnbPriceBN = Web3.utils.toBN(Math.round(bnbPrice));
    lastTx.forEach(tx => {
        let txPrice, txTotal;
        const amount0BN = Web3.utils.toBN(tx.amount0);
        const amount1BN = Web3.utils.toBN(tx.amount1);
        if (tx.othertoken == ContractAddress.WBNB) {
            txPrice = amount1BN.mul(bnbPriceBN).muln(100000).div(amount0BN);
            txTotal = amount1BN.mul(bnbPriceBN);
        } else if (isUSD(tx.othertoken)) {
            txPrice = amount1BN.muln(100000).div(amount0BN);
            txTotal = amount1BN;
        } else return;
        const item = {
            price: parseInt(txPrice.toString(10)) / 100000,
            total: getNumber(txTotal.toString(10), 5),
            amount: getNumber(tx.amount0, 5),
        }
        if (tx.bs == "SELL") {
            sellOrder.push(item);
        } else if (tx.bs == "BUY") {
            buyOrder.push(item);
        }
    });
    res.json({ buyOrder, sellOrder, price });
})

async function start(port) {
    const startMs = Date.now();

    // await tokenModel.loadLpDetailFile();
    // await tokenModel.loadTokenDetailFile();

    await swapModel.run();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9611);