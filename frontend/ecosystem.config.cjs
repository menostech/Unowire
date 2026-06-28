// PM2 process manager configuration for Unowire Next.js production
// Usage: cd frontend && pm2 start ecosystem.config.cjs
// Docs: https://pm2.keymetrics.io/docs/usage/application-declaration/

module.exports = {
  apps: [
    {
      name: 'unowire-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_file: '.env.production',
      // 日志路径（PM2 默认在 ~/.pm2/logs/）
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      time: true,
      // 优雅重启：reload 而非 restart，避免连接中断
      wait_ready: false,
      kill_timeout: 5000,
      listen_timeout: 10000,
      // 自动重启策略
      min_uptime: '10s',
      max_restarts: 10,
      max_restarts_delay: 3000,
    },
  ],
};
