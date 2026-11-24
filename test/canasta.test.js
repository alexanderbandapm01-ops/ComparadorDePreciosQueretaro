'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { clasificar, parsePresentacion, kgProducto } = require('../src/canasta');
const { partirCSV, partirDireccion, parseFecha } = require('../scripts/importar-qqp');

test('clasifica productos de la canasta básica', () => {
  assert.equal(clasificar('LECHE ULTRAPASTEURIZADA').clave, 'leche');
  assert.equal(clasificar('Tortilla de maíz').clave, 'tortilla');
  assert.equal(clasificar('HUEVO').clave, 'huevo');
  assert.equal(clasificar('LECHE CONDENSADA'), null);
  assert.equal(clasificar('ACEITE PARA MOTOR'), null);
  assert.equal(clasificar('PASTA DENTAL'), null);
  assert.equal(clasificar('TELEVISOR'), null);
  assert.equal(clasificar('ARROZ', 'MEDICAMENTOS'), null);
});

test('interpreta presentaciones de QQP', () => {
  assert.deepEqual(parsePresentacion('CAJA 1 LT. ENTERA'), { cantidad: 1, unidad: 'l', envase: 'CAJA', variante: 'ENTERA', descripcion_original: 'CAJA 1 LT. ENTERA' });
  const b = parsePresentacion('BOLSA 900 GR. GRANO NEGRO');
  assert.equal(b.cantidad, 900); assert.equal(b.unidad, 'g'); assert.equal(b.envase, 'BOLSA');
  const k = parsePresentacion('KG. GRANEL');
  assert.equal(k.cantidad, 1); assert.equal(k.unidad, 'kg');
  assert.equal(parsePresentacion('PAQUETE 18 PZAS. BLANCO').unidad, 'pza');
  assert.equal(parsePresentacion('ALGO RARO').unidad, 'N/A');
  assert.equal(kgProducto(18, 'pza', 'huevo'), 18 * 0.06);
  assert.equal(kgProducto(900, 'g', 'frijol'), 0.9);
});

test('lee CSV y direcciones de QQP', () => {
  assert.deepEqual(partirCSV('a,"b, c","d ""e"""'), ['a', 'b, c', 'd "e"']);
  const d = partirDireccion('AV. CONSTITUYENTES 123, COL. CENTRO, C.P. 76000');
  assert.deepEqual(d, { calle: 'AV. CONSTITUYENTES 123', colonia: 'CENTRO', cp: '76000' });
  assert.equal(parseFecha('2026-10-03 00:00:00.000'), '2026-10-03');
  assert.equal(parseFecha('3/10/2026'), '2026-10-03');
});
