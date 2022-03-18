const axios = require("axios");
const LpModel = require("./lp");
const SyncModel = require("./sync");
const SwapModel = require("./swap");

async function prefetchData() {
    const startMs = Date.now();
    const lp = new LpModel();
    for (let i = 150; i <= 161; i++) {
        await lp.loadSwapLogFile(`logs/swap-${i}.log`).catch(err => { });
    }
    lp.createLpFile();
    await lp.createLpDetailFile();
    const ms = Date.now() - startMs;
    console.log(`Done (${ms}ms)`)
}

async function partitionSync() {
    let startMs = Date.now();
    const lp = new LpModel();
    await lp.loadLpDetailFile();
    let ms = Date.now() - startMs;
    console.log(`Load LP Detail done (${ms}ms)`)

    const s = new SyncModel(lp);
    for (let i = 150; i <= 161; i++) {
        startMs = Date.now();
        await s.partitionSyncLogFile(`logs/sync-${i}.log`).catch(err => { });
        ms = Date.now() - startMs;
        console.log(`Partition sync log [${i}] (${ms}ms)`)
    }
    s.closeAll();
}


async function partitionSwap() {
    let startMs = Date.now();
    const lp = new LpModel();
    await lp.loadLpDetailFile();
    let ms = Date.now() - startMs;
    console.log(`Load LP Detail done (${ms}ms)`)

    const s = new SwapModel(lp);
    for (let i = 150; i <= 161; i++) {
        startMs = Date.now();
        await s.partitionSwapLogFile(`logs/swap-${i}.log`).catch(err => { });
        ms = Date.now() - startMs;
        console.log(`Partition swap log [${i}] (${ms}ms)`)
    }
    s.closeAll();
}

async function getBNBprice() {
    const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
    const BUSD = '0xe9e7cea3dedca5984780bafc599bd69add087d56';
    const { data } = await axios.get("http://128.199.189.253:9610/startofday?n=540");

    let startMs = Date.now();
    const lp = new LpModel();
    await lp.loadLpDetailFile();

    const s = new SyncModel(lp);
    await s.getPrice(WBNB, BUSD, data)

    let ms = Date.now() - startMs;
    console.log(`Get price done (${ms}ms)`)
}

getBNBprice();