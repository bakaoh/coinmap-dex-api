const Crawler = require("../utils/crawler");
const { web3, ContractAddress, isUSD, toBN } = require('../utils/bsc');
const { Partitioner, getLastLine, getLastFile, getLastFiles } = require('../utils/io');
const { getNumber } = require('../utils/format');

const SYNC_TOPIC = '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1';
const BLOCK_FILE = 'logs/sync.block';
const DATA_FOLDER = 'db/lpsync';
const ZERO = toBN(0);

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
        if (lastFile == '') return [ZERO, ZERO];;
        const lastLine = await getLastLine(`${DATA_FOLDER}/${pair}/${lastFile}`);
        const p = lastLine.split(',');
        if (p.length != 5) return [ZERO, ZERO];
        return [toBN(p[3]), toBN(p[4])];
    } catch (err) {
        return [ZERO, ZERO];
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
        for (let i = 0; i < 4; i++) {
            const idx = parseInt(lastFiles[i]);
            await this.partitioner.loadLog(pair, idx, ([block, , , reserve0, reserve1]) => {
                this.updateCandle(pair, block, reserve0, reserve1);
            });
        }
    }

    updateCandle(pair, block, reserve0, reserve1) {
        reserve0 = toBN(reserve0);
        reserve1 = toBN(reserve1);
        if (this.candles[pair]) {
            block = Math.floor(block / 20);
            const price = this.calcPrice([reserve0, reserve1]);
            if (!this.candles[pair][block]) this.candles[pair][block] = { o: price, c: price, h: price, l: price, v0: ZERO, v1: ZERO };
            this.candles[pair][block].c = price;
            if (this.candles[pair][block].h < price) this.candles[pair][block].h = price;
            if (this.candles[pair][block].l > price) this.candles[pair][block].l = price;
            if (this.reserves[pair]) {
                this.candles[pair][block].v0 = this.candles[pair][block].v0.add(this.reserves[pair][0].sub(reserve0).abs());
                this.candles[pair][block].v1 = this.candles[pair][block].v1.add(this.reserves[pair][1].sub(reserve1).abs());
            }
        }
        this.reserves[pair] = [reserve0, reserve1];
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

        const rs = {};
        const updateRs = (t, { o, c, h, l, v }) => {
            if (!rs[t]) rs[t] = { o, c, h, l, v: toBN(0) };
            rs[t].c = c;
            if (rs[t].h < h) rs[t].h = h;
            if (rs[t].l > l) rs[t].l = l;
            rs[t].v = rs[t].v.add(v);
        }
        toBlock = Math.ceil(toBlock / 20);
        const fromBlock = toBlock - countback * minuteCount;
        const fromTs = toTs - countback * minuteCount * 60;
        for (let block = fromBlock; block <= toBlock; block++) {
            if (!tokenCandles[block]) continue;
            if (isBNBPair && !bnbCandles[block]) continue;
            const tick = mergeCandle(tokenCandles[block], isBNBPair ? bnbCandles[block] : undefined, isToken0);
            const ts = Math.floor((block - fromBlock) / minuteCount) * minuteCount * 60 + fromTs;
            updateRs(ts, tick);
        }
        for (let t in rs) rs[t].v = rs[t].v ? getNumber(rs[t].v.toString()) : 0;
        return rs;
    }

    calcPrice([reserve0, reserve1]) {
        if (reserve0 == ZERO || reserve1 == ZERO) return 0;
        return parseInt(reserve1.mul(toBN("100000000")).div(reserve0)) / 100000000;
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
        console.log(`Load BNB candles (${Date.now() - startMs}ms)`)
    }

    async getPools(token, pairs) {
        const pools = [];
        for (let pair in pairs) {
            const pool = pairs[pair];
            const [reserve0, reserve1] = await this.getReserves(pair);
            pools.push({ pair, token0: pool.token0, token1: pool.token1, reserve0, reserve1, factory: pool.factory });
        }
        pools.sort((a, b) => (b.token0 == token ? b.reserve0 : b.reserve1).gt(a.token0 == token ? a.reserve0 : a.reserve1) ? 1 : -1);
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
        const fromIdx = Math.floor(checkpoints[0] / Partitioner.BPF);
        const toIdx = Math.ceil(checkpoints[checkpoints.length - 1] / Partitioner.BPF);
        const rs = [];
        for (let idx = fromIdx; idx <= toIdx; idx++) {
            try {
                await this.partitioner.loadLog(pair, idx, ([block, , , reserve0, reserve1]) => {
                    while (block > parseInt(checkpoints[cid])) {
                        const r0 = toBN(reserve0);
                        const r1 = toBN(reserve1);
                        rs.push(isToken0 ? [r0, r1] : [r1, r0]);
                        cid++;
                    }
                });
            } catch (err) {
                if (!err.toString().includes('no such file')) { }
                const block = (idx) * Partitioner.BPF;
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
        const idx = Math.floor(block / Partitioner.BPF);
        this.partitioner.getWriter(pair, idx).write(`${block},${txIdx},${logIdx},${reserve0},${reserve1}\n`);
        this.updateCandle(pair, block, reserve0, reserve1);
    }
}

module.exports = SyncModel;