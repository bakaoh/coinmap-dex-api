const LpModel = require('./lp');

const m = new LpModel();
m.loadLpDetailFile().then(() => m.createTokenDetailFile());