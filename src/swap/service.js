const express = require("express");
const axios = require("axios");
const Web3 = require("web3");

const TokenModel = require("../common/token");
const SwapModel = require("./swap");
const { ContractAddress, getAddress } = require('../utils/bsc');

const app = express();
const tokenModel = new TokenModel(true);
const swapModel = new SwapModel(tokenModel);
app.use(express.json());

const getNumber = (bn) => parseInt(bn.substr(0, bn.length - 13) || '0') / 100000;

app.get('/api/v1/transaction/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const { price, bnbPrice } = (await axios.get(`http://localhost:9610/price/now?a=${token}`)).data
    const buyOrder = [];
    const sellOrder = [];
    const lastTx = await swapModel.getLastTx(token, 20);
    const bnbPriceBN = Web3.utils.toBN(Math.round(bnbPrice));
    lastTx.forEach(tx => {
        let txPrice, txTotal;
        const amount0BN = Web3.utils.toBN(tx.amount0);
        const amount1BN = Web3.utils.toBN(tx.amount1);
        if (tx.othertoken == ContractAddress.WBNB) {
            txPrice = amount1BN.mul(bnbPriceBN).muln(100000).div(amount0BN);
            txTotal = amount1BN.mul(bnbPriceBN);
        } else if (tx.othertoken == ContractAddress.BUSD || tx.othertoken == ContractAddress.USDT) {
            txPrice = amount1BN.muln(100000).div(amount0BN);
            txTotal = amount1BN;
        } else return;
        const item = {
            price: parseInt(txPrice.toString(10)) / 100000,
            total: getNumber(txTotal.toString(10)),
            amount: getNumber(tx.amount0),
        }
        if (tx.bs == "SELL") {
            sellOrder.push(item);
        } else if (tx.bs == "BUY") {
            buyOrder.push(item);
        }
    });
    res.json({ buyOrder, sellOrder, price });
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