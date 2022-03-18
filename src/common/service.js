const express = require("express");
const BlockModel = require("./block");

const app = express();
const model = new BlockModel();
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
    const rs = model.estimateBlock(req.query.ts);
    res.json(rs);
})

app.get('/startofday', (req, res) => {
    const rs = getStartTsOfDay(req.query.n).map(ts => model.estimateBlock(ts));
    res.json(rs);
})

model.loadLogFile().then(() => {
    model.run(60 * 60 * 1000);
    app.listen(9610);
});
