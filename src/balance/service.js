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

const COMMON_BASE = 'http://128.199.189.253:9610';
const SWAP_BASE = 'http://128.199.189.253:9611';

app.get('/api/v1/holder/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const rs = await getCache(`holder-${token}`, async () => {
        const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=30`)).data;
        return (await balanceModel.getTotalHolders(token, 30)).map((p, i) => ({
            date: ts[i],
            num: parseInt(p.total),
        }));
    });
    res.json(rs);
})

app.get('/api/v1/shark/:token', async (req, res) => {
    const token = getAddress(req.params.token);
    const rs = await getCache(`shark-${token}`, async () => {
        const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=8`)).data;
        const data = await balanceModel.getSharkHistory(token, block);
        const swapData = (await axios.get(`${SWAP_BASE}/api/v1/shark/${token}`)).data;
        return swapData.map((p, i) => ({
            date: ts[i],
            totalBalance: getNumber(data[i].totalToken),
            totalTransaction: getNumber(data[i].totalAction),
            totalTransactionHighValue: getNumber(p[3]),
        }));
    });
    res.json(rs);
})

async function start(port) {
    const startMs = Date.now();

    await balanceModel.run();

    app.listen(port);
    const ms = Date.now() - startMs;
    console.log(`Service start at port ${port} (${ms}ms)`)
}

start(9612);