const express = require("express");
const axios = require("axios");
const Web3 = require("web3");

const TokenModel = require("../common/token");
const SwapModel = require("./swap");
const { ContractAddress, getAddress } = require('../utils/bsc');
const { getNumber } = require('../utils/format');

const app = express();
const tokenModel = new TokenModel(true);
const swapModel = new SwapModel(tokenModel);
app.use(express.json());

app.get('/api/v1/volume/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const { ts, block } = (await axios.get(`http://localhost:9610/block/startofday?n=8`)).data;
    const rs = (await swapModel.getVolumeHistory(token, block)).map((p, i) => {
        return {
            date: ts[i],
            totalTransaction: getNumber(p[1]),
            totalAmountSell: getNumber(p[2]),
            totalAmountBuyByNewWallet: getNumber(p[3]),
        }
    });
    res.json(rs);
})

app.get('/api/v1/shark/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const { ts, block } = (await axios.get(`http://localhost:9610/block/startofday?n=8`)).data;
    const rs = (await swapModel.getSharkHistory(token, block)).map((p, i) => {
        return {
            date: ts[i],
            totalBalance: getNumber(p[1]),
            totalTransaction: getNumber(p[2]),
            totalTransactionHighValue: getNumber(p[3]),
        }
    });
    res.json(rs);
})

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
            total: getNumber(txTotal.toString(10), 5),
            amount: getNumber(tx.amount0, 5),
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