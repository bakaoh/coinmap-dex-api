const express = require("express");
const axios = require("axios");

const SharkModel = require("./shark");
const { getCache, getSymbol } = require("../cache");
const { getDexTrades, getDexTradesLocal, RESOLUTION_INTERVAL, RESOLUTION_COUNT, RESOLUTION_NEXTTIME } = require("./ticker");
const { ContractAddress, getAddress } = require('../utils/bsc');

const app = express();
const sharkModel = new SharkModel();
app.use(express.json());

const LIQUIDITY_BASE = 'http://10.148.0.34:9613';

app.get('/api/v1/rating/pool/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const rs = sharkModel.getPoolRate(token) || 100000;
    res.json(rs);
});

app.get('/api/v1/wallets/profitable-by-percent/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const top = await getCache(`topWallets-${token}`, async () => {
        const { price } = (await axios.get(`${LIQUIDITY_BASE}/api/v1/transaction/${token}`)).data;
        return sharkModel.topWallets(token, price);
    });
    const rs = top.topProfitByPercent.map(i => ({ address: i }));
    res.json(rs);
});

app.get('/api/v1/wallets/profitable-by-usd/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const top = await getCache(`topWallets-${token}`, async () => {
        const { price } = (await axios.get(`${LIQUIDITY_BASE}/api/v1/transaction/${token}`)).data;
        return sharkModel.topWallets(token, price);
    });
    const rs = top.topProfitByUsd.map(i => ({ address: i }));
    res.json(rs);
});

app.get('/api/v1/wallets/total-transaction/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const top = await getCache(`topWallets-${token}`, async () => {
        const { price } = (await axios.get(`${LIQUIDITY_BASE}/api/v1/transaction/${token}`)).data;
        return sharkModel.topWallets(token, price);
    });
    const rs = top.topTotal.map(i => ({ address: i }));
    res.json(rs);
});

app.get('/api/v1/tradingview/config', async (req, res) => {
    const rs = {
        "supports_search": true,
        "supports_group_request": false,
        "supports_marks": false,
        "supports_timescale_marks": false,
        "supports_time": false,
        "exchanges": [],
        "symbols_types": [
            { "name": "All types", "value": "" },
            { "name": "Token", "value": "token" },
            { "name": "Index", "value": "index" }
        ],
        "supported_resolutions": [
            "1", "5", "15", "60", "1D", "1W"
        ]
    }
    res.json(rs);
})

app.get('/api/v1/tradingview/symbols', async (req, res) => {
    const symbol = req.query.symbol;
    const tokens = req.query.symbol.split("~");
    const base = getAddress(tokens[0]);
    const name = await getSymbol(base);
    const rs = {
        "name": name,
        "exchange-traded": symbol,
        "exchange-listed": symbol,
        "timezone": "Etc/UTC",
        "minmov": 1,
        "minmov2": 0,
        "pointvalue": 1,
        "session": "24x7",
        "has_intraday": true,
        "intraday_multipliers": ['1', '5', '15', '30', '60'],
        "has_empty_bars": false,
        "has_no_volume": false,
        "description": name,
        "type": "token",
        "supported_resolutions": [
            "1", "5", "15", "60", "1D", "1W"
        ],
        "pricescale": 1000,
        "ticker": symbol
    }
    res.json(rs);
})

app.get('/api/v1/tradingview/history', async (req, res) => {
    const resolution = req.query.resolution || "1D";
    const tokens = req.query.symbol.split("~");
    const base = getAddress(tokens[0]);

    if (RESOLUTION_INTERVAL[resolution] == "minute") {
        const bars = await getDexTradesLocal(base, 300, RESOLUTION_COUNT[resolution]);
        const from = parseInt(req.query.from);
        const to = parseInt(req.query.to) || Math.round(Date.now() / 1000);
        const countback = req.query.countback;

        const t = [], c = [], o = [], h = [], l = [], v = [];
        for (let i = 0; i < bars.t.length; i++) {
            if ((countback || bars.t[i] >= from) && bars.t[i] < to) {
                t.push(bars.t[i]);
                c.push(bars.c[i]);
                o.push(bars.o[i]);
                h.push(bars.h[i]);
                l.push(bars.l[i]);
                v.push(bars.v[i]);
            }
            if (t.length >= parseInt(countback)) break;
        }
        if (t.length > 0) {
            const { price } = (await axios.get(`${LIQUIDITY_BASE}/api/v1/transaction/${base}`)).data;
            c[c.length - 1] = price;
            t[t.length - 1] = to;
            res.json({ s: "ok", t, c, o, h, l, v });
        } else {
            let nextTime = bars.t[0] + RESOLUTION_NEXTTIME[resolution];
            if (parseInt(req.query.to) < bars.t[bars.t.length - 1]) {
                nextTime = bars.t[bars.t.length - 1];
            }
            res.json({ s: "no_data", nextTime });
        }
        return;
    }

    let quote = tokens[1];
    let barsBnb;
    let exchangeName = undefined;
    if (quote == "0") {
        const { pools } = (await axios.get(`${LIQUIDITY_BASE}/api/v1/pool/${base}`)).data;
        quote = pools[0].token0 == base ? pools[0].token1 : pools[0].token0;
        exchangeName = pools[0].exchange;
        if (quote == ContractAddress.WBNB) {
            barsBnb = await getCache(`ticker-${resolution}-${ContractAddress.WBNB}-${ContractAddress.BUSD}`, async () => {
                return await getDexTrades(ContractAddress.WBNB, ContractAddress.BUSD, resolution);
            });
        }
    } else {
        quote = getAddress(quote);
    }
    const bars = await getCache(`ticker-${resolution}-${base}-${quote}`, async () => {
        return await getDexTrades(base, quote, resolution, exchangeName);
    });
    const from = parseInt(req.query.from);
    const to = parseInt(req.query.to) || Math.round(Date.now() / 1000);
    const countback = req.query.countback;

    const t = [], c = [], o = [], h = [], l = [], v = [];
    for (let i = 0; i < bars.t.length; i++) {
        if ((countback || bars.t[i] >= from) && bars.t[i] < to) {
            if (quote == ContractAddress.WBNB) {
                t.push(bars.t[i]);
                c.push(bars.c[i] * barsBnb.c[i]);
                o.push(bars.o[i] * barsBnb.o[i]);
                h.push(bars.h[i] * barsBnb.h[i]);
                l.push(bars.l[i] * barsBnb.l[i]);
                v.push(bars.v[i] * barsBnb.v[i]);
            } else {
                t.push(bars.t[i]);
                c.push(bars.c[i]);
                o.push(bars.o[i]);
                h.push(bars.h[i]);
                l.push(bars.l[i]);
                v.push(bars.v[i]);
            }
        }
        if (t.length >= parseInt(countback)) break;
    }
    t.reverse(); c.reverse(); o.reverse(); h.reverse(); l.reverse(); v.reverse();
    if (t.length > 0) {
        const { price } = (await axios.get(`${LIQUIDITY_BASE}/api/v1/transaction/${base}`)).data;
        c[c.length - 1] = price;
        t[t.length - 1] = to;
        res.json({ s: "ok", t, c, o, h, l, v });
    } else {
        let nextTime = bars.t[0] + RESOLUTION_NEXTTIME[resolution];
        if (parseInt(req.query.to) < bars.t[bars.t.length - 1]) {
            nextTime = bars.t[bars.t.length - 1];
        }
        res.json({ s: "no_data", nextTime });
    }
})

async function start(port) {
    const startMs = Date.now();

    await sharkModel.loadTopPools();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9611);