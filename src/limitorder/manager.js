const { hdkey } = require("ethereumjs-wallet");
const Executor = require("./executor");

class Manager {
    constructor(seed, nAccount = 1) {
        const seedBuffer = Buffer.from(seed, "hex");
        this.master = new hdkey.fromMasterSeed(seedBuffer);
        this.parent = this.master.derivePath("m/44'/60'/0'/0");
        this.accounts = [];
        this.nAccount = nAccount;

        this.run = this.run.bind(this);
        this.run0 = this.run0.bind(this);
        this.init();
    }

    init() {
        console.log("Init account");
        for (let i = 0; i < this.nAccount; i++) {
            const wallet = this.parent.deriveChild(i).getWallet();
            this.accounts[i] = new Executor(wallet.getAddressString(), wallet.getPrivateKey());
            console.log(`Account[${i}] ${this.accounts[i].address}`)
        }
        this.looper = setInterval(this.run, 5 * 1e3);
    }

    async run() { await this.run0().catch(console.err); }

    async run0() {

    }
}

module.exports = Manager;