'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, shell, powerSaveBlocker } = require('electron');

const isMac = process.platform === 'darwin';
const targetProfile = (process.env.CHRYSALIS_TARGET || 'macbook-air-2019-intel').toLowerCase();
const angleBackend = (process.env.CHRYSALIS_ANGLE_BACKEND || '').toLowerCase();
const zeroCopyEnabled = process.env.CHRYSALIS_ZERO_COPY !== '0';
const frameLimitMode = (process.env.CHRYSALIS_FRAME_LIMIT || 'vsync').toLowerCase();
let powerBlockerId = null;

// Local desktop host for the 2019 13-inch Intel MacBook Air target:
//   macOS Sonoma 14.8.5, Intel x64, Intel UHD 617 shared graphics, 8 GB LPDDR3.
// This wrapper only changes Chromium/Electron shell behavior. It does not alter
// Chrysalis step regimes, canvas/pixel resolution, mipmaps, shader sampling,
// PBO/backflow, autonomy routing, portal navigation, or simulation math.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
if (zeroCopyEnabled) app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', [
  'CalculateNativeWinOcclusion',
  'IntensiveWakeUpThrottling'
].join(','));

// Optional high-refresh presentation profile. This changes Chromium/Electron
// presentation pacing only. The renderer still keeps Chrysalis on its fixed
// simulation dt and existing step-regime semantics.
if (frameLimitMode === 'unlocked' || frameLimitMode === 'uncapped') {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
}
if (frameLimitMode === 'unlocked-no-vsync' || frameLimitMode === 'uncapped-no-vsync') {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}
if (process.env.CHRYSALIS_SHOW_FPS_COUNTER === '1') {
  app.commandLine.appendSwitch('show-fps-counter');
}

// Default: let Chromium pick the safest WebGL/ANGLE backend for the driver.
// Test-only override examples:
//   CHRYSALIS_ANGLE_BACKEND=metal npm start       (macOS)
//   CHRYSALIS_ANGLE_BACKEND=opengl npm start      (fallback/test)
//   CHRYSALIS_ANGLE_BACKEND=vulkan npm start      (branch-only experiment)
if (['metal', 'opengl', 'default', 'd3d11', 'd3d9', 'vulkan'].includes(angleBackend)) {
  app.commandLine.appendSwitch('use-angle', angleBackend);
}

app.setName('Chrysalis');


function safeMkdir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
}

function slug(value) {
  return String(value || 'local')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'local';
}

function resolvePortableRoot() {
  if (process.env.CHRYSALIS_PORTABLE_ROOT) {
    return path.resolve(process.env.CHRYSALIS_PORTABLE_ROOT);
  }

  const appPath = app.getAppPath();
  const resourcesApp = path.join('resources', 'app');
  if (appPath.endsWith(resourcesApp) || appPath.includes(resourcesApp + path.sep)) {
    return path.dirname(process.execPath);
  }

  return appPath;
}

function installPortableDataPaths() {
  const portableRoot = resolvePortableRoot();
  const profile = slug(process.env.CHRYSALIS_PORTABLE_PROFILE || targetProfile || process.platform);
  const base = path.join(portableRoot, 'runtime', 'user-data', profile);
  const userData = path.join(base, 'userData');
  const sessionData = path.join(base, 'sessionData');
  const logs = path.join(base, 'logs');

  safeMkdir(userData);
  safeMkdir(sessionData);
  safeMkdir(logs);

  try { app.setPath('userData', userData); } catch (_) {}
  try { app.setPath('sessionData', sessionData); } catch (_) {}
  try { app.setAppLogsPath(logs); } catch (_) {}

  return { portableRoot, profile, userData, sessionData, logs };
}

const portablePaths = installPortableDataPaths();

function createWindow() {
  const win = new BrowserWindow({
    title: 'Chrysalis Frontier · macOS Sonoma Electron',
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#02030a',
    show: false,
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webgl: true,
      backgroundThrottling: false,
      devTools: true,
      spellcheck: false
    }
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));
  return win;
}

function installMenu(win) {
  const profileLabel = targetProfile.includes('macbook-air')
    ? 'MacBook Air 2019 Intel profile'
    : 'Local Electron profile';
  const frameLimitLabel = frameLimitMode === 'unlocked' || frameLimitMode === 'uncapped'
    ? 'Frame pacing: unlocked frame-rate limit'
    : frameLimitMode === 'unlocked-no-vsync' || frameLimitMode === 'uncapped-no-vsync'
      ? 'Frame pacing: unlocked + vsync disabled test'
      : 'Frame pacing: display/vsync default';

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'Chrysalis',
      submenu: [
        { label: profileLabel, enabled: false },
        { label: frameLimitLabel, enabled: false },
        { label: 'Portable data: ' + portablePaths.profile, enabled: false },
        { label: 'Open Portable Data Folder', click: () => shell.openPath(path.join(portablePaths.portableRoot, 'runtime', 'user-data')) },
        { type: 'separator' },
        { label: 'Reload Shell', accelerator: 'CmdOrCtrl+R', click: () => win.reload() },
        { label: 'Toggle DevTools', accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I', click: () => win.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: 'Toggle Fullscreen', accelerator: isMac ? 'Ctrl+Command+F' : 'F11', click: () => win.setFullScreen(!win.isFullScreen()) },
        { label: 'Hide Native Menu', click: () => win.setMenuBarVisibility(false), visible: !isMac },
        { type: 'separator' },
        { role: isMac ? 'close' : 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function startPowerBlocker() {
  if (powerBlockerId !== null) return;
  try {
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  } catch (_) {
    powerBlockerId = null;
  }
}

app.whenReady().then(() => {
  startPowerBlocker();
  const win = createWindow();
  installMenu(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const next = createWindow();
      installMenu(next);
    }
  });
});

app.on('window-all-closed', () => {
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
  }
  if (!isMac) app.quit();
});
