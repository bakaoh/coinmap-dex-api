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

app.get('/api/v1/tradingview/config', async (req, res) => {
    const rs = {
        "supports_search": true,
        "supports_group_request": false,
        "supports_marks": false,
        "supports_timescale_marks": false,
        "supports_time": false,
        "exchanges": [],
        "symbols_types": [
            {
                "name": "All types",
                "value": ""
            },
            {
                "name": "Token",
                "value": "token"
            },
            {
                "name": "Index",
                "value": "index"
            }
        ],
        "supported_resolutions": [
            "D"
        ]
    }
    res.json(rs);
})

app.get('/api/v1/tradingview/symbols', async (req, res) => {
    const tokens = req.query.symbol.split("~");
    const base = getAddress(tokens[0]);
    const rs = {
        "name": base,
        "exchange-traded": base,
        "exchange-listed": base,
        "timezone": "America/New_York",
        "minmov": 1,
        "minmov2": 0,
        "pointvalue": 1,
        "session": "0930-1630",
        "has_intraday": false,
        "has_no_volume": false,
        "description": base,
        "type": "token",
        "supported_resolutions": [
            "D",
            "2D",
            "3D"
        ],
        "pricescale": 100,
        "ticker": base
    }
    res.json(rs);
})

app.get('/api/v1/tradingview/history', async (req, res) => {
    const tokens = req.query.symbol.split("~");
    const base = getAddress(tokens[0]);
    const quote = tokens[1] == "0" ? ContractAddress.BUSD : getAddress(tokens[1]);
    const bars500 = await getCache(`ticker-1d-${base}-${quote}`, async () => {
        return await get1D(base, quote);
    });
    let from = parseInt(req.query.from);
    const to = parseInt(req.query.to) || Math.round(Date.now() / 1000);
    const countback = req.query.countback;

    const t = [], c = [], o = [], h = [], l = [], v = [];
    for (let i = bars500.t.length - 1; i > 0; i--) {
        if ((countback || bars500.t[i] >= from) && bars500.t[i] < to) {
            t.push(bars500.t[i]);
            c.push(bars500.c[i]);
            o.push(bars500.o[i]);
            h.push(bars500.h[i]);
            l.push(bars500.l[i]);
            v.push(bars500.v[i]);
        }
        if (t.length >= parseInt(countback)) break;
    }
    if (t.length > 0) {
        res.json({ s: "ok", t, c, o, h, l, v });
    } else {
        const nextTime = bars500.t[0] + 24 * 60 * 60;
        res.json({ s: "no_data", nextTime });
    }
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

    // await swapModel.run();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9611);