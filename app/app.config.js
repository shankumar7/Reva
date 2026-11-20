// Uses app.json, and switches on push notifications only if google-services.json (from your free Firebase
// project) sits next to this file. Without it the app still builds and works, just without push.
const fs = require('fs');
const base = require('./app.json').expo;

module.exports = () => {
  const hasFirebase = fs.existsSync(__dirname + '/google-services.json');
  const config = JSON.parse(JSON.stringify(base));
  config.plugins = [
    ...config.plugins,
    ['expo-notifications', { icon: './assets/notification-icon.png', defaultChannel: 'general' }],
  ];
  if (hasFirebase) config.android.googleServicesFile = './google-services.json';
  return config;
};
