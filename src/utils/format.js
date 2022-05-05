const getNumber = (bn, n = 0, decimals = 18) => parseInt(bn.substr(0, bn.length + n - decimals) || '0') / (10 ** n);

module.exports = { getNumber }