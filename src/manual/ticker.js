const { getDexTradesLocal } = require("../swap/ticker");

async function main() {
    const startMs = Date.now();
    console.log(await getDexTradesLocal("0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", 300, 1));
    console.log(`Done (${Date.now() - startMs}ms)`)
}

main();