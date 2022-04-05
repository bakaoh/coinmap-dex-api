const fs = require('fs');

const LineByLine = require('line-by-line');
const Crawler = require("../utils/crawler");
const { web3, ContractAddress } = require('../utils/bsc');

const ORDER_TOPIC = '0xed7cb6c9f6327abadac804e7b7c0033ad1ed0f4e1b259ff20ee6499ea527ab14';
const BLOCK_FILE = 'logs/order.block';
const ORDER_DETAIL_FILE = 'db/order.detail';
const ORDER_STATUS_FILE = 'db/order.status';

const opts = { flags: "a" };

class OrderModel {
    constructor() {
        this.detailWriter = fs.createWriteStream(ORDER_DETAIL_FILE, opts);
        this.statusWriter = fs.createWriteStream(ORDER_STATUS_FILE, opts);
        this.orders = [];
        this.status = {};
    }

    async runCrawler() {
        this.crawler = new Crawler("Order", ORDER_TOPIC, BLOCK_FILE, async (log) => {
            const values = web3.eth.abi.decodeParameters(['bytes32', 'uint8'], log.data)
            const maker = web3.eth.abi.decodeParameters(['address'], log.topics[1])
            this.writeStatus([log.blockNumber, maker[0], values[0], values[1].toString(10)]);
        }, 2000);
        await this.crawler.run();
    }

    async warmup() {
        await this.loadDetail();
        await this.loadStatus();
    }

    loadDetail() {
        const lr = new LineByLine(ORDER_DETAIL_FILE);
        lr.on('line', (line) => {
            this.addOrder(line.split(','));
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    loadStatus() {
        const lr = new LineByLine(ORDER_STATUS_FILE);
        lr.on('line', (line) => {
            const [block, maker, salt, status] = line.split(',');
            this.status[salt] = status;
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    getOrdersByAccount(account) {
        return this.orders.filter(i => i.maker == account).map(i => ({ ...i, status: this.status[i.salt] || 0 }));
    }

    getAllOrders() {
        return this.orders.map(i => ({ ...i, status: this.status[i.salt] || 0 }));
    }

    addOrder([maker, payToken, buyToken, payAmount, buyAmount, deadline, salt, sig]) {
        this.orders.push({ maker, payToken, buyToken, payAmount, buyAmount, deadline, salt, sig })
    }

    newOrder({ maker, payToken, buyToken, payAmount, buyAmount, deadline, salt, sig }) {
        this.detailWriter.write(`${maker},${payToken},${buyToken},${payAmount},${buyAmount},${deadline},${salt},${sig}\n`);
        this.orders.push({ maker, payToken, buyToken, payAmount, buyAmount, deadline, salt, sig })
    }

    writeStatus([block, maker, salt, status]) {
        this.statusWriter.write(`${block},${maker},${salt},${status}\n`);
        this.status[salt] = status;
    }
}

module.exports = OrderModel;