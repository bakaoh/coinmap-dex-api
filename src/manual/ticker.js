const SwapModel = require("../liquidity/swap");
const swapModel = new SwapModel();

async function main() {
    const startMs = Date.now();
    const start = new Date();
    start.setMilliseconds(0);
    const startTs = Math.round(start.getTime() / 1000);
    console.log(await swapModel.getTicker("0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", 17794000, 17800000, startTs));
    console.log(`Done (${Date.now() - startMs}ms)`)
}

main();