const axios = require('axios');

const RESOLUTION_INTERVAL = { "1": "minute", "5": "minute", "15": "minute", "60": "minute", "1D": "day", "1W": "day" };
const RESOLUTION_COUNT = { "1": 1, "5": 5, "15": 15, "60": 60, "1D": 1, "1W": 7 };

async function getDexTrades(base, quote, resolution, countback = 300) {
    const interval = RESOLUTION_INTERVAL[resolution] || "minute";
    const count = RESOLUTION_COUNT[resolution] || 1;
    const exchange = `exchangeName: {is: "Pancake v2"}`;
    let query = `
{
    ethereum(network: bsc) {
        dexTrades(
            options: {limit: ${countback}, desc: "t.${interval}"}
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
            'X-API-KEY': 'BQYUBYgBU3vXGryzFxzV75CHtCoG8Fxl',
        }
    });
    const t = [], c = [], o = [], h = [], l = [], v = [];
    res.data.data.ethereum.dexTrades.forEach(item => {
        t.push(Math.round(new Date(item.t[interval]) / 1000));
        c.push(item.c);
        o.push(item.o);
        h.push(item.h);
        l.push(item.l);
        v.push(item.v);
    });
    return { s: "ok", t, c, o, h, l, v };
}

module.exports = { getDexTrades };

