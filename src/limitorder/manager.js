const axios = require("axios");
const { hdkey } = require("ethereumjs-wallet");
const { toBN } = require("../utils/bsc");
const Executor = require("./executor");

const COMMON_BASE = 'http://localhost:9613';

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

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
        if (order.status != 0) return false;
        if (parseInt(order.deadline) * 1000 < Date.now()) return false;
        if (this.processing[order.salt]) return false;

        this.processing[order.salt] = true;
        try {
            const data = (await axios.get(`${COMMON_BASE}/route/${order.payToken}/${order.buyToken}?in=${order.payAmount}`)).data;
            if (toBN(data.amountOut).gt(toBN(order.buyAmount))) {
                const sig = order.sig;
                delete order.status;
                delete order.sig;
                const rs = await this.accounts[0].executeOrder(order.maker, order, sig, data.paths, data.feePaths)
                    .catch(error => console.log("executeOrder", error.toString(), error));
                console.log(order, rs);
                return true;
            }
            await sleep(200);
        } catch (err) {
            console.log(err)
        }
        this.processing[order.salt] = false;
        return false;
    }
}

module.exports = Manager;