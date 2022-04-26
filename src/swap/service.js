const express = require("express");

const SharkModel = require("./shark");
const { getCache } = require("../cache");
const { get1D } = require("./ticker");
const { ContractAddress, getAddress, isUSD } = require('../utils/bsc');
const { getNumber } = require('../utils/format');

const app = express();
const sharkModel = new SharkModel();
app.use(express.json());

app.get('/api/v1/wallets/profitable-by-percent/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const top = await getCache(`topWallets-${token}`, async () => {
        return sharkModel.topWallets(token);
    });
    const rs = top.topProfitByPercent.map(i => ({ address: i }));
    res.json(rs);
});

app.get('/api/v1/wallets/profitable-by-usd/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const top = await getCache(`topWallets-${token}`, async () => {
        return sharkModel.topWallets(token);
    });
    const rs = top.topProfitByUsd.map(i => ({ address: i }));
    res.json(rs);
});

app.get('/api/v1/wallets/total-transaction/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const top = await getCache(`topWallets-${token}`, async () => {
        return sharkModel.topWallets(token);
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
            "h",
            "D"
        ]
    }
    res.json(rs);
})

app.get('/api/v1/tradingview/symbols', async (req, res) => {
    const symbol = req.query.symbol;
    const rs = {
        "name": symbol,
        "exchange-traded": symbol,
        "exchange-listed": symbol,
        "timezone": "America/New_York",
        "minmov": 1,
        "minmov2": 0,
        "pointvalue": 1,
        "session": "0930-1630",
        "has_intraday": false,
        "has_no_volume": false,
        "description": symbol,
        "type": "token",
        "supported_resolutions": [
            "h",
            "D",
            "2D",
            "3D"
        ],
        "pricescale": 100,
        "ticker": symbol
    }
    res.json(rs);
})

app.get('/api/v1/tradingview/history', async (req, res) => {
    const resolution = req.query.resolution || "1D";
    const tokens = req.query.symbol.split("~");
    const base = getAddress(tokens[0]);
    let quote = tokens[1] == "0" ? ContractAddress.BUSD : getAddress(tokens[1]);
    let bars500 = await getCache(`ticker-${resolution}-${base}-${quote}`, async () => {
        return await get1D(base, quote, resolution);
    });
    if (bars500.t.length == 0 && tokens[1] == "0") {
        quote = ContractAddress.WBNB;
        bars500 = await getCache(`ticker-${resolution}-${base}-${quote}`, async () => {
            return await get1D(base, quote, resolution);
        });
    }
    let from = parseInt(req.query.from);
    const to = parseInt(req.query.to) || Math.round(Date.now() / 1000);
    const countback = req.query.countback;

    const t = [], c = [], o = [], h = [], l = [], v = [];
    for (let i = 0; i < bars500.t.length; i++) {
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
    t.reverse(); c.reverse(); o.reverse(); h.reverse(); l.reverse(); v.reverse();
    if (t.length > 0) {
        res.json({ s: "ok", t, c, o, h, l, v });
    } else {
        let nextTime = bars500.t[0] + (resolution == "1D" ? 24 * 60 * 60 : 60 * 60);
        if (parseInt(req.query.to) < bars500.t[bars500.t.length - 1]) {
            nextTime = bars500.t[bars500.t.length - 1];
        }
        res.json({ s: "no_data", nextTime });
    }
})

async function start(port) {
    const startMs = Date.now();
    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9611);