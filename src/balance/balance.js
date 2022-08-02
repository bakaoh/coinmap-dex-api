const Crawler = require("../utils/crawler");
const LineByLine = require('line-by-line');
const readLastLines = require('read-last-lines');

const { web3, ContractAddress, toBN } = require('../utils/bsc');
const { Partitioner } = require('../utils/io');

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BLOCK_FILE = 'logs/transfer.block';
const IGNORE = [ContractAddress.WBNB, ContractAddress.BUSD, ContractAddress.USDT];
const DATA_FOLDER = 'db/transfer';

class Transfer {
    constructor(tokenModel) {
        this.tokenModel = tokenModel;
        this.partitioner = new Partitioner(DATA_FOLDER, '.log');
    }

    async runCrawler() {
        this.crawler = new Crawler("Transfer", TRANSFER_TOPIC, BLOCK_FILE, async (log) => {
            if (IGNORE.includes(log.address)) return;
            if (log.topics.length != 3 || log.data == '0x') return;
            const values = web3.eth.abi.decodeParameters(['uint256'], log.data)
            const from = web3.eth.abi.decodeParameters(['address'], log.topics[1])
            const to = web3.eth.abi.decodeParameters(['address'], log.topics[2])
            await this.writeTransferLog(log.blockNumber, log.transactionIndex, log.logIndex, log.address, from[0], to[0], values[0].toString(10));
        }, 200);
        await this.crawler.run();
    }

    async getSharkHistory(token, checkpoints) {
        const rs = [];
        for (let block of checkpoints) {
            let totalToken = toBN(0);
            let totalAction = toBN(0);
            try {
                await this.loadTopHolders(token, block, (address, balance, action) => {
                    totalToken = totalToken.add(toBN(balance));
                    totalAction = totalAction.add(toBN(action));
                });
            } catch (err) { }
            rs.push({ block, totalToken, totalAction });
        }
        return rs;
    }

    loadTopHolders(token, cp, cb) {
        const file = `cache/topholders/${token}/${cp}.log`
        const lr = new LineByLine(file);
        lr.on('line', (line) => {
            const p = line.split(',');
            if (p.length != 3) {
                console.log('Invalid log', line);
                return;
            }
            cb(p[0], p[1], p[2]);
        });
        return new Promise((res, rej) => lr.on('end', () => res()).on('error', err => rej(err)));
    }

    async getTotalHolders(token, n) {
        const rs = [];
        try {
            const file = `cache/summary/${token}/total-holder.log`
            const lastLines = await readLastLines.read(file, n);
            lastLines.trim().split('\n').forEach(line => {
                const [block, total] = line.split(',');
                rs.push({ block, total });
            });
        } catch (err) { }
        return rs;
    }

    async getInflationary(token) {
        try {
            let totalMint = toBN(0);
            let totalDay = 0;
            const file = `cache/summary/${token}/total-mint.log`
            const lastLines = await readLastLines.read(file, 30);
            lastLines.trim().split('\n').forEach(line => {
                const [block, mint] = line.split(',');
                totalDay++;
                totalMint = totalMint.add(toBN(mint));
            });
            return totalMint.div(toBN(totalDay)).toString();
        } catch (err) { }
        return '0';
    }

    async writeTransferLog(block, txIdx, logIdx, token, from, to, value) {
        try {
            const idx = Math.floor(block / Partitioner.BPF);
            this.partitioner.getWriter(token, idx).write(`${block},${txIdx},${logIdx},${from},${to},${value}\n`);
            await this.tokenModel.getToken(token);
        } catch (err) { console.log(`Error`, block, txIdx, logIdx, token, from, to, value, err.toString()) }
    }
}

module.exports = Transfer;