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
const ipk = fs.readFileSync(ipkPath);
const sha256 = crypto.createHash('sha256').update(ipk).digest('hex');

const manifest = {
  id: appinfo.id,
  version: appinfo.version,
  type: appinfo.type,
  title: appinfo.title,
  appDescription: appinfo.appDescription,
  iconUri: 'https://raw.githubusercontent.com/swenz/webos-custom-launcher/main/app/largeIcon.png',
  sourceUrl: repo,
  rootRequired: true,
  ipkUrl: `${repo}/releases/download/v${appinfo.version}/${ipkName}`,
  ipkHash: { sha256 },
  ipkSize: ipk.length
};

const out = path.join(root, `${appinfo.id}.manifest.json`);
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${path.basename(out)}  sha256=${sha256}`);
