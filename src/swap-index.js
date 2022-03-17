const SwapModel = require("./swap");

async function main() {
    const startMs = Date.now();
    const m = new SwapModel();
    for (let i = 150; i <= 161; i++) {
        await m.loadLogFile(`logs/swap-${i}.log`).catch(err => { });
    }
    const ms = Date.now() - startMs;
    console.log(`Scan swap logs done (${ms}ms)`)

    m.print();
}

main();