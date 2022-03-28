module.exports = {
  apps: [
    {
      name: "common-api",
      script: "src/common/service.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "2000M",
      watch: false,
      time: true
    },
    {
      name: "liquidity-api",
      script: "src/liquidity/service.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "2000M",
      watch: false,
      time: true
    },
    {
      name: "swap-api",
      script: "src/swap/service.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "2000M",
      watch: false,
      time: true
    },
    {
      name: "balance-api",
      script: "src/balance/service.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "2000M",
      watch: false,
      time: true
    }
  ]
};