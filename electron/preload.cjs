'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('chrysalisDesktop', Object.freeze({
  runtime: 'electron',
  wrapper: 'local-unsigned',
  target: process.env.CHRYSALIS_TARGET || '',
  profile: process.env.CHRYSALIS_PORTABLE_PROFILE || '',
  angleBackend: process.env.CHRYSALIS_ANGLE_BACKEND || 'default',
  frameLimit: process.env.CHRYSALIS_FRAME_LIMIT || 'vsync',
  zeroCopy: process.env.CHRYSALIS_ZERO_COPY !== '0'
}));
