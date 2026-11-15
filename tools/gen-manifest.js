#!/usr/bin/env node
/* Writes the webosbrew (Homebrew Channel) manifest for the packaged IPK. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const appinfo = JSON.parse(fs.readFileSync(path.join(root, 'app', 'appinfo.json'), 'utf8'));
const repo = 'https://github.com/swenz/webos-custom-launcher';
const ipkName = `${appinfo.id}_${appinfo.version}_all.ipk`;
const ipkPath = path.join(root, 'dist', ipkName);
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(ipkPath)).digest('hex');

const manifest = {
  id: appinfo.id,
  version: appinfo.version,
  type: appinfo.type,
  title: appinfo.title,
  appDescription: appinfo.appDescription,
  iconUri: `${repo}/raw/main/app/largeIcon.png`,
  sourceUrl: repo,
  rootRequired: true,
  ipkUrl: `${repo}/releases/download/v${appinfo.version}/${ipkName}`,
  ipkHash: { sha256 }
};

const out = path.join(root, `${appinfo.id}.manifest.json`);
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${path.basename(out)}  sha256=${sha256}`);
