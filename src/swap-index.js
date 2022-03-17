const SwapModel = require("./swap");

async function main() {
    const startMs = Date.now();
    const m = new SwapModel();
    // for (let i = 150; i <= 161; i++) {
    //     await m.loadLogFile(`logs/swap-${i}.log`).catch(err => { });
    // }
    await m.loadLPFile();
    await m.createLPDetailFile();
    const ms = Date.now() - startMs;
    console.log(`Done (${ms}ms)`)
}

main();