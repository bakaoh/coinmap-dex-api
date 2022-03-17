module.exports = {
  apps: [
    {
      name: "block-api",
      script: "src/block/service.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1000M",
      watch: false,
      time: true
    }
  ]
};