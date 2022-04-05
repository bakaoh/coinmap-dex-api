const Web3 = require("web3");
const Tx = require('ethereumjs-tx').Transaction;
const Common = require('ethereumjs-common');
const Util = require('ethereumjs-util')
const CoinmapDexAbi = require('../abi/CoinmapDex.json');

const common = Common.default.forCustomChain('mainnet', {
    name: 'bnb',
    networkId: 56,
    chainId: 56,
}, 'istanbul');

const COINMAPDEX_ADDRESS = "0xa7e44aE03307de5192944520251e95e89A56A953";
const web3 = new Web3("https://bsc-dataseed.binance.org");
const CoinmapDexContract = new web3.eth.Contract(CoinmapDexAbi, COINMAPDEX_ADDRESS);

class Executor {
    constructor(address, key) {
        this.address = web3.utils.toChecksumAddress(address);
        this.key = key;
    }

    async executeOrder(signer, order, signature, paths, feePaths) {
        const data = CoinmapDexContract.methods.executeOrder(
            web3.utils.toChecksumAddress(signer),
            order,
            signature,
            paths.map(p => web3.utils.toChecksumAddress(p)),
            feePaths.map(p => web3.utils.toChecksumAddress(p))
        ).encodeABI();
        return this.sendTx(COINMAPDEX_ADDRESS, data);
    }

    async sendBnb(toAddress, amount) {
        return this.sendTx(toAddress, undefined, web3.utils.toHex(amount));
    }

    getBnbBalance() {
        return web3.eth.getBalance(this.address);
    }

    async sendTx(to, data = undefined, value = '0x') {
        const txCount = await web3.eth.getTransactionCount(this.address);
        var txObject = {};
        txObject.nonce = web3.utils.toHex(txCount);
        txObject.gasLimit = web3.utils.toHex(data ? 1000000 : 21000);
        txObject.gasPrice = web3.utils.toHex(web3.utils.toWei("5", "gwei"));
        txObject.to = web3.utils.toChecksumAddress(to);
        txObject.value = value;
        if (data) txObject.data = data;

        //Sign transaction before sending
        var tx = new Tx(txObject, { common });
        var privateKey = Buffer.from(this.key, 'hex')
        tx.sign(privateKey);
        var serializedTx = tx.serialize();
        return web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex')).then(tx => tx.transactionHash);
    }
}

module.exports = Executor;
