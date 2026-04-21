const fs = require('fs');
const path = require('path');

function getConfigPath() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'user-config.json');
  } catch (_) {
    return path.join(process.env.USER_CONFIG_DIR || '/tmp', 'user-config.json');
  }
}

function getConfig() {
  const p = getConfigPath();
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function saveConfig(data) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(data, null, 2));
}

function isConfigured() {
  const cfg = getConfig();
  return !!(cfg && cfg.user && cfg.smtpUser && cfg.smtpPass && cfg.saveFolder);
}

module.exports = { getConfig, saveConfig, isConfigured };
