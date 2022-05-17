const SwapModel = require("../liquidity/swap");
const swapModel = new SwapModel();

async function main() {
    const startMs = Date.now();
    console.log(await swapModel.getTicker("0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", 17600000, 17800000));
    console.log(`Done (${Date.now() - startMs}ms)`)
}

main();