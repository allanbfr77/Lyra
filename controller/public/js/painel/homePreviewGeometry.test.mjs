import test from 'node:test';
import assert from 'node:assert/strict';
import { limitarPreviaHome } from './homePreviewGeometry.js';

for (const [width, height] of [[1024, 640], [1280, 800], [1366, 768]]) {
  test(`prévia permanece acessível em ${width} × ${height}`, () => {
    for (const saved of [{}, { x: -5000, y: 8000, width: 9000 }, { x: Infinity, y: NaN, width: -1 }, { x: '9999', width: '600' }]) {
      const p = limitarPreviaHome(saved, { width, height, top: 104 });
      assert.ok(p.x >= 8 && p.y >= 104);
      assert.ok(p.width >= 260 && p.width <= 680);
      assert.ok(p.x + p.width <= width - 8);
      assert.ok(p.y + p.height <= height - 8);
      assert.equal(p.height, p.width * 9 / 16 + 104);
    }
  });
}
test('restauração após redução preserva tamanho válido e traz a janela de volta', () => {
  const p = limitarPreviaHome({ x: 1400, y: 800, width: 380 }, { width: 1024, height: 640, top: 100 });
  assert.equal(p.width, 380);
  assert.ok(p.x < 1024 && p.y < 640);
  assert.deepEqual(limitarPreviaHome(p, { width: 1024, height: 640, top: 100 }), p);
});
