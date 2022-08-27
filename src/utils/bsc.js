const Web3 = require("web3");
const { pack, keccak256 } = require('@ethersproject/solidity');
const { getCreate2Address, getAddress } = require('@ethersproject/address');

const PANCAKE_INIT_CODE_HASH = '0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5'
const ENDPOINT = "https://long-long-firefly.bsc.discover.quiknode.pro/983a15976ac7d53feeaea731413e2bb7d4a7a298/";

const web3 = new Web3(ENDPOINT);

const ContractAddress = {
    PANCAKE_ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    PANCAKE_FACTORY: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    APESWAP_FACTORY: '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6',
    BISWAP_FACTORY: '0x858E3312ed3A876947EA49d572A7C42DE08af7EE',
    PAIR_WBNB_BUSD: '0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16',
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

const getAddress2 = (token) => {
    const name = token.toUpperCase();
    if (name == 'WBNB') return ContractAddress.WBNB;
    if (name == 'BUSD') return ContractAddress.BUSD;
    if (name == 'CAKE') return ContractAddress.CAKE;
    if (name == 'USDT') return ContractAddress.USDT;
    return getAddress(token);
}

const isUSD = (address) => address == ContractAddress.BUSD || address == ContractAddress.USDT;
const isSupportFactory = (address) => address == ContractAddress.PANCAKE_FACTORY || address == ContractAddress.APESWAP_FACTORY //|| address == ContractAddress.BISWAP_FACTORY;
const getFactoryName = (address) => {
    if (address == ContractAddress.PANCAKE_FACTORY) return "Pancake v2";
    if (address == ContractAddress.APESWAP_FACTORY) return "ApeSwap";
    if (address == ContractAddress.BISWAP_FACTORY) return "Biswap";
    return "Uniswap v2";
}

module.exports = {
    getPairAddress,
    ContractAddress,
    web3,
    getAddress: getAddress2,
    toBN: Web3.utils.toBN,
    isUSD,
    isSupportFactory,
    getFactoryName
};