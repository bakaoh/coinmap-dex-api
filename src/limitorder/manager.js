const axios = require("axios");
const { hdkey } = require("ethereumjs-wallet");
const { toBN } = require("../utils/bsc");
const Executor = require("./executor");

const COMMON_BASE = 'http://localhost:9613';

class Manager {
    constructor(seed, nAccount = 1) {
        const seedBuffer = Buffer.from(seed, "hex");
        this.master = hdkey.fromMasterSeed(seedBuffer);
        this.parent = this.master.derivePath("m/44'/60'/0'/0");
        this.accounts = [];
        this.nAccount = nAccount;
        this.processing = {};
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
        if (order.status != 0) return;
        if (this.processing[order.salt]) return;

        this.processing[order.salt] = true;
        try {
            const data = (await axios.get(`${COMMON_BASE}/route/${order.payToken}/${order.buyToken}?in=${order.payAmount}`)).data;
            console.log(data, order)
            if (toBn(data.amountOut).gt(toBn(order.buyAmount))) {
                const sig = order.sig;
                delete order.status;
                delete order.sig;
                const rs = await this.accounts[0].executeOrder(order.maker, order, sig, data.paths, data.feePaths);
                console.log(order, rs);
                return;
            }
        } catch (err) {
        }
        this.processing[order.salt] = false;
    }
}

module.exports = Manager;