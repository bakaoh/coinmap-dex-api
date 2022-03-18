const express = require("express");
const BlockModel = require("./block");
const LpModel = require("./lp");

const app = express();
const block = new BlockModel();
const lp = new LpModel();
app.use(express.json());

function getStartTsOfDay(n) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const rs = [];
    let ts = start.getTime();
    for (let i = 0; i < n; i++) {
        rs.push(ts);
        ts -= 60 * 60 * 24 * 1000;
    }
    return rs.reverse();
}

app.get('/estimate', (req, res) => {
    const rs = block.estimateBlock(req.query.ts);
    res.json(rs);
})

app.get('/startofday', (req, res) => {
    const ts = getStartTsOfDay(req.query.n)
    const block = ts.map(ms => block.estimateBlock(ms));
    res.json({ ts, block });
})

app.get('/tokens', async (req, res) => {
    const rs = await Promise.all(req.query.a.split(",").map(a => lp.getToken(a)));
    res.json(rs);
})

app.get('/lps', async (req, res) => {
    const rs = await Promise.all(req.query.a.split(",").map(a => lp.getToken01(a)));
    res.json(rs);
})

async function start(port) {
    const startMs = Date.now();
    await block.loadLogFile();
    block.run(60 * 60 * 1000);
    await lp.loadLpDetailFile();
    await lp.loadTokenDetailFile();
    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9610);