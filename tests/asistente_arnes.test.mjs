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

test('el arnes prohibe salir a la red, lo registra y restaurar() lo hace fallar', async () => {
  const a = anthropicFalso([]);
  await assert.rejects(() => fetch('https://example.com/x'), /prohibida.*example\.com/);
  assert.deepEqual(a.prohibidas, ['https://example.com/x']);
  // aunque el codigo bajo prueba se haya tragado el error, el cierre falla
  assert.throws(() => a.restaurar(), /prohibidas/);
});

test('anthropicFalso deja pasar api.anthropic.com y entrega la respuesta en orden', async () => {
  const a = anthropicFalso([{ n: 1 }, { n: 2 }]);
  try {
    const r1 = await (await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{"q":1}' })).json();
    const r2 = await (await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{"q":2}' })).json();
    assert.deepEqual([r1, r2], [{ n: 1 }, { n: 2 }]);
    assert.deepEqual(a.cuerpos, ['{"q":1}', '{"q":2}']);
    assert.equal(a.llamadas.length, 2);
  } finally { a.restaurar(); }
});

test('conReloj fija tambien new Date() sin argumentos y lo restaura', async () => {
  const D = Date;
  const ms = Date.UTC(2026, 10, 24, 9, 1);
  await conReloj(ms, () => {
    assert.equal(new Date().toISOString(), '2026-11-24T09:01:00.000Z');
    assert.equal(Date.now(), ms);
    assert.equal(new Date(0).getTime(), 0);
    assert.ok(new Date() instanceof D);
  });
  assert.equal(globalThis.Date, D);
  assert.ok(Math.abs(new Date().getTime() - Date.now()) < 1000 && Date.now() !== ms);
});
