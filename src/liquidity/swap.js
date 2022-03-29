const Crawler = require("../utils/crawler");
const { web3, ContractAddress } = require('../utils/bsc');
const { Partitioner } = require('../utils/io');

const SWAP_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const BLOCK_FILE = 'logs/swap.block';
const DATA_FOLDER = 'db/lpswap';

class SwapModel {
    constructor() {
        this.partitioner = new Partitioner(DATA_FOLDER);
    }

    async runCrawler() {
        this.crawler = new Crawler("Swap", SWAP_TOPIC, BLOCK_FILE, async (log) => {
            const values = web3.eth.abi.decodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], log.data)
            const from = web3.eth.abi.decodeParameters(['address'], log.topics[1])
            const to = web3.eth.abi.decodeParameters(['address'], log.topics[2])
            await this.writeSwapLog(log.blockNumber, log.transactionIndex, log.logIndex, log.address, from[0], to[0], values[0].toString(10), values[1].toString(10), values[2].toString(10), values[3].toString(10));
        }, 200);
        await this.crawler.run();
    }

    async writeSwapLog(block, txIdx, logIdx, pair, from, to, in0, in1, out0, out1) {
        try {
            const idx = Math.floor(block / 100000);
            if (from == ContractAddress.PANCAKE_ROUTER) from = "ROUTER";
            if (to == ContractAddress.PANCAKE_ROUTER) to = "ROUTER";
            this.partitioner.getWriter(pair, idx).write(`${block},${txIdx},${logIdx},${from},${to},${in0},${in1},${out0},${out1}\n`);
        } catch (err) { console.log(`Error`, block, txIdx, logIdx, pair, from, to, in0, in1, out0, out1, err.toString()) }
    }
}

module.exports = SwapModel;