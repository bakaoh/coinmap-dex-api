const getNumber = (bn, n = 0, decimals = 18) => parseInt(bn.substr(0, bn.length + n - decimals) || '0') / (10 ** n);

const getPrice = (price, decimals0 = 18, decimals1 = 18) => {
    if (decimals0 == decimals1) return price;
    if (decimals0 < decimals1) return price / Math.pow(10, decimals1 - decimals0);
    if (decimals0 > decimals1) return price * Math.pow(10, decimals0 - decimals1);
}

module.exports = { getNumber, getPrice }