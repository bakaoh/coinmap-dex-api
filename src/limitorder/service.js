const express = require("express");
var cors = require('cors')

const app = express();
app.use(express.json());
app.use(cors());

const all = [];

app.post('/limitorder/create', async (req, res) => {
    console.log(req.body)
    all.push(req.body);
    res.json({ rs: "ok" });
})

app.get('/limitorder', async (req, res) => {
    res.json(all);
})

async function start(port) {
    const startMs = Date.now();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9615);