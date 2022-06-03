const { Interface } = require('@ethersproject/abi');
const Web3 = require("web3");

const Erc20Abi = require('./abi/Erc20.json');
const PancakePairAbi = require('./abi/PancakePair.json');
const MulticallAbi = require('./abi/Multicall2.json');
const GetErc20Abi = require('./abi/GetERC20Metadata.json');
const CheckAddressAbi = require('./abi/CheckAddress.json');

const endpoint = "https://bsc-dataseed.binance.org";
const web3 = new Web3(endpoint);
const multicall = new web3.eth.Contract(MulticallAbi, '0x17e939b6fedFd86127c4F79B2180de5feE3a772d');
const multiget = new web3.eth.Contract(GetErc20Abi, '0x6AC92802fa2ad602b9b9C77014B0f016CC3774DF');
const multicheck = new web3.eth.Contract(CheckAddressAbi, '0x4ACDA59dca8C22b5f8eC09A747776af0f16187d3');

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

async function getTokenInfo(addresses) {
    const calldata = [];
    addresses.forEach(address => {
        calldata.push([address, 'symbol', []]);
        calldata.push([address, 'name', []]);
    })
    const data = await aggregate(calldata, Erc20Abi);
    const rs = [];
    for (let i = 0; i < addresses.length; i++) {
        rs.push([addresses[i], data[i * 2][0], data[i * 2 + 1][0]]);
    }
    return rs;
}

async function getTokenMetadata(addresses) {
    const { names, symbols, decimals } = await multiget.methods.getMulti(addresses).call();
    const rs = [];
    for (let i = 0; i < addresses.length; i++) {
        rs.push([addresses[i], names[i], symbols[i], decimals[i]]);
    }
    return rs;
}

async function checkIsContract(addresses) {
    const isContract = await multicheck.methods.checkMulti(addresses).call();
    const rs = [];
    for (let i = 0; i < addresses.length; i++) {
        if (!isContract[i]) rs.push(addresses);
    }
    return rs;
}

module.exports = { aggregate, getLPToken01, getTokenInfo, getTokenMetadata, checkIsContract };
