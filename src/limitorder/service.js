const express = require("express");

const app = express();
app.use(express.json());

const all = [];

app.post('/limitorder/create', async (req, res) => {
    console.log(req.body)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    all.push(req.body);
    res.json({ rs: "ok" });
})

app.get('/limitorder', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.json(all);
})

async function start(port) {
    const startMs = Date.now();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9615);