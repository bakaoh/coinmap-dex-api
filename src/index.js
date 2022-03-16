const BalanceModel = require("./balance");

async function main() {
    const m = new BalanceModel();
    for (let i = 6; i <= 160; i++) {
        await m.loadLogFile(`logs/cake-${i}.log`).catch(err => { });
    }
    console.log("Total holder: ", m.totalHolder());
    m.topHolder(10).forEach(v => console.log(v[0], v[1].toString(10)));
}

main();