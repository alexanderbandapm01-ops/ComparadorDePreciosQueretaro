'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { recomendar } = require('../src/recomendador');

const auto = { factor: 0.192, velocidad: 25, espera: 0, costoKm: 2.6, costoTrayecto: 0 };
const origen = { lat: 20.59, lon: -100.39 };
const sucursales = [
  { id: 1, lat: 20.592, lon: -100.39 }, // cerca, cara
  { id: 2, lat: 20.70, lon: -100.45 },  // lejos, barata
  { id: 3, lat: 20.595, lon: -100.395 }, // cerca, solo tiene leche barata
];
const items = [{ key: 'leche', cantidad: 2 }, { key: 'huevo', cantidad: 1 }];
const precios = new Map([
  ['leche', new Map([[1, { precio: 32 }], [2, { precio: 25 }], [3, { precio: 26 }]])],
  ['huevo', new Map([[1, { precio: 45 }], [2, { precio: 38 }]])],
]);

test('si el tiempo no vale nada, gana lo más barato', () => {
  const r = recomendar({ origen, transporte: { ...auto, costoKm: 0 }, items, sucursales, precios, valorTiempo: 0 });
  const rec = r.planes.find((p) => p.etiquetas.includes('recomendado'));
  assert.equal(rec.costoProductos, 25 * 2 + 38);
});

test('si el tiempo vale mucho, gana lo cercano', () => {
  const r = recomendar({ origen, transporte: auto, items, sucursales, precios, valorTiempo: 300 });
  const rec = r.planes.find((p) => p.etiquetas.includes('recomendado'));
  assert.ok(rec.tiendas.every((t) => t.id !== 2));
  assert.equal(rec.faltantes.length, 0);
});

test('reporta productos faltantes y comparativa', () => {
  const r = recomendar({ origen, transporte: auto, items, sucursales: [sucursales[2]], precios, valorTiempo: 60 });
  assert.deepEqual(r.planes[0].faltantes, ['huevo']);
  assert.equal(r.comparativa.find((c) => c.key === 'leche').min, 26);
});

test('ignora tiendas que no venden nada de la canasta', () => {
  const extra = [...sucursales, { id: 9, lat: 20.591, lon: -100.391 }];
  const r = recomendar({ origen, transporte: auto, items, sucursales: extra, precios, valorTiempo: 60 });
  assert.ok(r.planes.length > 0);
  assert.ok(r.planes.every((p) => p.tiendas.every((t) => t.id !== 9)));
});
