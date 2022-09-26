const axios = require('axios');

const CANDLE_BASE = 'http://10.148.0.34:9613';
const RESOLUTION_INTERVAL = { "1": "minute", "5": "minute", "15": "minute", "60": "minute", "1D": "day", "1W": "day" };
const RESOLUTION_COUNT = { "1": 1, "5": 5, "15": 15, "60": 60, "1D": 1, "1W": 7 };
const RESOLUTION_NEXTTIME = { "1": 60, "5": 5 * 60, "15": 15 * 60, "60": 60 * 60, "1D": 24 * 60 * 60, "1W": 7 * 24 * 60 * 60 };

async function getDexTradesLocal(token, resolution, to, countback) {
    const minuteCount = RESOLUTION_COUNT[resolution];
    const candles = (await axios.get(`${CANDLE_BASE}/candle/${token}?resolution=${minuteCount}&to=${to}&countback=${countback}`)).data;
    const t = [], c = [], o = [], h = [], l = [], v = [];
    let last;
    for (let ts in candles) {
        t.push(ts);
        o.push(last || candles[ts].o);
        c.push(candles[ts].c);
        h.push(candles[ts].h);
        l.push(candles[ts].l);
        v.push(candles[ts].v);
        last = candles[ts].c;
    }
    return { s: "ok", t, c, o, h, l, v };
}

async function getDexTrades(base, quote, resolution, exchangeName = "Pancake v2", countback = 300) {
    const interval = RESOLUTION_INTERVAL[resolution] || "minute";
    const count = RESOLUTION_COUNT[resolution] || 1;
    const exchange = `exchangeName: {is: "${exchangeName}"}`;
    let query = `
{
    ethereum(network: bsc) {
        dexTrades(
            options: {limit: ${countback}, desc: "t.${interval}"}
            ${exchange}
            baseCurrency: {is: "${base}"}
            quoteCurrency: {is: "${quote}"}
            tradeAmountUsd: {gt: 10}
        ) {
            h: quotePrice(calculate: maximum)
            l: quotePrice(calculate: minimum)
            o: minimum(of: block, get: quote_price)
            c: maximum(of: block, get: quote_price)
            v: baseAmount
            t: timeInterval {
                ${interval}(count: ${count})
            }
        }
    }
}
`;
    let variables = {};
    const res = await axios({
        url: "https://graphql.bitquery.io",
        method: 'post',
        data: { query, variables },
        headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': 'BQYql5zzPyCngxyM4eNzdi8kLudBW93U', // tam
            // 'X-API-KEY': 'BQYUC1EEOmE5X0KvxTK3HjsNqbtfjBIN', // son
            // 'X-API-KEY': 'BQYUBYgBU3vXGryzFxzV75CHtCoG8Fxl',
        }
    });
    const t = [], c = [], o = [], h = [], l = [], v = [];
    res.data.data.ethereum.dexTrades.forEach(item => {
        t.push(Math.round(new Date(item.t[interval]) / 1000));
        c.push(parseFloat(item.c));
        o.push(parseFloat(item.o));
        h.push(parseFloat(item.h));
        l.push(parseFloat(item.l));
        v.push(parseFloat(item.v));
    });
    return { s: "ok", t, c, o, h, l, v };
}

module.exports = { getDexTrades, getDexTradesLocal, RESOLUTION_INTERVAL, RESOLUTION_COUNT, RESOLUTION_NEXTTIME };

