module.exports = {
  apps: [
    {
      name: "common-api",
      script: "src/common/service.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1000M",
      watch: false,
      time: true
    }
  ]
};