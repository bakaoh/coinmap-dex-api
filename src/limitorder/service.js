const express = require("express");
const OrderModel = require("./order");
const cors = require('cors')

const orderModel = new OrderModel();

const app = express();
app.use(express.json());
app.use(cors());

app.post('/api/v1/limitorder/create', async (req, res) => {
    orderModel.newOrder(req.body); // TODO: verify sig
    res.json({ rs: "ok" });
})

app.get('/api/v1/limitorder', async (req, res) => {
    const account = req.query.account;
    const rs = orderModel.getOrdersByAccount(account);
    res.json(rs);
})

async function start(port) {
    const startMs = Date.now();

    await orderModel.warmup();
    orderModel.run();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9615);