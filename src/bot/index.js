const SyncModel = require("./sync");
const PairModel = require("./pair");

const pairModel = new PairModel();
const syncModel = new SyncModel(pairModel);

async function start() {
    const startMs = Date.now();

    await pairModel.warmup();
    await pairModel.runCrawler();
    await syncModel.runCrawler();

    const ms = Date.now() - startMs;
    console.log(`Bot start (${ms}ms)`)
}

start();