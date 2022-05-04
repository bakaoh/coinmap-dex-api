const axios = require('axios');

const RESOLUTION_INTERVAL = { "1": "minute", "5": "minute", "15": "minute", "60": "minute", "1D": "day", "1W": "day" };
const RESOLUTION_COUNT = { "1": 1, "5": 5, "15": 15, "60": 60, "1D": 1, "1W": 7 };

async function getDexTrades(base, quote, resolution, countback = 500) {
    const interval = RESOLUTION_INTERVAL[resolution] || "minute";
    const count = RESOLUTION_COUNT[resolution] || 1;
    const exchange = `exchangeAddress: {is: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73"}`;
    let query = `
{
    ethereum(network: bsc) {
        dexTrades(
            options: {limit: ${countback}, desc: "timeInterval.${interval}"}
            ${exchange}
            baseCurrency: {is: "${base}"}
            quoteCurrency: {is: "${quote}"}
            tradeAmountUsd: {gt: 1}
        ) {
            quoteAmount
            trades: count
            quotePrice
            maximum_price: quotePrice(calculate: maximum)
            minimum_price: quotePrice(calculate: minimum)
            open_price: minimum(of: block, get: quote_price)
            close_price: maximum(of: block, get: quote_price)
            baseAmount
            timeInterval {
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
        t.push(Math.round(new Date(item.timeInterval[interval]) / 1000));
        c.push(item.close_price);
        o.push(item.open_price);
        h.push(item.maximum_price);
        l.push(item.minimum_price);
        v.push(item.baseAmount);
    });
    return { s: "ok", t, c, o, h, l, v };
}

module.exports = { getDexTrades };

