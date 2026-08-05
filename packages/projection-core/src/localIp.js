'use strict';

const { networkInterfaces } = require('os');

/**
 * Todos os IPv4 não-internos desta máquina (todas as interfaces).
 * @returns {string[]}
 */
function listLocalIPv4() {
  const nets = networkInterfaces();
  const out = [];
  const seen = new Set();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      const isV4 = net.family === 'IPv4' || net.family === 4;
      if (!isV4 || net.internal) continue;
      const addr = String(net.address || '').trim();
      if (!addr || seen.has(addr)) continue;
      seen.add(addr);
      out.push(addr);
    }
  }
  return out;
}

/**
 * IPv4 “principal” para exibir ao usuário (LAN), penalizando interfaces virtuais.
 * @returns {string}
 */
function getPreferredLocalIPv4() {
  const nets = networkInterfaces();

  const isV4 = (net) => net.family === 'IPv4' || net.family === 4;

  const isVirtualAdapterName = (name) => {
    const n = String(name).toLowerCase();
    return (
      n.includes('vethernet') || n.includes('hyper-v') || n.includes('wsl') ||
      n.includes('virtualbox') || n.includes('vmware') || n.includes('docker') ||
      n.includes('tailscale') || n.includes('zerotier')
    );
  };

  const score = (address, ifaceName) => {
    let s = 0;
    const [a, b] = address.split('.').map(Number);
    if (a === 192 && b === 168) s += 120;
    else if (a === 10) s += 90;
    else if (a === 172 && b >= 16 && b <= 31) s += 40;
    const nm = String(ifaceName).toLowerCase();
    if (nm.includes('wi-fi') || nm.includes('wifi') || nm.includes('wlan') || nm.includes('wireless')) s += 60;
    if (nm.includes('ethernet') || nm.includes('gb ethernet') || nm === 'eth') s += 55;
    if (isVirtualAdapterName(ifaceName)) s -= 250;
    return s;
  };

  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (!isV4(net) || net.internal) continue;
      candidates.push({ address: net.address, name, score: score(net.address, name) });
    }
  }

  if (candidates.length === 0) return 'localhost';
  candidates.sort((x, y) => y.score - x.score);
  return candidates[0].address;
}

module.exports = { getPreferredLocalIPv4, listLocalIPv4 };
