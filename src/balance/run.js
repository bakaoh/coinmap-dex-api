const axios = require("axios");
const Indexer = require('./indexer');

const COMMON_BASE = 'http://128.199.189.253:9610';

async function run() {
    const { ts, block } = (await axios.get(`${COMMON_BASE}/block/startofday?n=365`)).data;
    const indexer = new Indexer('0x4556A6f454f15C4cD57167a62bdA65A6be325D1F');
    await indexer.run(block);
}

run();