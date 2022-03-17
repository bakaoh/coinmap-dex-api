const LpModel = require("./lp");

async function prefetchData() {
    const startMs = Date.now();
    const m = new LpModel();
    for (let i = 150; i <= 161; i++) {
        await m.loadSwapLogFile(`logs/swap-${i}.log`).catch(err => { });
    }
    m.createLpFile();
    await m.createLpDetailFile();
    const ms = Date.now() - startMs;
    console.log(`Done (${ms}ms)`)
}

async function main() {
    const startMs = Date.now();
    const m = new LpModel();
    await m.loadLpDetailFile();
    const ms = Date.now() - startMs;
    console.log(`Load LP Detail done (${ms}ms)`)

    console.log(await m.getToken01('0xf69Fbb9E6F938415320F3Fe4FC37d5bCA42172cd'))
}


main();