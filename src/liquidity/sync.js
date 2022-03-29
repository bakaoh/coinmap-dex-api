const Crawler = require("../utils/crawler");
const { web3, ContractAddress, isUSD, toBN } = require('../utils/bsc');
const { Partitioner, getLastLine, getLastFile } = require('../utils/io');
const { getNumber } = require('../utils/format');

const SYNC_TOPIC = '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1';
const BLOCK_FILE = 'logs/sync.block';
const DATA_FOLDER = 'db/lpsync';

const getReserveFromLogs = async (pair) => {
    try {
        const lastFile = getLastFile(`${DATA_FOLDER}/${pair}`);
        if (lastFile == '') return ["0", "0"];;
        const lastLine = await getLastLine(`${DATA_FOLDER}/${pair}/${lastFile}`);
        const p = lastLine.split(',');
        if (p.length != 5) return ["0", "0"];
        return [p[3], p[4]];
    } catch (err) {
        return ["0", "0"];
    }
}

class SyncModel {
    constructor() {
        this.partitioner = new Partitioner(DATA_FOLDER);
        this.reserves = {};
    }

    async runCrawler() {
        this.crawler = new Crawler("Sync", SYNC_TOPIC, BLOCK_FILE, async (log) => {
            const values = web3.eth.abi.decodeParameters(['uint256', 'uint256'], log.data)
            await this.writeSyncLog(log.blockNumber, log.transactionIndex, log.logIndex, log.address, values[0].toString(10), values[1].toString(10));
        }, 200);
        await this.crawler.run();
    }

    async getBNBPrice() {
        const [reserve0, reserve1] = await this.getReserves(ContractAddress.PAIR_WBNB_BUSD);
        return parseInt(toBN(reserve1).muln(100000).div(toBN(reserve0))) / 100000;
    }

    async getPools(token, pairs) {
        const pools = [];
        for (let pair in pairs) {
            const pool = pairs[pair];
            const [reserve0, reserve1] = await this.getReserves(pair);
            pools.push({ pair, token0: pool.token0, token1: pool.token1, reserve0: toBN(reserve0), reserve1: toBN(reserve1) });
        }
        pools.sort((a, b) => (b.token0 == token ? b.reserve0 : b.reserve1).gt(a.token0 == token ? a.reserve0 : a.reserve1));
        let tokenPrice = 0;
        for (let pool of pools) {
            if (isUSD(pool.token1)) tokenPrice = parseInt(pool.reserve1.muln(100000).div(pool.reserve0)) / 100000;
            else if (isUSD(pool.token0)) tokenPrice = parseInt(pool.reserve0.muln(100000).div(pool.reserve1)) / 100000;
            else if (pool.token1 == ContractAddress.WBNB) tokenPrice = await this.getBNBPrice() * parseInt(pool.reserve1.muln(100000).div(pool.reserve0)) / 100000;
            else if (pool.token0 == ContractAddress.WBNB) tokenPrice = await this.getBNBPrice() * parseInt(pool.reserve0.muln(100000).div(pool.reserve1)) / 100000;
            if (tokenPrice) break;
        }
        return pools.map(pool => {
            const reserve0 = getNumber(pool.reserve0);
            const reserve1 = getNumber(pool.reserve1);
            return {
                name: pool.pair,
                liquidity: (pool.token0 == token ? reserve0 : reserve1) * tokenPrice,
                reserve0, reserve1, tokenPrice
            }
        });
    }

    async getReserves(pair) {
        if (!this.reserves[pair]) {
            this.reserves[pair] = getReserveFromLogs(pair);
        }
        return this.reserves[pair];
    }

    async getReservesHistory(pair, checkpoints, isToken0 = true) {
        let cid = 0;
        const fromIdx = Math.floor(checkpoints[0] / 100000);
        const toIdx = Math.ceil(checkpoints[checkpoints.length - 1] / 100000);
        const rs = [];
        for (let idx = fromIdx; idx <= toIdx; idx++) {
            try {
                await this.partitioner.loadLog(pair, idx, ([block, , , reserve0, reserve1]) => {
                    while (block > parseInt(checkpoints[cid])) {
                        rs.push(isToken0 ? [reserve0, reserve1] : [reserve1, reserve0]);
                        cid++;
                    }
                });
            } catch (err) {
                if (!err.toString().includes('no such file')) { }
                const block = (idx) * 100000;
                while (block > parseInt(checkpoints[cid])) {
                    rs.push(["0", "0"]);
                    cid++;
                }
            }
        }
        return rs;
    }

    async writeSyncLog(block, txIdx, logIdx, pair, reserve0, reserve1) {
        const idx = Math.floor(block / 100000);
        this.partitioner.getWriter(pair, idx).write(`${block},${txIdx},${logIdx},${reserve0},${reserve1}\n`);
        this.reserves[pair] = [reserve0, reserve1];
    }

    updatePrice(token, othertoken, reserve0, reserve1) {
        // if (reserve0 == "0" || reserve1 == "0") return;
        // if (isUSD(othertoken)) {
        //     const priceInUsd = toBN(reserve1).muln(100000).div(toBN(reserve0))
        //     this.price[token] = parseInt(priceInUsd.toString(10)) / 100000;
        // } else if (othertoken == ContractAddress.WBNB) {
        //     const priceInBnB = toBN(reserve1).muln(100000).div(toBN(reserve0))
        //     this.price[token] = this.price[ContractAddress.WBNB] * parseInt(priceInBnB.toString(10)) / 100000
        // }
    }
}

module.exports = SyncModel;