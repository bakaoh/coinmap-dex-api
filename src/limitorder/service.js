const express = require("express");

const app = express();
app.use(express.json());

const all = [];

app.post('/limitorder/create', async (req, res) => {
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