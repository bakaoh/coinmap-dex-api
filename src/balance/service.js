const express = require("express");
const axios = require("axios");
const Web3 = require("web3");

const BalanceModel = require("./balance");
const { getCache } = require("../cache");
const { ContractAddress, getAddress, isUSD } = require('../utils/bsc');
const { getNumber } = require('../utils/format');

const app = express();
const balanceModel = new BalanceModel();
app.use(express.json());

async function start(port) {
    const startMs = Date.now();

    await balanceModel.run();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9612);