const axios = require("axios");
const BalanceModel = require("./balance");

async function main() {
    const { data } = await axios.get("http://128.199.189.253:9610/startofday?n=300");
    const model = new BalanceModel(data);
    for (let i = 6; i <= 161; i++) {
        const startMs = Date.now();
        await model.loadLogFile(`logs/cake-${i}.log`).catch(console.log);
        const ms = Date.now() - startMs;
        console.log(`Indexing [${i}] (${ms}ms)`)
    }
}

main();