const axios = require("axios");
const { hdkey } = require("ethereumjs-wallet");
const { toBN } = require("../utils/bsc");
const Executor = require("./executor");

const COMMON_BASE = 'http://128.199.189.253:9610';

class Manager {
    constructor(seed, nAccount = 1) {
        const seedBuffer = Buffer.from(seed, "hex");
        this.master = new hdkey.fromMasterSeed(seedBuffer);
        this.parent = this.master.derivePath("m/44'/60'/0'/0");
        this.accounts = [];
        this.nAccount = nAccount;
        this.init();
    }

    init() {
        console.log("Init account");
        for (let i = 0; i < this.nAccount; i++) {
            const wallet = this.parent.deriveChild(i).getWallet();
            this.accounts[i] = new Executor(wallet.getAddressString(), wallet.getPrivateKey());
            console.log(`Account[${i}] ${this.accounts[i].address}`)
        }
    }

    async process(order) {
        const data = (await axios.get(`${COMMON_BASE}/route/${order.payToken}/${order.buyToken}?in=${order.payAmount}`)).data;
        const price = parseInt(toBN(order.buyAmount).muln(100000).div(toBN(order.payAmount))) / 100000;
        console.log(order, data, price);
    }
}

module.exports = Manager;