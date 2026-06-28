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
      // Log file paths (PM2 defaults to ~/.pm2/logs/)
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      time: true,
      // Graceful restart: reload instead of restart to avoid dropped connections
      wait_ready: false,
      kill_timeout: 5000,
      listen_timeout: 10000,
      // Auto-restart policy
      min_uptime: '10s',
      max_restarts: 10,
      max_restarts_delay: 3000,
    },
  ],
};
