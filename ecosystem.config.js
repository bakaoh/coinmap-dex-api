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
      name: "swap-api",
      script: "src/swap/service.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "2000M",
      watch: false,
      time: true
    },
    {
      name: "cmc6",
      script: "src/balance/crawler.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      max_memory_restart: "4000M",
      watch: false,
      time: true,
      env: { IID_OFFSET: 6 }
    },
    {
      name: "cmc7",
      script: "src/balance/crawler.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      max_memory_restart: "4000M",
      watch: false,
      time: true,
      env: { IID_OFFSET: 7 }
    },
    {
      name: "cmc8",
      script: "src/balance/crawler.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      max_memory_restart: "4000M",
      watch: false,
      time: true,
      env: { IID_OFFSET: 8 }
    },
    {
      name: "cmc9",
      script: "src/balance/crawler.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      max_memory_restart: "4000M",
      watch: false,
      time: true,
      env: { IID_OFFSET: 9 }
    },
    {
      name: "cmc10",
      script: "src/balance/crawler.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      max_memory_restart: "4000M",
      watch: false,
      time: true,
      env: { IID_OFFSET: 10 }
    },
    {
      name: "cmc11",
      script: "src/balance/crawler.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      max_memory_restart: "4000M",
      watch: false,
      time: true,
      env: { IID_OFFSET: 11 }
    },
    {
      name: "cmc12",
      script: "src/balance/crawler.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      max_memory_restart: "4000M",
      watch: false,
      time: true,
      env: { IID_OFFSET: 12 }
    },
    {
      name: "cmc13",
      script: "src/balance/crawler.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      max_memory_restart: "4000M",
      watch: false,
      time: true,
      env: { IID_OFFSET: 13 }
    },
    {
      name: "cmc14",
      script: "src/balance/crawler.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      max_memory_restart: "4000M",
      watch: false,
      time: true,
      env: { IID_OFFSET: 14 }
    },
    {
      name: "cmc15",
      script: "src/balance/crawler.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      max_memory_restart: "4000M",
      watch: false,
      time: true,
      env: { IID_OFFSET: 15 }
    }
  ]
};