const BalanceModel = require("./balance");

async function main() {
    const m = new BalanceModel();
    await m.loadLogFile('logs/cake-7.log');
    m.print();
}
main();