module.exports = {
  apps: [
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
    },
    {
      name: "limitorder-api",
      script: "src/limitorder/service.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "2000M",
      watch: false,
      time: true
    },
    {
      name: "balance-indexer",
      script: "src/balance/run.js",
      node_args: "--max-old-space-size=10240",
      instances: 1,
      exec_mode: "fork",
      cron_restart: "0 1 * * *",
      watch: false,
      autorestart: false
    },
    {
      name: "bot",
      script: "src/bot/index.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "2000M",
      watch: false,
      time: true
    }
  ]
};