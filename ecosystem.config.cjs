module.exports = {
  apps: [
    {
      name: 'ejs-api',
      script: 'backend/api/dist/index.js',
      node_args: '-r backend/api/dist/tracing.js',
      cwd: '/home/ubuntu/Email-Job-Scheduler',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: { NODE_ENV: 'production', OTEL_SERVICE_NAME: 'ejs-api' },
    },
    {
      name: 'ejs-worker',
      script: 'backend/worker/dist/index.js',
      node_args: '-r backend/worker/dist/tracing.js',
      cwd: '/home/ubuntu/Email-Job-Scheduler',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: { NODE_ENV: 'production', OTEL_SERVICE_NAME: 'ejs-worker' },
    },
  ],
};
