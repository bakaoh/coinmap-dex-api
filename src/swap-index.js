const LpModel = require("./lp");
const SyncModel = require("./sync");

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

async function main() {
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


main();