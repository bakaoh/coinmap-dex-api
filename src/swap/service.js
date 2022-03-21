const express = require("express");
const TokenModel = require("../common/token");
const SwapModel = require("./swap");
const { ContractAddress, getAddress } = require('../utils/bsc');

const app = express();
const tokenModel = new TokenModel(true);
const swapModel = new SwapModel(tokenModel);
app.use(express.json());

app.get('/api/v1/tx/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const rs = await swapModel.getLastTx(token);
    res.json(rs);
})

async function start(port) {
    const startMs = Date.now();

    await tokenModel.loadLpDetailFile();
    await tokenModel.loadTokenDetailFile();

    await swapModel.run();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9611);