const axios = require('axios');

async function get1D(base, quote, countback = 500) {
    let query = `
{
    ethereum(network: bsc) {
        dexTrades(
            options: {limit: ${countback}, desc: "timeInterval.day"}
            exchangeName: {is: "Pancake"}
            baseCurrency: {is: "${base}"}
            quoteCurrency: {is: "${quote}"}
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
                day(count: 1)
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
        t.push(Math.round(new Date(item.timeInterval.day) / 1000));
        c.push(item.close_price);
        o.push(item.open_price);
        h.push(item.maximum_price);
        l.push(item.minimum_price);
        v.push(item.baseAmount);
    });
    return { s: "ok", t, c, o, h, l, v };
}

module.exports = { get1D };