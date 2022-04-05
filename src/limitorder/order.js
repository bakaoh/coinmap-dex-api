const fs = require('fs');
const axios = require("axios");

const LineByLine = require('line-by-line');
const Crawler = require("../utils/crawler");
const { web3, ContractAddress } = require('../utils/bsc');

const ORDER_TOPIC = '';
const BLOCK_FILE = 'logs/order.block';
const ORDER_DETAIL_FILE = 'db/order.log';

const opts = { flags: "a" };

const COMMON_BASE = 'http://128.199.189.253:9610';

class OrderModel {
    constructor() {
        this.writer = fs.createWriteStream(ORDER_DETAIL_FILE, opts);
        this.orders = [];
    }

    async runCrawler() {
    }

    run() {
        this.interval = setInterval(async () => {
            try {
                for (let order of this.orders) {
                    const data = (await axios.get(`${COMMON_BASE}/route/${order.payToken}/${order.buyToken}?in=${order.payAmount}`)).data;
                    console.log(order, data)
                }
            } catch (err) { console.log(`Error:`, err); }
        }, 3000)
    }

    warmup() {
        const lr = new LineByLine(ORDER_DETAIL_FILE);
        lr.on('line', (line) => {
            this.addOrder(line.split(','));
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    getOrdersByAccount(account) {
        return this.orders.filter(i => i.maker == account);
    }

    addOrder([maker, payToken, buyToken, payAmount, buyAmount, deadline, salt, sig]) {
        this.orders.push({ maker, payToken, buyToken, payAmount, buyAmount, deadline, salt, sig })
    }

    newOrder({ maker, payToken, buyToken, payAmount, buyAmount, deadline, salt, sig }) {
        this.writer.write(`${maker},${payToken},${buyToken},${payAmount},${buyAmount},${deadline},${salt},${sig}\n`);
        this.orders.push({ maker, payToken, buyToken, payAmount, buyAmount, deadline, salt, sig })
    }
}

module.exports = OrderModel;