module.exports = {
  apps: [
    {
      name: "capitalife",
      script: "node_modules/next/dist/bin/next",
      args: "dev",
      cwd: "C:\\Users\\joris\\Documents\\Capitalife Terminal",
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
