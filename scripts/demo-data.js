'use strict';
/**
 * Genera DATOS DE DEMOSTRACIÓN (sintéticos) con el mismo formato que QQP, para
 * probar la página sin el CSV real. Los precios son inventados y las
 * direcciones empiezan con "[DEMO]". Al importar el CSV real se borran solos.
 *
 *   npm run db:demo
 */
const { conectar } = require('../src/db');
const { Dimensiones, insertarPrecios, asignarFactores, sembrarBase } = require('./lib/dimensiones');
const { borrarDemo, PREFIJO_FUENTE, PREFIJO_CALLE } = require('./lib/demo');

// Generador pseudoaleatorio con semilla para que la demo sea reproducible
let semilla = 20261124;
const azar = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296);
const entre = (a, b) => a + (b - a) * azar();

const ZONAS = [
  ['Centro', 'Querétaro', 20.5931, -100.3925],
  ['Juriquilla', 'Querétaro', 20.7036, -100.4467],
  ['Jurica', 'Querétaro', 20.6745, -100.4413],
  ['Satélite', 'Querétaro', 20.625, -100.412],
  ['Álamos', 'Querétaro', 20.605, -100.377],
  ['Milenio III', 'Querétaro', 20.588, -100.35],
  ['Santa Rosa Jáuregui', 'Querétaro', 20.74, -100.448],
  ['Lomas de Casa Blanca', 'Querétaro', 20.565, -100.385],
  ['Zibatá', 'El Marqués', 20.68, -100.335],
  ['La Pradera', 'El Marqués', 20.643, -100.33],
  ['El Pueblito', 'Corregidora', 20.5394, -100.4413],
  ['Candiles', 'Corregidora', 20.553, -100.418],
  ['Centro SJR', 'San Juan del Río', 20.3889, -99.9961],
  ['Tequisquiapan', 'Tequisquiapan', 20.5206, -99.8917],
  ['Pedro Escobedo', 'Pedro Escobedo', 20.5019, -100.1408],
];

// [cadena, giro, factor de precio, sucursales]
const CADENAS = [
  ['WALMART', 'TIENDA DE AUTOSERVICIO', 1.0, 6],
  ['BODEGA AURRERA', 'TIENDA DE AUTOSERVICIO', 0.95, 9],
  ['SORIANA', 'TIENDA DE AUTOSERVICIO', 1.02, 7],
  ['CHEDRAUI', 'TIENDA DE AUTOSERVICIO', 0.99, 4],
  ['LA COMER', 'TIENDA DE AUTOSERVICIO', 1.08, 4],
  ['CITY MARKET', 'TIENDA DE AUTOSERVICIO', 1.2, 2],
  ['HEB', 'TIENDA DE AUTOSERVICIO', 1.01, 4],
  ['SAMS CLUB', 'CLUB DE PRECIOS', 0.92, 2],
  ['MERCADO MUNICIPAL', 'MERCADO PUBLICO', 0.88, 5],
];

// [producto, categoria, catalogo, [[marca, presentacion, precio base], ...]]
const PRODUCTOS = [
  ['ACEITE', 'ACEITES Y GRASAS VEG. COMESTIBLES', 'BASICOS', [['NUTRIOLI', 'BOTELLA 850 ML. PURO DE SOYA', 46], ['1-2-3', 'BOTELLA 1 LT. MIXTO', 42], ['CAPULLO', 'BOTELLA 840 ML. PURO DE CANOLA', 55]]],
  ['ARROZ', 'ARROZ', 'BASICOS', [['VERDE VALLE', 'BOLSA 1 KG. SUPER EXTRA', 36], ['SOS', 'BOLSA 1 KG. SUPER EXTRA', 33], ['S/M', '1 KG. GRANEL', 26]]],
  ['ATUN', 'PESCADOS Y MARISCOS EN CONSERVA', 'BASICOS', [['DOLORES', 'LATA 140 GR. EN AGUA', 22], ['TUNY', 'LATA 140 GR. EN AGUA', 19]]],
  ['AZUCAR', 'AZUCAR', 'BASICOS', [['ZULKA', 'BOLSA 2 KG. MORENA', 62], ['S/M', '1 KG. ESTANDAR GRANEL', 31]]],
  ['CARNE DE RES', 'CARNES FRESCAS', 'BASICOS', [['S/M', '1 KG. BISTEC DIEZMILLO', 205], ['S/M', '1 KG. MOLIDA', 175]]],
  ['CEBOLLA', 'FRUTAS Y LEGUMBRES FRESCAS', 'FRUTAS Y LEGUMBRES', [['S/M', 'KG. BLANCA', 28]]],
  ['CHILE', 'FRUTAS Y LEGUMBRES FRESCAS', 'FRUTAS Y LEGUMBRES', [['S/M', 'KG. JALAPEÑO', 38], ['S/M', 'KG. SERRANO', 45]]],
  ['CHULETA', 'CARNES FRESCAS', 'BASICOS', [['S/M', '1 KG. DE CERDO NATURAL', 125]]],
  ['FRIJOL', 'LEGUMBRES SECAS', 'BASICOS', [['VERDE VALLE', 'BOLSA 900 GR. NEGRO', 42], ['LA SIERRA', 'BOLSA 1 KG. PINTO', 39], ['S/M', '1 KG. PERUANO GRANEL', 34]]],
  ['HUEVO', 'HUEVO', 'BASICOS', [['BACHOCO', 'PAQUETE 18 PZAS. BLANCO', 62], ['SAN JUAN', 'PAQUETE 30 PZAS. BLANCO', 98], ['S/M', '1 KG. BLANCO GRANEL', 42]]],
  ['JABON DE TOCADOR', 'JABONES DE TOCADOR', 'BASICOS', [['ZEST', 'BARRA 150 GR. AQUA', 21], ['PALMOLIVE', 'BARRA 150 GR. NATURALS', 19]]],
  ['JITOMATE', 'FRUTAS Y LEGUMBRES FRESCAS', 'FRUTAS Y LEGUMBRES', [['S/M', 'KG. SALADET', 32]]],
  ['LECHE ULTRAPASTEURIZADA', 'LECHE PASTEURIZADA Y ULTRAPASTEURIZADA', 'BASICOS', [['LALA', 'CAJA 1 LT. ENTERA', 30], ['ALPURA', 'CAJA 1 LT. ENTERA', 31], ['SANTA CLARA', 'CAJA 1 LT. ENTERA', 33]]],
  ['LIMON', 'FRUTAS Y LEGUMBRES FRESCAS', 'FRUTAS Y LEGUMBRES', [['S/M', 'KG. CON SEMILLA', 34]]],
  ['MANZANA', 'FRUTAS Y LEGUMBRES FRESCAS', 'FRUTAS Y LEGUMBRES', [['S/M', 'KG. GOLDEN', 48], ['S/M', 'KG. RED DELICIOUS', 52]]],
  ['NARANJA', 'FRUTAS Y LEGUMBRES FRESCAS', 'FRUTAS Y LEGUMBRES', [['S/M', 'KG. VALENCIA', 22]]],
  ['PAN BLANCO', 'PAN', 'BASICOS', [['BIMBO', 'BOLSA 680 GR. DE CAJA GRANDE', 52], ['WONDER', 'BOLSA 567 GR. DE CAJA', 46]]],
  ['PAPA', 'FRUTAS Y LEGUMBRES FRESCAS', 'FRUTAS Y LEGUMBRES', [['S/M', 'KG. ALFA', 30]]],
  ['PAPEL HIGIENICO', 'PAPEL HIGIENICO', 'BASICOS', [['PETALO', 'PAQUETE 4 ROLLOS. 400 HOJAS DOBLES', 38], ['REGIO', 'PAQUETE 4 ROLLOS. 220 HOJAS DOBLES', 35]]],
  ['PASTA PARA SOPA', 'PASTA PARA SOPA', 'BASICOS', [['LA MODERNA', 'BOLSA 200 GR. FIDEO', 11], ['BARILLA', 'BOLSA 200 GR. CODO', 16]]],
  ['POLLO ENTERO', 'CARNES FRESCAS', 'BASICOS', [['S/M', '1 KG. FRESCO', 68], ['BACHOCO', '1 KG. CON VISCERAS', 72]]],
  ['SARDINA', 'PESCADOS Y MARISCOS EN CONSERVA', 'BASICOS', [['LA SIRENA', 'LATA 425 GR. EN TOMATE', 36], ['GUAYMEX', 'LATA 425 GR. EN TOMATE', 33]]],
  ['TORTILLA DE MAIZ', 'TORTILLAS Y DERIVADOS DEL MAIZ', 'BASICOS', [['S/M', '1 KG. GRANEL', 23]]],
  ['ZANAHORIA', 'FRUTAS Y LEGUMBRES FRESCAS', 'FRUTAS Y LEGUMBRES', [['S/M', 'KG. MEDIANA', 20]]],
  ['HARINA DE MAIZ', 'HARINAS DE MAIZ', 'BASICOS', [['MASECA', 'BOLSA 1 KG. NIXTAMALIZADA', 24], ['MINSA', 'BOLSA 1 KG. NIXTAMALIZADA', 22]]],
  ['CAFE SOLUBLE', 'CAFE SOLUBLE', 'BASICOS', [['NESCAFE', 'FRASCO 120 GR. CLASICO', 98], ['LEGAL', 'FRASCO 120 GR. CAFE Y AZUCAR', 62]]],
  ['PLATANO', 'FRUTAS Y LEGUMBRES FRESCAS', 'FRUTAS Y LEGUMBRES', [['S/M', 'KG. TABASCO', 24]]],
  ['DETERGENTE', 'DETERGENTES PARA ROPA', 'BASICOS', [['ROMA', 'BOLSA 1 KG. EN POLVO', 34], ['ARIEL', 'BOLSA 1 KG. EN POLVO', 52]]],
];

const ES_FRESCO = (cat) => cat === 'FRUTAS Y LEGUMBRES';

(async () => {
  const conn = await conectar();
  try {
    await sembrarBase(conn);
    await borrarDemo(conn);
    const dim = new Dimensiones(conn);
    const idQro = await dim.estado('Querétaro');

    const hoy = new Date();
    const fecha = (diasAtras) => new Date(hoy.getTime() - diasAtras * 864e5).toISOString().slice(0, 10);
    const idFuente = await dim.fuente(`${PREFIJO_FUENTE} datos sintéticos de prueba`, fecha(0).slice(0, 7));

    // Sucursales
    const sucursales = [];
    const nombres = new Map();
    let n = 0;
    for (const [cadena, giro, factor, cuantas] of CADENAS) {
      const idCadena = await dim.cadena(cadena);
      const idGiro = await dim.giro(giro);
      for (let i = 0; i < cuantas; i++) {
        // Las primeras sucursales caen en la zona metropolitana; algunas en SJR/Tequis/Escobedo
        const zona = ZONAS[(n * 7 + i * 3) % ZONAS.length];
        n++;
        const lat = zona[2] + entre(-0.012, 0.012);
        const lon = zona[3] + entre(-0.012, 0.012);
        let nombre = `${cadena} ${zona[0].toUpperCase()}`;
        nombres.set(nombre, (nombres.get(nombre) || 0) + 1);
        if (nombres.get(nombre) > 1) nombre += ` ${['', '', 'NORTE', 'SUR', 'ORIENTE', 'PONIENTE'][nombres.get(nombre)] || nombres.get(nombre)}`;
        const id = await dim.sucursal({
          idCadena,
          idMunicipio: await dim.municipio(idQro, zona[1]),
          idGiro,
          nombre,
          calle: `${PREFIJO_CALLE} Av. Ejemplo ${100 + n * 17}`,
          colonia: zona[0],
          cp: String(76000 + n * 13).slice(0, 5),
          lat,
          lon,
        });
        // Cada sucursal tiene su propio "humor" de precios
        sucursales.push({ id, factor: factor * entre(0.96, 1.05), mercado: cadena === 'MERCADO MUNICIPAL' });
      }
    }

    // Productos y precios
    const filas = [];
    for (const [nombre, categoria, catalogo, variantes] of PRODUCTOS) {
      const idCat = await dim.categoria(categoria);
      const idCatalogo = await dim.catalogo(catalogo);
      for (const [marca, pres, base] of variantes) {
        const idProd = await dim.producto(idCat, await dim.marca(marca), nombre);
        const idPres = await dim.presentacion(idProd, pres, idCatalogo);
        for (const s of sucursales) {
          // Los mercados solo venden frescos y granel; las demás tiendas no tienen todo
          const esGranel = marca === 'S/M';
          if (s.mercado && !esGranel) continue;
          if (azar() > (s.mercado ? 0.9 : 0.82)) continue;
          for (const dias of [2 + Math.floor(azar() * 6), 16 + Math.floor(azar() * 10)]) {
            const ruido = ES_FRESCO(catalogo) ? entre(0.85, 1.18) : entre(0.95, 1.06);
            const precio = Math.round(base * s.factor * ruido * (dias > 15 ? 0.98 : 1) * 2) / 2 - 0.1;
            filas.push([idPres, s.id, idFuente, fecha(dias), Math.max(1, Math.round(precio * 100) / 100)]);
          }
        }
      }
    }
    await insertarPrecios(conn, filas);
    await asignarFactores(conn);
    console.log(`✅ Demo lista: ${sucursales.length} sucursales y ${filas.length} precios sintéticos en Querétaro.`);
    console.log('   Cuando tengas el CSV de QQP: npm run importar -- ruta/al/archivo.csv (borra la demo automáticamente).');
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
