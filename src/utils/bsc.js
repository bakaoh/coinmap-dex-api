const Web3 = require("web3");
const { pack, keccak256 } = require('@ethersproject/solidity');
const { getCreate2Address } = require('@ethersproject/address');

const PANCAKE_INIT_CODE_HASH = '0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5'
const ENDPOINT = "https://bsc-dataseed.binance.org";

const web3 = new Web3(ENDPOINT);

const ContractAddress = {
    PANCAKE_FACTORY: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
}

function getPairAddress(tokenA, tokenB) {
    const tokens = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA]
    return getCreate2Address(
        ContractAddress.PANCAKE_FACTORY,
        keccak256(['bytes'], [pack(['address', 'address'], [tokens[0], tokens[1]])]),
        PANCAKE_INIT_CODE_HASH
    )
}

module.exports = { getPairAddress, ContractAddress, web3 };