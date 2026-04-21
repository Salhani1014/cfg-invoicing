const fs = require('fs');
const path = require('path');
const os = require('os');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-user-config-'));
  process.env.USER_CONFIG_DIR = tmpDir;
  jest.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.USER_CONFIG_DIR;
});

function load() {
  return require('../src/user-config');
}

test('isConfigured returns false when no file exists', () => {
  expect(load().isConfigured()).toBe(false);
});

test('getConfig returns null when no file exists', () => {
  expect(load().getConfig()).toBeNull();
});

test('saveConfig + getConfig round-trips', () => {
  const { saveConfig, getConfig } = load();
  saveConfig({ user: 'braxton', smtpUser: 'b@cfg.com', smtpPass: 'xxxx xxxx', saveFolder: '/tmp/inv' });
  const cfg = getConfig();
  expect(cfg.user).toBe('braxton');
  expect(cfg.smtpUser).toBe('b@cfg.com');
  expect(cfg.smtpPass).toBe('xxxx xxxx');
  expect(cfg.saveFolder).toBe('/tmp/inv');
});

test('isConfigured returns true after complete config is saved', () => {
  const { saveConfig, isConfigured } = load();
  saveConfig({ user: 'braxton', smtpUser: 'b@cfg.com', smtpPass: 'xxxx xxxx', saveFolder: '/tmp/inv' });
  expect(isConfigured()).toBe(true);
});

test('isConfigured returns false if smtpPass is empty', () => {
  const { saveConfig, isConfigured } = load();
  saveConfig({ user: 'braxton', smtpUser: 'b@cfg.com', smtpPass: '', saveFolder: '/tmp/inv' });
  expect(isConfigured()).toBe(false);
});

test('isConfigured returns false if saveFolder is missing', () => {
  const { saveConfig, isConfigured } = load();
  saveConfig({ user: 'braxton', smtpUser: 'b@cfg.com', smtpPass: 'xxxx' });
  expect(isConfigured()).toBe(false);
});
