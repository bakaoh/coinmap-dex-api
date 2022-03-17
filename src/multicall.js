const { Interface } = require('@ethersproject/abi');
const Web3 = require("web3");

const PancakePairAbi = require('./abi/PancakePair.json');
const MulticallAbi = require('./abi/Multicall2.json');

const endpoint = "https://bsc-dataseed.binance.org";
const web3 = new Web3(endpoint);
const multicall = new web3.eth.Contract(MulticallAbi, '0x17e939b6fedFd86127c4F79B2180de5feE3a772d');

async function aggregate(calldata, abi) {
    const iface = new Interface(abi);
    const { returnData } = await multicall.methods.aggregate(calldata.map(i => {
        return [i[0].toLowerCase(), iface.encodeFunctionData(i[1], i[2])]
    })).call();
    return returnData.map((d, i) => {
        return iface.decodeFunctionResult(calldata[i][1], d)
    })
}

async function getLPToken01(addresses) {
    const calldata = [];
    addresses.forEach(address => {
        calldata.push([address, 'token0', []]);
        calldata.push([address, 'token1', []]);
    })
    const data = await aggregate(calldata, PancakePairAbi);
    const rs = [];
    for (let i = 0; i < addresses.length; i++) {
        rs.push([addresses[i], data[i * 2][0], data[i * 2 + 1][0]]);
    }
    return rs;
}

module.exports = { aggregate, getLPToken01 };