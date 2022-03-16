const BalanceModel = require("./balance");

async function main() {
    const m = new BalanceModel();
    for (let i = 6; i <= 160; i++) {
        await m.loadLogFile(`logs/cake-${i}.log`).catch(err => { });
    }
    console.log(m.totalHolder());
}

main();