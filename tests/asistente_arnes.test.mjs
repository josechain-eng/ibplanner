// Prueba del arnes: worker real, KV falso, reloj fijo y red prohibida.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarWorker, kvFalso, envFalso, conReloj, anthropicFalso } from './_arnes_cron.mjs';

test('el arnes dispara el respaldo de las 09:00 UTC y no a las 09:05', async () => {
  const w = await cargarWorker();
  const kv = kvFalso({ 'synckeys_registry': JSON.stringify(['k1']), 'data:k1': '{"tasks":[]}' });
  // 09:01 UTC -> respalda
  await conReloj(Date.UTC(2026, 10, 24, 9, 1), () => w.scheduled({}, envFalso({ LBP_KV: kv })));
  assert.ok([...kv._map.keys()].some(k => k.startsWith('backup:k1:')), 'no respaldo en su ventana');
  // 09:05 UTC, kv limpio -> no respalda (la ventana es mm < 3)
  const kv2 = kvFalso({ 'synckeys_registry': JSON.stringify(['k1']), 'data:k1': '{"tasks":[]}' });
  await conReloj(Date.UTC(2026, 10, 24, 9, 5), () => w.scheduled({}, envFalso({ LBP_KV: kv2 })));
  assert.ok(![...kv2._map.keys()].some(k => k.startsWith('backup:')), 'respaldo fuera de su ventana');
});

test('conReloj restaura Date.now aunque la funcion lance', async () => {
  const antes = Date.now;
  await assert.rejects(() => conReloj(0, () => { throw new Error('x'); }));
  assert.equal(Date.now, antes);
});

test('el arnes prohibe salir a la red', async () => {
  const a = anthropicFalso([]);
  try { await assert.rejects(() => fetch('https://example.com')); } finally { a.restaurar(); }
});
