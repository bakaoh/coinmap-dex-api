const getNumber = (bn, n = 0) => parseInt(bn.substr(0, bn.length + n - 18) || '0') / (10 ** n);

module.exports = { getNumber }