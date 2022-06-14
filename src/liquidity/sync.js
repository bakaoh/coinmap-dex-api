const Crawler = require("../utils/crawler");
const { web3, ContractAddress, isUSD, toBN } = require('../utils/bsc');
const { Partitioner, getLastLine, getLastFile, getLastFiles } = require('../utils/io');
const { getNumber } = require('../utils/format');

const SYNC_TOPIC = '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1';
const BLOCK_FILE = 'logs/sync.block';
const DATA_FOLDER = 'db/lpsync';

const getAmountOut = (amountIn, reserveIn, reserveOut) => {
    const amountInWithFee = amountIn.muln(9975);
    const numerator = amountInWithFee.mul(reserveOut);
    const denominator = reserveIn.muln(10000).add(amountInWithFee);
    return numerator.div(denominator);
}

const getAmountIn = (amountOut, reserveIn, reserveOut) => {
    const numerator = reserveIn.mul(amountOut).muln(10000);
    const denominator = reserveOut.sub(amountOut).muln(9975);
    return numerator.div(denominator).add(1);
}

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

const mergeCandle = (tokenCandle, bnbCandle, isToken0) => {
    let { o, c, h, l } = tokenCandle;
    let v = isToken0 ? tokenCandle.v0 : tokenCandle.v1;
    if (!isToken0) {
        o = 1 / tokenCandle.o
        c = 1 / tokenCandle.c
        l = 1 / tokenCandle.h
        h = 1 / tokenCandle.l
    }
    if (bnbCandle) {
        o = o * bnbCandle.o
        c = c * bnbCandle.c
        h = h * bnbCandle.h
        l = l * bnbCandle.l
    }
    return { o, c, h, l, v };
}

class SyncModel {
    constructor() {
        this.partitioner = new Partitioner(DATA_FOLDER);
        this.reserves = {};
        this.candles = {};
    }

    async runCrawler() {
        this.crawler = new Crawler("Sync", SYNC_TOPIC, BLOCK_FILE, async (log) => {
            const values = web3.eth.abi.decodeParameters(['uint256', 'uint256'], log.data)
            await this.writeSyncLog(log.blockNumber, log.transactionIndex, log.logIndex, log.address, values[0].toString(10), values[1].toString(10));
        }, 200);
        await this.crawler.run();
    }

    async loadCandle(pair) {
        const lastFiles = getLastFiles(`${DATA_FOLDER}/${pair}`);
        if (lastFiles.length == 0) return;
        let lastR0, lastR1;
        for (let i = 0; i < 2; i++) {
            const idx = parseInt(lastFiles[i]);
            await this.partitioner.loadLog(pair, idx, ([block, , , reserve0, reserve1]) => {
                let volume0 = toBN(0), volume1 = toBN(0);
                if (lastR0) volume0 = lastR0.sub(toBN(reserve0)).abs();
                if (lastR1) volume1 = lastR1.sub(toBN(reserve1)).abs();
                this.updateCandle(pair, block, this.calcPrice([reserve0, reserve1]), volume0, volume1);
                lastR0 = toBN(reserve0);
                lastR1 = toBN(reserve1);
            });
        }
    }

    updateCandle(pair, block, price, volume0, volume1) {
        if (!this.candles[pair]) return;
        if (!this.candles[pair][block]) this.candles[pair][block] = { o: price, c: price, h: price, l: price, v0: toBN(0), v1: toBN(0) };
        this.candles[pair][block].c = price;
        if (this.candles[pair][block].h < price) this.candles[pair][block].h = price;
        if (this.candles[pair][block].l > price) this.candles[pair][block].l = price;
        if (volume0) this.candles[pair][block].v0 = this.candles[pair][block].v0.add(volume0);
        if (volume1) this.candles[pair][block].v1 = this.candles[pair][block].v1.add(volume1);
    }

    async getCandles(pair) {
        if (!this.candles[pair]) {
            this.candles[pair] = {};
            await this.loadCandle(pair);
        }
        return this.candles[pair];
    }

    async getChart(pool, token, toBlock, toTs, countback, minuteCount) {
        const tokenCandles = await this.getCandles(pool.pair);
        const isToken0 = pool.token0 == token;
        const isBNBPair = (isToken0 ? pool.token1 : pool.token0) == ContractAddress.WBNB;
        const bnbCandles = isBNBPair ? await this.getBNBCandles() : undefined;

        const blockInterval = 20 * minuteCount;
        const rs = {};
        const updateRs = (t, { o, c, h, l, v }) => {
            if (!rs[t]) rs[t] = { o, c, h, l, v: toBN(0) };
            rs[t].c = c;
            if (rs[t].h < h) rs[t].h = h;
            if (rs[t].l > l) rs[t].l = l;
            rs[t].v = rs[t].v.add(v);
        }
        const fromBlock = toBlock - countback * blockInterval;
        const fromTs = toTs - countback * minuteCount * 60;
        for (let block = fromBlock; block <= toBlock; block++) {
            if (!tokenCandles[block]) continue;
            if (isBNBPair && !bnbCandles[block]) continue;
            const tick = mergeCandle(tokenCandles[block], isBNBPair ? bnbCandles[block] : undefined, isToken0);
            const ts = Math.floor((block - fromBlock) / blockInterval) * blockInterval * 3 + fromTs;
            updateRs(ts, tick);
        }
        for (let t in rs) rs[t].v = rs[t].v ? getNumber(rs[t].v.toString()) : 0;
        return rs;
    }

    calcPrice([reserve0, reserve1]) {
        if (reserve0 == "0") return 0;
        if (reserve1.length < 18) return 0;
        return parseInt(toBN(reserve1).muln(100000).div(toBN(reserve0))) / 100000;
    }

    correctPrice(price, decimals0 = 18, decimals1 = 18) {
        if (decimals0 == decimals1) return price;
        if (decimals0 < decimals1) return price / Math.pow(10, decimals1 - decimals0);
        if (decimals0 > decimals1) return price * Math.pow(10, decimals0 - decimals1);
    }

    async getBNBPrice() {
        return this.calcPrice(await this.getReserves(ContractAddress.PAIR_WBNB_BUSD));
    }

    async getBNBCandles() {
        return this.getCandles(ContractAddress.PAIR_WBNB_BUSD);
    }

    async loadBNBCandles() {
        const startMs = Date.now();
        const pair = ContractAddress.PAIR_WBNB_BUSD;
        this.candles[pair] = {};
        await this.loadCandle(pair);
        console.log(`Load BNB price (${Date.now() - startMs}ms)`)
    }

    async getPools(token, pairs) {
        const pools = [];
        for (let pair in pairs) {
            const pool = pairs[pair];
            const [reserve0, reserve1] = await this.getReserves(pair);
            pools.push({ pair, token0: pool.token0, token1: pool.token1, reserve0, reserve1, factory: pool.factory });
        }
        pools.sort((a, b) => toBN(b.token0 == token ? b.reserve0 : b.reserve1).gt(toBN(a.token0 == token ? a.reserve0 : a.reserve1)) ? 1 : -1);
        let tokenPrice = 0;
        let pricePool = undefined;
        for (let pool of pools) {
            if (isUSD(pool.token1)) tokenPrice = this.calcPrice([pool.reserve0, pool.reserve1]);
            else if (isUSD(pool.token0)) tokenPrice = this.calcPrice([pool.reserve1, pool.reserve0]);
            else if (pool.token1 == ContractAddress.WBNB) tokenPrice = await this.getBNBPrice() * this.calcPrice([pool.reserve0, pool.reserve1]);
            else if (pool.token0 == ContractAddress.WBNB) tokenPrice = await this.getBNBPrice() * this.calcPrice([pool.reserve1, pool.reserve0]);
            if (tokenPrice) {
                pricePool = pool;
                break;
            }
        }
        return { tokenPrice, pools, pricePool };
    }

    async getReserves(pair, isToken0 = true) {
        if (!this.reserves[pair]) {
            this.reserves[pair] = await getReserveFromLogs(pair);
        }
        const [reserve0, reserve1] = this.reserves[pair];
        return isToken0 ? [reserve0, reserve1] : [reserve1, reserve0];
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

    async getPath(tokenA, tokenB, pairsA, pairsB, amountIn = "1000000000000000000") {
        amountIn = toBN(amountIn);
        const lpA = {};
        for (let pair in pairsA) {
            if (pairsA[pair].token0 == tokenA) {
                lpA[pairsA[pair].token1] = { pair, isToken0: true };
            } else {
                lpA[pairsA[pair].token0] = { pair, isToken0: false };
            }
        }
        const lpB = {};
        for (let pair in pairsB) {
            if (pairsB[pair].token0 == tokenB) {
                lpB[pairsB[pair].token1] = { pair, isToken0: true };
            } else {
                lpB[pairsB[pair].token0] = { pair, isToken0: false };
            }
        }

        let feePaths = [];
        if (lpA[ContractAddress.BUSD]) {
            feePaths = [tokenA, ContractAddress.BUSD];
        } else if (lpA[ContractAddress.WBNB]) {
            feePaths = [tokenA, ContractAddress.WBNB];
        } else if (lpA[ContractAddress.USDT]) {
            feePaths = [tokenA, ContractAddress.USDT];
        }

        if (lpA[tokenB]) {
            const [reserveA, reserveB] = await this.getReserves(lpA[tokenB].pair, lpA[tokenB].isToken0);
            if (reserveA != '0' && reserveB != '0') {
                const amountOut = getAmountOut(amountIn, toBN(reserveA), toBN(reserveB)).toString(10);
                return { paths: [tokenA, tokenB], amountOut, feePaths };
            }
        }
        for (let tokenC in lpA) {
            if (!lpB[tokenC]) continue;
            const [reserveAC, reserveCA] = await this.getReserves(lpA[tokenC].pair, lpA[tokenC].isToken0);
            const [reserveBC, reserveCB] = await this.getReserves(lpB[tokenC].pair, lpB[tokenC].isToken0);
            if (reserveBC == '0' || reserveCB == '0' || reserveAC == '0' || reserveCA == '0') continue;
            const amountOut0 = getAmountOut(amountIn, toBN(reserveAC), toBN(reserveCA));
            const amountOut = getAmountOut(amountOut0, toBN(reserveCB), toBN(reserveBC)).toString(10);
            return { paths: [tokenA, tokenC, tokenB], amountOut, feePaths };
        }
        return { paths: [], amountOut: '0', feePaths };
    }

    async writeSyncLog(block, txIdx, logIdx, pair, reserve0, reserve1) {
        const idx = Math.floor(block / 100000);
        this.partitioner.getWriter(pair, idx).write(`${block},${txIdx},${logIdx},${reserve0},${reserve1}\n`);
        this.reserves[pair] = [reserve0, reserve1];
        this.updateCandle(pair, block, this.calcPrice([reserve0, reserve1]));
    }
}

module.exports = SyncModel;