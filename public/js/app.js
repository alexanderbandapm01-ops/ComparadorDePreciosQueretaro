/* CDPS Sostenible — lógica de la página (JavaScript sin frameworks) */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = (n) => (n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: n >= 1000 ? 0 : 2 }));
  const titulo = (s) => String(s || '').toLowerCase().replace(/(^|[\s(/-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Ii|Iii|Iv|Vi)\b/g, (r) => r.toUpperCase());
  const minutos = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
  const kg = (x) => (x < 1 ? `${Math.round(x * 1000)} g` : `${x.toFixed(1)} kg`);

  const PRESETS = {
    ahorro: { valorTiempo: 0, pesoEco: 0, maxTiendas: 3 },
    equilibrio: { valorTiempo: 60, pesoEco: 2, maxTiendas: 3 },
    rapido: { valorTiempo: 250, pesoEco: 0, maxTiendas: 1 },
    eco: { valorTiempo: 30, pesoEco: 40, maxTiendas: 2 },
  };
  const ETIQUETAS = {
    recomendado: '🏆 Recomendado',
    barato: '💰 Más barato',
    rapido: '⚡ Más rápido',
    eco: '🌱 Menor huella',
    unaTienda: '🏪 Todo en una tienda',
    minimo: '📉 Cada producto a su mínimo',
  };

  // ---------------------------------------------------------------- estado
  const guardado = (() => { try { return JSON.parse(localStorage.getItem('cdps') || '{}'); } catch { return {}; } })();
  const st = {
    info: null,
    ubicacion: guardado.ubicacion || null,
    catalogo: guardado.catalogo || '',
    transporte: guardado.transporte || null,
    radio: guardado.radio || 8,
    canasta: guardado.canasta || [],
    preset: guardado.preset || 'equilibrio',
    valorTiempo: guardado.valorTiempo ?? 60,
    pesoEco: guardado.pesoEco ?? 2,
    maxTiendas: guardado.maxTiendas || 3,
    sesion: guardado.sesion || null,
    resultado: null,
    plan: null,
    sucursales: [],
  };
  function persistir() {
    const { ubicacion, catalogo, transporte, radio, canasta, preset, valorTiempo, pesoEco, maxTiendas, sesion } = st;
    try { localStorage.setItem('cdps', JSON.stringify({ ubicacion, catalogo, transporte, radio, canasta, preset, valorTiempo, pesoEco, maxTiendas, sesion })); } catch { /* modo privado */ }
  }

  async function api(ruta, opciones = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (st.sesion) headers.Authorization = 'Bearer ' + st.sesion.token;
    const r = await fetch(ruta, { ...opciones, headers, body: opciones.body ? JSON.stringify(opciones.body) : undefined });
    const datos = await r.json().catch(() => ({}));
    if (r.status === 401 && st.sesion && !/login|registro/.test(ruta)) { st.sesion = null; persistir(); pintarCuenta(); }
    if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
    return datos;
  }

  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('ver');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('ver'), 2800);
  }

  function aviso(html, tipo = '') {
    $('#avisos').insertAdjacentHTML('beforeend', `<div class="aviso ${tipo}">${html}</div>`);
  }

  // ---------------------------------------------------------------- mapa
  const INICIO = st.ubicacion || { lat: 20.5888, lon: -100.3899 };
  const mapa = L.map('mapa', { zoomControl: true, scrollWheelZoom: false }).setView([INICIO.lat, INICIO.lon], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19,
  }).addTo(mapa);
  mapa.on('focus', () => mapa.scrollWheelZoom.enable());
  mapa.on('blur', () => mapa.scrollWheelZoom.disable());

  const capaTiendas = L.layerGroup().addTo(mapa);
  const capaRuta = L.layerGroup().addTo(mapa);
  const iconoYo = L.divIcon({ className: '', html: '<div style="width:22px;height:22px;border-radius:50%;background:#3b6ea8;border:4px solid #fff;box-shadow:0 0 0 6px rgba(59,110,168,.25),0 2px 6px rgba(0,0,0,.3)"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
  const marcadorYo = L.marker([INICIO.lat, INICIO.lon], { draggable: true, icon: iconoYo, zIndexOffset: 1000, title: 'Tú' }).addTo(mapa);
  const circulo = L.circle([INICIO.lat, INICIO.lon], { radius: st.radio * 1000 / 1.35, color: '#5a9e62', weight: 1, fillOpacity: 0.06, interactive: false }).addTo(mapa);

  marcadorYo.on('dragend', () => {
    const p = marcadorYo.getLatLng();
    fijarUbicacion(p.lat, p.lng, 'Punto en el mapa');
  });
  mapa.on('click', (e) => fijarUbicacion(e.latlng.lat, e.latlng.lng, 'Punto en el mapa'));

  function fijarUbicacion(lat, lon, etiqueta, centrar = false) {
    st.ubicacion = { lat, lon, etiqueta };
    marcadorYo.setLatLng([lat, lon]);
    circulo.setLatLng([lat, lon]);
    if (centrar) mapa.setView([lat, lon], 13);
    $('#txtUbicacion').innerHTML = `Saldrás desde: <b>${esc(etiqueta)}</b> (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
    persistir();
    pintarTiendas();
    invalidarResultado();
  }

  function pintarTiendas() {
    capaTiendas.clearLayers();
    const radioKm = st.radio;
    for (const s of st.sucursales) {
      const dentro = L.latLng(s.lat, s.lon).distanceTo([st.ubicacion.lat, st.ubicacion.lon]) * 1.35 / 1000 <= radioKm;
      L.circleMarker([s.lat, s.lon], {
        radius: dentro ? 6 : 4,
        color: '#fff',
        weight: 1.5,
        fillColor: dentro ? '#5a9e62' : '#9fb3a5',
        fillOpacity: dentro ? 0.95 : 0.6,
      })
        .bindPopup(`<b>${esc(titulo(s.nombre))}</b><br>${esc(titulo(s.cadena))} · ${esc(s.municipio)}<br><small>${esc(titulo(s.calle))}, ${esc(titulo(s.colonia))}</small>`)
        .addTo(capaTiendas);
    }
  }

  // ---------------------------------------------------------------- paso 1
  function pintarTransportes() {
    const cont = $('#transportes');
    cont.innerHTML = st.info.transportes
      .map((t) => `<button type="button" class="chip" role="radio" data-clave="${t.clave}" aria-checked="${t.clave === st.transporte}">${t.icono || '🚗'} ${esc(t.nombre)}</button>`)
      .join('');
    cont.onclick = (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      st.transporte = b.dataset.clave;
      $$('.chip', cont).forEach((x) => x.setAttribute('aria-checked', x === b));
      persistir();
      invalidarResultado();
    };
  }

  $('#btnGPS').onclick = () => {
    if (!navigator.geolocation) return toast('Tu navegador no permite ubicación.');
    $('#btnGPS').textContent = '📍 Buscando…';
    navigator.geolocation.getCurrentPosition(
      (p) => {
        $('#btnGPS').textContent = '📍 Usar mi ubicación';
        fijarUbicacion(p.coords.latitude, p.coords.longitude, 'Tu ubicación actual', true);
        toast('Ubicación encontrada ✔');
      },
      () => {
        $('#btnGPS').textContent = '📍 Usar mi ubicación';
        toast('No pude obtener tu ubicación. Elige tu municipio o toca el mapa.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  $('#selMunicipio').onchange = (e) => {
    const m = st.info.municipios[Number(e.target.value)];
    if (m) fijarUbicacion(m.lat, m.lon, m.nombre, true);
  };

  $('#rngRadio').value = st.radio;
  $('#txtRadio').textContent = `${st.radio} km`;
  $('#rngRadio').oninput = (e) => {
    st.radio = Number(e.target.value);
    $('#txtRadio').textContent = `${st.radio} km`;
    circulo.setRadius((st.radio * 1000) / 1.35);
    persistir();
    pintarTiendas();
    invalidarResultado();
  };

  // ---------------------------------------------------------------- paso 2
  const cajaRes = $('#resultados');
  let ultimaBusqueda = 0;

  async function buscar(params) {
    const id = ++ultimaBusqueda;
    const qs = new URLSearchParams(params).toString();
    const lista = await api('/api/buscar?' + qs);
    if (id !== ultimaBusqueda) return;
    if (!lista.length) {
      cajaRes.innerHTML = `<p class="vacio">No encontré productos con precio en la zona para “${esc(params.q || params.categoria)}”${params.catalogo ? ` en el catálogo ${esc(params.catalogo)}` : ''}.</p>`;
    } else {
      cajaRes.innerHTML = lista
        .map(
          (p) => `<button type="button" class="res" data-p='${esc(JSON.stringify(p))}'>
            <span class="emo">${p.emoji}</span>
            <span><b>${esc(titulo(p.producto))} · ${esc(titulo(p.marca))}</b><small>${esc(titulo(p.descripcion))} · en ${p.tiendas} tienda${p.tiendas === 1 ? '' : 's'}</small></span>
            <span class="precio">desde ${pesos(p.min)}${p.precioUnitarioMin && p.cantidad !== 1 ? `<small>${pesos(p.precioUnitarioMin)}/${p.unidadBase}</small>` : ''}</span>
          </button>`
        )
        .join('');
    }
    cajaRes.hidden = false;
  }

  let tBusqueda;
  $('#txtBuscar').addEventListener('input', (e) => {
    clearTimeout(tBusqueda);
    const q = e.target.value.trim();
    $$('.cat').forEach((c) => c.classList.remove('activa'));
    if (q.length < 2) { cajaRes.hidden = true; return; }
    tBusqueda = setTimeout(() => buscar(conCatalogo({ q })).catch((er) => toast(er.message)), 180);
  });
  $('#txtBuscar').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cajaRes.hidden = true;
    if (e.key === 'ArrowDown') { const b = $('.res', cajaRes); if (b) { e.preventDefault(); b.focus(); } }
  });
  cajaRes.addEventListener('click', (e) => {
    const b = e.target.closest('.res');
    if (!b) return;
    agregar(JSON.parse(b.dataset.p));
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.buscador') && !e.target.closest('.categorias')) cajaRes.hidden = true;
  });

  function pintarCategorias() {
    $('#categorias').innerHTML = st.info.categorias
      .map((c) => `<button type="button" class="cat" data-cat="${esc(c.nombre)}" title="${c.opciones} presentaciones"><span>${c.icono}</span>${esc(c.nombre)}</button>`)
      .join('');
    $('#categorias').onclick = (e) => {
      const b = e.target.closest('.cat');
      if (!b || b.disabled) return;
      const activa = b.classList.contains('activa') && !cajaRes.hidden;
      $$('.cat').forEach((c) => c.classList.remove('activa'));
      if (activa) { cajaRes.hidden = true; return; }
      b.classList.add('activa');
      $('#txtBuscar').value = '';
      buscar(conCatalogo({ categoria: b.dataset.cat })).catch((er) => toast(er.message));
    };
  }

  function agregar(p, flexible = false, silencioso = false) {
    const ya = st.canasta.find((x) => x.id_presentacion === p.id);
    if (ya) ya.cantidad += 1;
    else st.canasta.push({ id_presentacion: p.id, cantidad: 1, flexible, producto: p.producto, marca: p.marca, descripcion: p.descripcion, emoji: p.emoji, min: p.min });
    persistir();
    pintarCanasta();
    invalidarResultado();
    if (!silencioso) toast(`${p.emoji} ${titulo(p.producto)} agregado`);
  }

  function pintarCanasta() {
    const ul = $('#canasta');
    ul.innerHTML = st.canasta
      .map(
        (it, i) => `<li class="item" data-i="${i}">
          <span class="emo">${it.emoji || '🛒'}</span>
          <span class="nom">${esc(titulo(it.producto))}<small>${esc(titulo(it.marca))} · ${esc(titulo(it.descripcion))}</small></span>
          <span class="ctrl">
            <button type="button" class="paso-btn" data-acc="menos" aria-label="Menos">−</button>
            <span class="cant">${+it.cantidad.toFixed(3)}</span>
            <button type="button" class="paso-btn" data-acc="mas" aria-label="Más">+</button>
          </span>
          <span class="opciones">
            <label class="switch" title="Acepta otra marca del mismo producto y tamaño si es más barata"><input type="checkbox" data-acc="flex" ${it.flexible ? 'checked' : ''}> Cualquier marca</label>
            <button type="button" class="quitar" data-acc="quitar">Quitar</button>
          </span>
        </li>`
      )
      .join('');
    $('#canastaVacia').hidden = st.canasta.length > 0;
    const piezas = st.canasta.reduce((s, x) => s + x.cantidad, 0);
    $('#txtResumen').textContent = st.canasta.length ? `${st.canasta.length} producto${st.canasta.length === 1 ? '' : 's'} · ${+piezas.toFixed(2)} pzas/kg` : '0 productos';
    $('#btnBuscar').disabled = !st.canasta.length;
  }

  $('#canasta').addEventListener('click', (e) => {
    const b = e.target.closest('[data-acc]');
    if (!b || b.dataset.acc === 'flex') return;
    const i = Number(b.closest('.item').dataset.i);
    const it = st.canasta[i];
    if (b.dataset.acc === 'mas') it.cantidad = Math.min(99, it.cantidad + 1);
    if (b.dataset.acc === 'menos') it.cantidad = Math.max(1, it.cantidad - 1);
    if (b.dataset.acc === 'quitar') st.canasta.splice(i, 1);
    persistir();
    pintarCanasta();
    invalidarResultado();
  });
  $('#canasta').addEventListener('change', (e) => {
    if (e.target.dataset.acc !== 'flex') return;
    st.canasta[Number(e.target.closest('.item').dataset.i)].flexible = e.target.checked;
    persistir();
    invalidarResultado();
  });

  $('#btnRapida').onclick = async () => {
    try {
      const r = await api('/api/sugerida');
      let n = 0;
      for (const p of r.productos) {
        if (st.canasta.some((x) => x.id_presentacion === p.id)) continue;
        agregar(p, true, true);
        n++;
      }
      toast(n ? `Agregué ${n} productos (${r.fuente}) con “cualquier marca”` : 'Ya tienes esos productos');
    } catch (e) { toast(e.message); }
  };

  // Filtro por catálogo de QQP (Pacic, Basicos, Mercados…)
  const conCatalogo = (params) => (st.catalogo ? { ...params, catalogo: st.catalogo } : params);
  function pintarCatalogos() {
    const cont = $('#catalogos');
    const lista = [{ nombre: '', opciones: st.info.presentaciones }, ...st.info.catalogos];
    cont.innerHTML = lista
      .map((c) => `<button type="button" class="chip" role="radio" data-cat="${esc(c.nombre)}" aria-checked="${c.nombre === st.catalogo}">${c.nombre ? esc(c.nombre) : 'Todos'} <small>${c.opciones}</small></button>`)
      .join('');
    cont.onclick = (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      st.catalogo = b.dataset.cat;
      $$('.chip', cont).forEach((x) => x.setAttribute('aria-checked', x === b));
      persistir();
      cajaRes.hidden = true;
      $$('.cat').forEach((c) => c.classList.remove('activa'));
    };
  }

  // ---------------------------------------------------------------- paso 3
  function pintarPreferencias() {
    $$('#presets button').forEach((b) => b.setAttribute('aria-checked', b.dataset.p === st.preset));
    $('#rngTiempo').value = st.valorTiempo;
    $('#txtTiempo').textContent = pesos(st.valorTiempo);
    $('#rngEco').value = st.pesoEco;
    $('#txtEco').textContent = pesos(st.pesoEco);
    $('#selTiendas').value = st.maxTiendas;
  }
  $('#presets').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    st.preset = b.dataset.p;
    Object.assign(st, PRESETS[st.preset]);
    pintarPreferencias();
    persistir();
    if (st.resultado) calcular();
  };
  const ajusteFino = () => {
    st.valorTiempo = Number($('#rngTiempo').value);
    st.pesoEco = Number($('#rngEco').value);
    st.maxTiendas = Number($('#selTiendas').value);
    st.preset = null;
    pintarPreferencias();
    persistir();
  };
  $('#rngTiempo').oninput = ajusteFino;
  $('#rngEco').oninput = ajusteFino;
  $('#selTiendas').onchange = ajusteFino;
  $('#rngTiempo').onchange = $('#rngEco').onchange = () => st.resultado && calcular();

  // ---------------------------------------------------------------- cálculo
  function invalidarResultado() {
    if (st.resultado) $('#btnBuscar span').textContent = 'Actualizar recomendación';
  }

  async function calcular() {
    const btn = $('#btnBuscar');
    btn.classList.add('cargando');
    btn.disabled = true;
    try {
      const r = await api('/api/recomendar', {
        method: 'POST',
        body: {
          lat: st.ubicacion.lat,
          lon: st.ubicacion.lon,
          transporte: st.transporte,
          radioKm: st.radio,
          valorTiempo: st.valorTiempo,
          pesoEco: st.pesoEco,
          maxTiendas: st.maxTiendas,
          items: st.canasta.map(({ id_presentacion, cantidad, flexible }) => ({ id_presentacion, cantidad, flexible })),
        },
      });
      st.resultado = r;
      st.plan = r.planes[0] || null;
      pintarResultado();
      btn.querySelector('span').textContent = 'Encontrar dónde comprar';
      if (window.matchMedia('(max-width: 960px)').matches) $('.lienzo').scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      toast(e.message);
    } finally {
      btn.classList.remove('cargando');
      btn.disabled = !st.canasta.length;
    }
  }
  $('#btnBuscar').onclick = calcular;

  function nombreSuc(id) {
    const s = st.resultado.sucursales[id];
    return s ? titulo(s.nombre) : 'Tienda ' + id;
  }

  function pintarResultado() {
    const r = st.resultado;
    const cont = $('#resultadosPlan');
    if (!r.planes.length) {
      cont.innerHTML = `<div class="bienvenida"><h3>No encontré tiendas con esos productos a ${r.radioKm} km 😕</h3>
        <p>Prueba aumentar la distancia, mover tu ubicación o activar “Cualquier marca”.</p><p class="pista">Tiendas dentro del radio: ${r.sucursalesEnRadio}</p></div>`;
      capaRuta.clearLayers();
      return;
    }
    const itemPorKey = Object.fromEntries(r.items.map((i) => [i.key, i]));
    cont.innerHTML = `
      <div class="resumen-busqueda">
        <span>${r.transporte.icono || ''} ${esc(r.transporte.nombre)}</span>
        <span>🏪 ${r.sucursalesEnRadio} tiendas a ≤ ${r.radioKm} km</span>
        <span>🧺 ${r.items.length} productos</span>
        <span>📅 precios al ${esc(r.datos.fechaMax || '—')}</span>
      </div>
      <div class="planes" role="list">${r.planes.map((p, i) => tarjetaPlan(p, i)).join('')}</div>
      <div id="detallePlan"></div>
      <div class="detalle comparativa"><h3>📊 Precio de cada producto cerca de ti</h3>${r.comparativa.map((c) => compItem(c, itemPorKey[c.key])).join('')}</div>`;
    $$('.plan', cont).forEach((b) =>
      b.addEventListener('click', () => {
        st.plan = r.planes[Number(b.dataset.i)];
        $$('.plan', cont).forEach((x) => x.setAttribute('aria-pressed', x === b));
        pintarDetalle();
      })
    );
    pintarDetalle();
  }

  function tarjetaPlan(p, i) {
    const tiendas = p.tiendas.map((t) => esc(nombreSuc(t.id))).join(' <span>→</span> ');
    return `<button type="button" class="plan" role="listitem" data-i="${i}" aria-pressed="${p === st.plan}">
      <div class="insignias">${p.etiquetas.map((e) => `<span class="insignia ${e}">${ETIQUETAS[e]}</span>`).join('')}</div>
      <div class="total">${pesos(p.costoTotal)} <small>total</small></div>
      <div class="tiendas-lista">${tiendas}</div>
      <div class="metricas">
        <div><b>${minutos(p.minutos)}</b>tiempo</div>
        <div><b>${p.km.toFixed(1)} km</b>ida y vuelta</div>
        <div><b>${kg(p.co2Transporte)}</b>CO₂ viaje</div>
      </div>
      ${p.faltantes.length ? `<div class="falta">⚠ Faltan ${p.faltantes.length} producto${p.faltantes.length === 1 ? '' : 's'}</div>` : p.ahorroVsPromedio > 0 ? `<div class="ahorro">Ahorras ${pesos(p.ahorroVsPromedio)} vs. el precio promedio</div>` : ''}
    </button>`;
  }

  function porQue(p) {
    const r = st.resultado;
    const otros = r.planes.filter((x) => x !== p && !x.faltantes.length);
    const frases = [];
    const barato = otros.find((x) => x.etiquetas.includes('barato'));
    const rapido = otros.find((x) => x.etiquetas.includes('rapido'));
    if (p.etiquetas.includes('recomendado')) {
      frases.push(`Con tu tiempo valuado en <b>${pesos(st.valorTiempo)}/h</b>${st.pesoEco ? ` y el ambiente en <b>${pesos(st.pesoEco)}/kg CO₂</b>` : ''}, esta es la combinación con mejor balance.`);
    }
    if (barato && barato.costoTotal < p.costoTotal) {
      const dMin = barato.minutos - p.minutos;
      frases.push(`La opción más barata te ahorraría <b>${pesos(p.costoTotal - barato.costoTotal)}</b>${dMin > 0 ? ` pero son <b>${minutos(dMin)}</b> más de traslado` : ''}.`);
    }
    if (rapido && rapido.minutos < p.minutos) {
      frases.push(`La más rápida te ahorra <b>${minutos(p.minutos - rapido.minutos)}</b>${rapido.costoTotal > p.costoTotal ? ` y cuesta <b>${pesos(rapido.costoTotal - p.costoTotal)}</b> más` : ''}.`);
    }
    if (p.costoTransporte > 0) frases.push(`Incluye ~${pesos(p.costoTransporte)} de transporte.`);
    if (st.resultado.datos.conFactores && p.co2Productos > 0) frases.push(`Huella estimada de la canasta: <b>${kg(p.co2Total)} CO₂e</b> (${kg(p.co2Productos)} por los productos, ${kg(p.co2Transporte)} por el viaje).`);
    else if (p.co2Transporte > 0) frases.push(`El viaje emite ~<b>${kg(p.co2Transporte)} CO₂e</b> (la base aún no tiene factores de emisión de los productos).`);
    return frases.join(' ');
  }

  function enlaceMaps(p) {
    const modo = /camin/i.test(st.resultado.transporte.nombre) ? 'walking' : /bici/i.test(st.resultado.transporte.nombre) ? 'bicycling' : /p[uú]blico/i.test(st.resultado.transporte.nombre) ? 'transit' : 'driving';
    const pts = p.tiendas.map((t) => st.resultado.sucursales[t.id]).map((s) => `${s.lat},${s.lon}`);
    const u = new URL('https://www.google.com/maps/dir/');
    u.searchParams.set('api', '1');
    u.searchParams.set('origin', `${st.ubicacion.lat},${st.ubicacion.lon}`);
    u.searchParams.set('destination', pts[pts.length - 1]);
    if (pts.length > 1) u.searchParams.set('waypoints', pts.slice(0, -1).join('|'));
    u.searchParams.set('travelmode', modo);
    return u.toString();
  }

  function pintarDetalle() {
    const p = st.plan;
    const r = st.resultado;
    const itemPorKey = Object.fromEntries(r.items.map((i) => [i.key, i]));
    const paradas = p.tiendas
      .map((t, i) => {
        const s = r.sucursales[t.id];
        const lineas = t.items
          .map((k) => {
            const a = p.asignacion[k];
            const it = itemPorKey[k];
            const otraMarca = a.id_presentacion !== it.id_presentacion;
            return `<li><span>${it.emoji} ${esc(titulo(it.producto))} <small>${esc(titulo(otraMarca ? a.marca : it.marca))} · ${esc(titulo(a.descripcion))}${otraMarca ? ' (otra marca)' : ''} · ×${+it.cantidad.toFixed(3)}</small></span><b>${pesos(a.subtotal)}</b></li>`;
          })
          .join('');
        return `<div class="parada"><header><span class="n">${i + 1}</span><h4>${esc(titulo(s.nombre))}<small>${esc(titulo(s.calle))}, ${esc(titulo(s.colonia))} · ${esc(s.municipio)} · ${s.km.toFixed(1)} km</small></h4><span class="sub">${pesos(t.subtotal)}</span></header><ul class="lineas">${lineas}</ul></div>`;
      })
      .join('');
    const faltan = p.faltantes.map((k) => `${itemPorKey[k].emoji} ${esc(titulo(itemPorKey[k].producto))}`).join(', ');
    $('#detallePlan').innerHTML = `<div class="detalle">
      <h3>${p.etiquetas.map((e) => ETIQUETAS[e]).join(' · ')}</h3>
      <p class="porque">${porQue(p)}</p>
      ${faltan ? `<p class="falta">⚠ No se encontró cerca: ${faltan}</p>` : ''}
      ${paradas}
      <div class="parada"><header><span class="n">🏠</span><h4>Total productos ${pesos(p.costoProductos)} + transporte ${pesos(p.costoTransporte)}</h4><span class="sub">${pesos(p.costoTotal)}</span></header></div>
      <div class="botones">
        <a class="btn-sec" href="${enlaceMaps(p)}" target="_blank" rel="noopener">🗺️ Abrir ruta en Google Maps</a>
        <button type="button" class="btn-ok" id="btnGuardar">💾 Guardar lista</button>
      </div>
    </div>`;
    $('#btnGuardar').onclick = guardarLista;
    dibujarRuta(p);
  }

  function dibujarRuta(p) {
    capaRuta.clearLayers();
    const r = st.resultado;
    const puntos = [[st.ubicacion.lat, st.ubicacion.lon]];
    p.tiendas.forEach((t, i) => {
      const s = r.sucursales[t.id];
      puntos.push([s.lat, s.lon]);
      L.marker([s.lat, s.lon], {
        icon: L.divIcon({ className: '', html: `<div class="pin-tienda"><b>${i + 1}</b></div>`, iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -26] }),
        zIndexOffset: 900,
      })
        .bindPopup(`<b>${i + 1}. ${esc(titulo(s.nombre))}</b><br>${t.items.length} producto(s) · ${pesos(t.subtotal)}<br><small>${s.km.toFixed(1)} km desde tu punto</small>`)
        .addTo(capaRuta);
    });
    puntos.push(puntos[0]);
    L.polyline(puntos, { color: '#1f4a2e', weight: 4, opacity: 0.85, dashArray: '8 6' }).addTo(capaRuta);
    mapa.fitBounds(L.latLngBounds(puntos).pad(0.25), { maxZoom: 15 });
  }

  function compItem(c, it) {
    if (!c.opciones.length) return `<div class="comp-item"><div><span>${it.emoji} ${esc(titulo(it.producto))}</span><small>sin precios cerca</small></div></div>`;
    const min = c.opciones[0].precio;
    const max = Math.max(...c.opciones.map((o) => o.precio));
    const ancho = (x) => (max > min ? 35 + ((x - min) / (max - min)) * 65 : 60);
    const barras = c.opciones
      .slice(0, 5)
      .map((o) => {
        const s = st.resultado.sucursales[o.sucursal];
        return `<div class="barra-p"><span class="nom" title="${esc(titulo(s.nombre))}">${esc(titulo(s.nombre))}</span><span class="tubo"><i style="width:${ancho(o.precio)}%"></i></span><b>${pesos(o.precio)}</b></div>`;
      })
      .join('');
    return `<div class="comp-item"><div><span>${it.emoji} ${esc(titulo(it.producto))} <small>${it.flexible ? 'cualquier marca' : esc(titulo(it.marca))} · ${esc(titulo(it.descripcion))}</small></span><small>${c.n} tiendas · prom. ${pesos(c.promedio)}</small></div><div class="barras">${barras}</div></div>`;
  }

  // ---------------------------------------------------------------- cuenta y listas
  const modal = $('#modal');
  function abrirModal(html) {
    $('#modalCuerpo').innerHTML = html;
    if (!modal.open) modal.showModal();
  }

  function pintarCuenta() {
    $('#txtCuenta').textContent = st.sesion ? titulo(st.sesion.usuario.nombre) : 'Entrar';
  }

  function formularioCuenta(modo = 'login', despues) {
    const muni = [...new Set(st.info.municipios.map((m) => m.nombre))].map((n) => `<option>${esc(n)}</option>`).join('');
    abrirModal(`
      <h3>${modo === 'login' ? 'Entra a tu cuenta' : 'Crea tu cuenta'}</h3>
      <p class="pista">Guarda tus listas de compra y recomendaciones en la base de datos.</p>
      <div class="tabs" role="tablist" style="margin-top:12px">
        <button type="button" role="tab" data-m="login" aria-selected="${modo === 'login'}">Entrar</button>
        <button type="button" role="tab" data-m="registro" aria-selected="${modo === 'registro'}">Registrarme</button>
      </div>
      <form class="form" id="frmCuenta">
        ${modo === 'registro' ? `
          <div class="dos"><label>Nombre<input type="text" name="nombre" required autocomplete="given-name"></label>
          <label>Apellido paterno<input type="text" name="apellido_paterno" required autocomplete="family-name"></label></div>
          <div class="dos"><label>Apellido materno<input type="text" name="apellido_materno"></label>
          <label>Fecha de nacimiento<input type="date" name="fecha_nacimiento" required max="${new Date().toISOString().slice(0, 10)}"></label></div>
          <label>Municipio<select name="municipio">${muni}</select></label>` : ''}
        <label>Correo<input type="email" name="email" required autocomplete="email"></label>
        <label>Contraseña<input type="password" name="contrasena" required minlength="6" autocomplete="${modo === 'login' ? 'current-password' : 'new-password'}"></label>
        <p class="error-form" id="errCuenta"></p>
        <button class="btn-ok" type="submit">${modo === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
      </form>`);
    $$('#modalCuerpo [role=tab]').forEach((t) => (t.onclick = () => formularioCuenta(t.dataset.m, despues)));
    $('#frmCuenta').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api(modo === 'login' ? '/api/login' : '/api/registro', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        st.sesion = r;
        persistir();
        pintarCuenta();
        modal.close();
        toast(`¡Hola, ${titulo(r.usuario.nombre)}! 🌿`);
        if (despues) despues();
      } catch (er) {
        $('#errCuenta').textContent = er.message;
      }
    };
  }

  $('#btnCuenta').onclick = async () => {
    if (!st.sesion) return formularioCuenta('login');
    try {
      const u = await api('/api/yo');
      abrirModal(`<h3>👤 ${esc(titulo(u.nombre))} ${esc(titulo(u.apellido_paterno))}</h3>
        <p class="pista">${esc(u.email)} · ${u.edad} años · ${esc(u.municipio)}</p>
        <div class="botones"><button class="btn-sec" type="button" id="btnMisListas">📋 Mis listas</button><button class="btn-sec" type="button" id="btnSalir">Cerrar sesión</button></div>`);
      $('#btnSalir').onclick = () => { st.sesion = null; persistir(); pintarCuenta(); modal.close(); toast('Sesión cerrada'); };
      $('#btnMisListas').onclick = misListas;
    } catch (e) { toast(e.message); }
  };

  async function misListas() {
    if (!st.sesion) return formularioCuenta('login', misListas);
    try {
      const listas = await api('/api/listas');
      abrirModal(`<h3>📋 Mis listas</h3>
        ${listas.length ? listas.map((l) => `<div class="lista-guardada" data-id="${l.id}"><div><b>${esc(l.nombre)}</b><small>${l.productos} productos · ${pesos(l.total)} estimado${l.ahorro > 0 ? ` · ahorro ${pesos(l.ahorro)}` : ''} · ${esc(String(l.fecha_creacion).slice(0, 10))}</small></div>
          <button class="btn-link" data-acc="cargar">Cargar</button><button class="quitar" data-acc="borrar" aria-label="Borrar">🗑</button></div>`).join('') : '<p class="vacio">Aún no guardas listas. Calcula una recomendación y toca “Guardar lista”.</p>'}`);
      $('#modalCuerpo').onclick = async (e) => {
        const b = e.target.closest('[data-acc]');
        if (!b) return;
        const id = b.closest('.lista-guardada').dataset.id;
        if (b.dataset.acc === 'borrar') {
          if (!confirm('¿Borrar esta lista?')) return;
          await api('/api/listas/' + id, { method: 'DELETE' });
          misListas();
        } else {
          const l = await api('/api/listas/' + id);
          st.canasta = l.items.map((i) => ({ ...i, flexible: false }));
          persistir();
          pintarCanasta();
          modal.close();
          toast(`Lista “${l.nombre}” cargada`);
          calcular();
        }
      };
    } catch (e) { toast(e.message); }
  }
  $('#btnListas').onclick = misListas;

  function guardarLista() {
    if (!st.sesion) return formularioCuenta('login', guardarLista);
    const hoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    abrirModal(`<h3>💾 Guardar lista</h3>
      <form class="form" id="frmLista">
        <label>Nombre<input type="text" name="nombre" maxlength="100" value="Canasta ${esc(hoy)}" required></label>
        <label>Descripción (opcional)<input type="text" name="descripcion" maxlength="255" placeholder="Súper de la quincena"></label>
        <p class="error-form" id="errLista"></p>
        <button class="btn-ok" type="submit">Guardar</button>
      </form>`);
    $('#frmLista').onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const p = st.plan;
      const r = st.resultado;
      const comp = Object.fromEntries(r.comparativa.map((c) => [c.key, c]));
      try {
        await api('/api/listas', {
          method: 'POST',
          body: {
            ...f,
            lat: st.ubicacion.lat,
            lon: st.ubicacion.lon,
            transporte: r.transporte.clave,
            sucursales: p.tiendas.map((t) => t.id),
            items: r.items.map((it) => {
              const a = p.asignacion[it.key];
              return {
                id_presentacion: a ? a.id_presentacion : it.id_presentacion,
                cantidad: it.cantidad,
                recomendacion: a && {
                  id_sucursal: a.sucursal,
                  precio_estimado: a.subtotal,
                  ahorro_estimado: comp[it.key].promedio != null ? Math.round((comp[it.key].promedio - a.precio) * it.cantidad * 100) / 100 : null,
                  huella: a.huella != null ? Math.round(a.huella * it.cantidad * 10000) / 10000 : null,
                },
              };
            }),
          },
        });
        modal.close();
        toast('Lista guardada en tu cuenta ✔');
      } catch (er) {
        $('#errLista').textContent = er.message;
      }
    };
  }

  // ---------------------------------------------------------------- arranque
  async function iniciar() {
    try {
      st.info = await api('/api/estado');
    } catch (e) {
      aviso(`<b>No pude conectar con la base de datos.</b> ${esc(e.message)}<br>Revisa que MySQL esté encendido en el puerto 3306 y los datos del archivo <code>.env</code>.`, 'error');
      return;
    }
    const i = st.info;
    if (!i.presentaciones) {
      aviso(`No hay precios de la zona en la base (${i.sucursalesTotales} sucursales cargadas en total). Carga los CSV limpios con <code>python 02_cargar.py</code> y recarga la página.`, 'error');
    }
    if (!i.conFactores) aviso('ℹ️ La tabla <code>factor_emision_producto</code> está vacía: la huella solo considera el traslado. Llena <code>kgco2e_por_kg</code> en <code>mapeo_huella.csv</code> para incluir los productos.');
    const periodos = i.fuentes.map((f) => f.periodo || f.nombre_archivo).join(', ');
    $('#txtDatos').textContent = `Datos QQP (${periodos || 'sin fuentes'}) · ${i.sucursales} tiendas y ${i.presentaciones} presentaciones en la zona · precio más reciente ${i.fechaMax || '—'}.`;

    $('#selMunicipio').innerHTML = '<option value="">Elegir municipio…</option>' + i.municipios.map((m, k) => `<option value="${k}">${esc(m.nombre)} (${m.sucursales} tiendas)</option>`).join('');
    if (!st.ubicacion && i.municipios[0]) st.ubicacion = { lat: i.municipios[0].lat, lon: i.municipios[0].lon, etiqueta: i.municipios[0].nombre };
    if (!st.ubicacion) st.ubicacion = { lat: 20.5888, lon: -100.3899, etiqueta: 'Querétaro' };
    if (!i.transportes.some((t) => t.clave === st.transporte)) st.transporte = 'auto';
    if (st.catalogo && !i.catalogos.some((c) => c.nombre === st.catalogo)) st.catalogo = '';
    pintarCatalogos();
    pintarTransportes();
    pintarCategorias();
    pintarCanasta();
    pintarPreferencias();
    pintarCuenta();
    fijarUbicacion(st.ubicacion.lat, st.ubicacion.lon, st.ubicacion.etiqueta, true);
    st.resultado = null;
    $('#btnBuscar span').textContent = 'Encontrar dónde comprar';

    st.sucursales = await api('/api/sucursales').catch(() => []);
    pintarTiendas();
  }
  iniciar();
})();
