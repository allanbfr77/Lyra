'use strict';

const fs = require('fs');

function loadPlaylistsJson(playlistsJsonPathFn) {
  try {
    const raw = fs.readFileSync(playlistsJsonPathFn(), 'utf8');
    const d = JSON.parse(raw);
    return typeof d === 'object' && d && !Array.isArray(d) ? d : {};
  } catch (_) {
    return {};
  }
}

function savePlaylistsJson(playlistsJsonPathFn, obj) {
  fs.writeFileSync(playlistsJsonPathFn(), JSON.stringify(obj, null, 2), 'utf8');
}

module.exports = { loadPlaylistsJson, savePlaylistsJson };
