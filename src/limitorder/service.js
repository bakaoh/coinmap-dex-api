const express = require("express");
var cors = require('cors')

const app = express();
app.use(express.json());
// app.options("*", cors({ origin: 'http://localhost:3000', optionsSuccessStatus: 200 }));
// app.use(cors({ origin: "http://localhost:3000", optionsSuccessStatus: 200 }));

const all = [];

app.get('/api/v1/limitorder/create', async (req, res) => {
    console.log(req.body)
    all.push(req.body);
    res.json({ rs: "ok" });
})

app.get('/api/v1/limitorder', async (req, res) => {
    res.json(all);
})

async function start(port) {
    const startMs = Date.now();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9615);