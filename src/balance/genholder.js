const fs = require('fs');
const TokenModel = require('./token');
const BalanceModel = require("./balance");

const opts = { flags: "a" };

async function run() {
    const tokenModel = new TokenModel();
    await tokenModel.loadTokenDetailFile();
    const balanceModel = new BalanceModel();
    const totalHolder = fs.createWriteStream(`cache/total-holders.log`, opts);

    for (let token in tokenModel.token) {
        try {
            const holder = parseInt((await balanceModel.getTotalHolders(token, 1))[0].total);
            totalHolder.write(`${token},${holder}\n`);
        } catch (err) { }
    }
    totalHolder.end();
}

run();