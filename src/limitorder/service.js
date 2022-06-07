const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const express = require("express");
const OrderModel = require("./order");
const Manager = require("./manager");
const cors = require('cors')

const orderModel = new OrderModel();
const manager = new Manager(process.env.MASTER_SEED, 1);

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
    await orderModel.runCrawler();

    setInterval(async () => {
        try {
            const orders = orderModel.getAllOrders();
            for (let order of orders) {
                if (await manager.process(order)) break;
            }
        } catch (err) { console.log(`Error:`, err); }
    }, 3000)

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9615);