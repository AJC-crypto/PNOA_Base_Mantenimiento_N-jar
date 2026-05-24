/* ============================================================
   ROUTECTRL — Dashboard de Análisis de Rutas
   ============================================================ */

// --- Catálogo de vehículos ---
// --- Catálogo de vehículos (datos del módulo "Configurador de Logística") ---
// Dimensiones tomadas de dbVehiculos de transporte.html. Los campos de ruta
// (radio de giro, ancho mínimo de vía, pendiente máx.) se estiman a partir de
// las dimensiones. El 'type' se asigna para que el análisis siga funcionando.
const VEHICLES = [
  { id:'furgoneta',       name:'Furgoneta Comercial',            type:'standard',     length:3.5,  width:1.8,  height:1.9, weight:3500 },
  { id:'camion_rigido_2e',name:'Camión Rígido (2 ejes)',         type:'standard',     length:8.0,  width:2.55, height:4.0, weight:18000 },
  { id:'camion_rigido_3e',name:'Camión Rígido (3 ejes)',         type:'standard',     length:10.5, width:2.55, height:4.0, weight:25000 },
  { id:'trailer_estandar',name:'Tráiler Articulado (5 ejes)',    type:'standard',     length:13.6, width:2.55, height:4.0, weight:40000 },
  { id:'camion_volquete', name:'Camión Volquete / Obra',         type:'standard',     length:7.5,  width:2.55, height:3.8, weight:26000 },
  { id:'dumper_extravial',name:'Dumper Extravial (canteras)',    type:'offroad',      length:10.0, width:4.5,  height:4.8, weight:100000 },
  { id:'gondola_especial',name:'Góndola de Transporte Especial', type:'special_long', length:22.0, width:3.0,  height:4.5, weight:60000 },
].map(v => ({
  ...v,
  turning_radius: Math.max(6, +(v.length * 1.15).toFixed(1)),
  min_road_width: +(v.width + 1.2).toFixed(2),
  max_grade: v.type === 'offroad' ? 25 : (v.type !== 'standard' ? 7 : (v.weight > 18000 ? 10 : 15)),
}));

// Catálogos de carga y maquinaria (del mismo módulo transporte.html)
const CARGAS = [
  { id:'tierra',    nombre:'Tierra / Áridos',        modo:'fijo' },
  { id:'armaduras', nombre:'Armaduras / Ferralla',   modo:'fijo' },
  { id:'maquinaria',nombre:'Maquinaria Pesada',      modo:'maquina' },
  { id:'vigas',     nombre:'Vigas Pretensoras',      modo:'libre' },
];
const MAQUINARIA = [
  { id:'excavadora_cat',  nombre:'Excavadora Cadenas (CAT 320)',   peso:22500, largo:9.5, ancho:2.98, alto:3.2 },
  { id:'retro_mixta',     nombre:'Retro Mixta (JCB 3CX)',          peso:8100,  largo:5.6, ancho:2.35, alto:3.6 },
  { id:'giratoria_ruedas',nombre:'Giratoria Ruedas (Liebherr A914)',peso:15000,largo:8.3, ancho:2.55, alto:3.15 },
  { id:'compactador',     nombre:'Rodillo (Hamm 3411)',            peso:11500, largo:5.7, ancho:2.25, alto:3.0 },
];

// Elemento diferenciador por tipo de vehículo (para la animación de ruta)
function vehicleGlyph(v) {
  const id = (v && v.id) || '';
  if (id.includes('furgo'))    return { emoji:'🚐', color:'#22c55e' };
  if (id.includes('gondola'))  return { emoji:'🚛', color:'#a855f7' };
  if (id.includes('dumper'))   return { emoji:'🚚', color:'#f97316' };
  if (id.includes('trailer'))  return { emoji:'🚛', color:'#3b82f6' };
  if (id.includes('volquete')) return { emoji:'🚚', color:'#eab308' };
  if (id.includes('rigido'))   return { emoji:'🚛', color:'#06b6d4' };
  return { emoji:'🚛', color:'#3b82f6' };
}

// --- Tipos de riesgo ---
const HAZARD_TYPES = {
  galibo:           { name:'Gálibo reducido',     icon:'⊓', color:'#fbbf24', param:'Altura máx (m)'      },
  estructura_debil: { name:'Estructura débil',     icon:'≈', color:'#ef4444', param:'Peso máx (t)'         },
  estrechamiento:   { name:'Estrechamiento',       icon:'|', color:'#f59e0b', param:'Ancho mín (m)'        },
  cauce:            { name:'Paso sobre cauce',     icon:'~', color:'#06b6d4', param:'Resistencia (t)'      },
  pendiente:        { name:'Pendiente fuerte',     icon:'↗', color:'#a78bfa', param:'Pendiente (%)'        },
  cruce_critico:    { name:'Cruce crítico',        icon:'⊕', color:'#ef4444', param:'Notas'                },
  superficie:       { name:'Superficie deficiente', icon:'░', color:'#a16207', param:'Tipo (barro, arena…)' },
  otro:             { name:'Otro',                 icon:'?', color:'#8b95a3', param:'Notas'                },
};

// --- Estilos por tipo de vía OSM ---
const HIGHWAY_STYLES = {
  motorway:   { color:'#ef4444', weight:4 },
  trunk:      { color:'#f59e0b', weight:3.5 },
  primary:    { color:'#f59e0b', weight:3 },
  secondary:  { color:'#fbbf24', weight:2.5 },
  tertiary:   { color:'#fde68a', weight:2 },
  unclassified:{color:'#cbd5e1', weight:1.5 },
  residential:{ color:'#cbd5e1', weight:1.5 },
  service:    { color:'#94a3b8', weight:1, dashArray:'4,4' },
  track:      { color:'#a16207', weight:1.5, dashArray:'6,3' },
  path:       { color:'#6b7280', weight:1, dashArray:'2,4' },
  footway:    { color:'#6b7280', weight:0.8, dashArray:'2,2' },
  cycleway:   { color:'#06b6d4', weight:0.8, dashArray:'2,2' },
};

// --- Estado global ---
const S = {
  pois: [], hazards: [], destinations: [], overlays: [],
  vehicle: null, load: null,
  origin: null, destination: null, route: null,
  map: null, pnoaLayer: null, osmLayer: null, roadsLayer: null,
  poiLayer: null, hazardLayer: null, destinationLayer: null,
  overlayLayer: null, routeLayer: null, warningLayer: null,
  graph: null, config: null, geojson: null,
  mapMode: 'normal', hazardTypeBeingAdded: null,
  overlayOpacity: 0.7,
};

// ============================================================
// INIT
// ============================================================
async function fetchJSON(url, friendlyName) {
  let r;
  try {
    r = await fetch(url);
  } catch (e) {
    throw new Error(`No se pudo descargar ${friendlyName}. ¿El servidor está corriendo?`);
  }
  if (!r.ok) {
    if (r.status === 404) {
      throw new Error(
        `Falta el archivo "${url}". ` +
        `Ejecuta primero PREPARAR_DASHBOARD.bat y espera a que termine.`
      );
    }
    throw new Error(`Error ${r.status} cargando ${friendlyName}`);
  }
  const txt = await r.text();
  if (txt.trim().startsWith('<')) {
    throw new Error(
      `El servidor devolvió HTML en vez de JSON para "${url}". ` +
      `Probablemente falta el archivo. Ejecuta PREPARAR_DASHBOARD.bat primero.`
    );
  }
  try { return JSON.parse(txt); }
  catch (e) { throw new Error(`JSON inválido en "${url}": ${e.message}`); }
}

async function init() {
  try {
    setLoading('Cargando configuración…');
    S.config = await fetchJSON('config.json', 'configuración');
    setLoading('Cargando red viaria…');
    S.geojson = await fetchJSON('roads.geojson', 'red viaria OSM');
    setLoading('Construyendo grafo de routing…');
    await new Promise(r => setTimeout(r, 10));
    S.graph = buildGraph(S.geojson);
    console.log(`Grafo: ${S.graph.nodes.size} nodos, ${S.graph.adjacency.size} entradas`);

    setLoading('Inicializando mapa…');
    await new Promise(r => setTimeout(r, 10));
    initMap();
    initTabs();
    initPOIsTab();
    initVehicleTab();
    initLoadTab();
    initHazardsTab();
    initRouteTab();
    loadState();
    injectPipelineOverlays();
    updateHeader();
    hideLoading();
  } catch (e) {
    console.error(e);
    setLoading('ERROR: ' + e.message);
  }
}

function setLoading(txt) {
  document.getElementById('loading-text').textContent = txt;
  document.getElementById('loading-overlay').classList.remove('hidden');
}
function hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); }

// ============================================================
// MAPA
// ============================================================
function initMap() {
  const c = S.config;
  S.map = L.map('map', { zoomControl:true, attributionControl:true })
    .setView([c.center.lat, c.center.lng], 13);

  const bounds = [[c.bounds.south, c.bounds.west], [c.bounds.north, c.bounds.east]];
  const tiles = c.tiles;
  if (tiles && tiles.available) {
    S.pnoaLayer = L.tileLayer('tiles/{z}/{x}/{y}.png', {
      minZoom: tiles.min_zoom || 11,
      maxZoom: (tiles.max_zoom || 16) + 3,
      minNativeZoom: tiles.min_zoom || 11,
      maxNativeZoom: tiles.max_zoom || 16,
      bounds: bounds,
      attribution: 'PNOA Máx. Actualidad — IGN',
    }).addTo(S.map);
  } else {
    S.pnoaLayer = L.imageOverlay('pnoa.jpg', bounds, { opacity:1.0 }).addTo(S.map);
  }

  S.osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', opacity:0.55, maxZoom:19,
  });

  // Mapas base adicionales seleccionables
  const baseEsri = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Esri World Imagery', maxZoom: 19 });
  const baseEsriTopo = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Esri Topo', maxZoom: 19 });
  const baseTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenTopoMap', maxZoom: 17 });
  const baseCarto = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© CARTO', maxZoom: 20 });
  const baseIGN = L.tileLayer(
    'https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&format=image/jpeg&tilematrix={z}&tilerow={y}&tilecol={x}',
    { attribution: 'PNOA actual — IGN', maxZoom: 19 });
  const baseEsriStreet = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Esri Streets', maxZoom: 19 });
  const baseOsmHot = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    attribution: '© OSM Humanitarian', maxZoom: 19 });
  const baseCartoDark = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© CARTO', maxZoom: 20 });
  // Overlay de infraestructura ferroviaria (muy útil para este proyecto)
  const ovRailway = L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
    attribution: '© OpenRailwayMap', maxZoom: 19, opacity: 0.9 });

  S.roadsLayer = L.geoJSON(S.geojson, {
    style: f => HIGHWAY_STYLES[f.properties.highway] || { color:'#fff', weight:1, opacity:0.6 },
    onEachFeature: (f, layer) => {
      const p = f.properties;
      const tags = [];
      if (p.highway) tags.push(p.highway);
      if (p.tracktype) tags.push(p.tracktype);
      if (p.surface) tags.push(p.surface);
      if (p.maxweight) tags.push('peso≤' + p.maxweight + 't');
      if (p.maxheight) tags.push('h≤' + p.maxheight + 'm');
      if (p.maxwidth) tags.push('w≤' + p.maxwidth + 'm');
      layer.bindTooltip(
        '<b>' + (p.name || '(sin nombre)') + '</b><br>' + tags.join(' · '),
        { sticky:true }
      );
    },
  }).addTo(S.map);

  S.poiLayer = L.layerGroup().addTo(S.map);
  S.hazardLayer = L.layerGroup().addTo(S.map);
  S.destinationLayer = L.layerGroup().addTo(S.map);
  S.overlayLayer = L.layerGroup().addTo(S.map);
  S.routeLayer = L.layerGroup().addTo(S.map);
  S.warningLayer = L.layerGroup().addTo(S.map);

  const baseMaps = {
    'PNOA ensamblado (local)': S.pnoaLayer,
    'Satélite (Esri)': baseEsri,
    'PNOA actual (IGN)': baseIGN,
    'Topográfico (Esri)': baseEsriTopo,
    'Topográfico (OpenTopo)': baseTopo,
    'Callejero (Esri)': baseEsriStreet,
    'Callejero (OSM)': S.osmLayer,
    'OSM Humanitario': baseOsmHot,
    'Mapa claro (CARTO)': baseCarto,
    'Mapa oscuro (CARTO)': baseCartoDark,
  };
  const overlayMaps = {
    'Ferrocarril (OpenRailwayMap)': ovRailway,
    'Red viaria OSM': S.roadsLayer,
    'Puntos manuales': S.poiLayer,
    'Destinos KML/KMZ': S.destinationLayer,
    'Superposiciones (GroundOverlay)': S.overlayLayer,
    'Riesgos': S.hazardLayer,
    'Ruta': S.routeLayer,
    'Alertas': S.warningLayer,
  };
  S.layerControl = L.control.layers(baseMaps, overlayMaps,
    { collapsed: true, position: 'topright' }).addTo(S.map);

  // Bing y tráfico (si hay claves en config.json) — ver addKeyedProviders()
  try { addKeyedProviders(); }
  catch (e) { console.warn('Proveedores con clave no disponibles:', e); }

  S.map.on('click', onMapClick);

  // Límite: la zona ensamblada (PNOA) es el borde. No se puede alejar ni
  // desplazar más allá de ese rectángulo.
  const lim = L.latLngBounds(bounds).pad(0.05);
  S.map.setMaxBounds(lim);
  S.map.setMinZoom(S.map.getBoundsZoom(lim));   // al alejar, encaja la zona
  S.map.on('drag', () => S.map.panInsideBounds(lim, { animate: false }));
}

// ===== Proveedores con clave (Bing, tráfico TomTom) =====
function bingQuadkey(x, y, z) {
  let q = '';
  for (let i = z; i > 0; i--) {
    let d = 0; const m = 1 << (i - 1);
    if (x & m) d++;
    if (y & m) d += 2;
    q += d;
  }
  return q;
}
function makeBingLayer(tmpl, subs, attribution) {
  const Bing = L.TileLayer.extend({
    getTileUrl: function (c) {
      const s = subs[Math.abs(c.x + c.y) % subs.length];
      return tmpl.replace('{subdomain}', s).replace('{quadkey}', bingQuadkey(c.x, c.y, c.z));
    },
  });
  return new Bing('', { maxZoom: 19, attribution });
}
async function addBing(key) {
  const styles = [
    ['Aerial', 'Bing Satélite'],
    ['AerialWithLabelsOnDemand', 'Bing Satélite+nombres'],
    ['RoadOnDemand', 'Bing Callejero'],
  ];
  for (const [style, label] of styles) {
    try {
      const meta = await fetch(
        `https://dev.virtualearth.net/REST/v1/Imagery/Metadata/${style}?key=${key}&uriScheme=https`
      ).then(r => r.json());
      const res = meta.resourceSets?.[0]?.resources?.[0];
      if (!res || !res.imageUrl) continue;
      const layer = makeBingLayer(res.imageUrl, res.imageUrlSubdomains, 'Bing / Microsoft');
      if (S.layerControl) S.layerControl.addBaseLayer(layer, label);
    } catch (e) { console.warn('Bing no disponible:', style, e); }
  }
}
function addTomTomTraffic(key) {
  const flow = L.tileLayer(
    `https://{s}.api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${key}`,
    { subdomains:['a','b','c','d'], maxZoom: 22, opacity: 0.85, attribution: '© TomTom Traffic' });
  if (S.layerControl) S.layerControl.addOverlay(flow, '🚦 Tráfico (TomTom)');
}
function getMapKeys() {
  let k = {};
  try { k = JSON.parse(localStorage.getItem('routectrl_keys') || '{}'); } catch (_) {}
  if (S.config.bing_key && !k.bing) k.bing = S.config.bing_key;
  if (S.config.tomtom_key && !k.tomtom) k.tomtom = S.config.tomtom_key;
  return k;
}
function addKeyedProviders() {
  const k = getMapKeys();
  if (k.bing) addBing(k.bing);
  if (k.tomtom) addTomTomTraffic(k.tomtom);
}
function setMapKeys() {
  const k = getMapKeys();
  const bing = prompt('Clave de Bing Maps (satélite/callejero). Vacío = quitar:', k.bing || '');
  if (bing !== null) k.bing = bing.trim();
  const tt = prompt('Clave de TomTom (capa de tráfico). Vacío = quitar:', k.tomtom || '');
  if (tt !== null) k.tomtom = tt.trim();
  localStorage.setItem('routectrl_keys', JSON.stringify(k));
  alert('Claves guardadas. Se recarga el dashboard para aplicarlas.');
  location.reload();
}

// ===== Export del recorrido como tour KML para Google Earth Pro =====
function escXml(s) {
  return String(s == null ? '' : s).replace(/[<>&'"]/g,
    c => ({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;' }[c]));
}
function exportGoogleEarthTour() {
  const coords = S._routeCoords;
  if (!coords || coords.length < 2) { alert('Calcula primero una ruta.'); return; }
  const step = Math.max(1, Math.floor(coords.length / 140));
  const pts = coords.filter((_, i) => i % step === 0);
  if (pts[pts.length - 1] !== coords[coords.length - 1]) pts.push(coords[coords.length - 1]);

  const flyTos = pts.map((c, i) => {
    const nxt = pts[Math.min(i + 1, pts.length - 1)];
    const head = bearing(c, nxt);
    const dur = i === 0 ? 2.5 : 1.2;
    return `<gx:FlyTo><gx:duration>${dur}</gx:duration><gx:flyToMode>smooth</gx:flyToMode>` +
      `<Camera><longitude>${c[1]}</longitude><latitude>${c[0]}</latitude>` +
      `<altitude>90</altitude><heading>${head.toFixed(1)}</heading><tilt>80</tilt>` +
      `<altitudeMode>relativeToGround</altitudeMode></Camera></gx:FlyTo>`;
  }).join('\n');

  const lineCoords = coords.map(c => `${c[1]},${c[0]},0`).join(' ');
  const hazPm = (S.hazards || []).map(h =>
    `<Placemark><name>${escXml(h.code || '')} ${escXml(h.name)}</name>` +
    `<Point><coordinates>${h.lng},${h.lat},0</coordinates></Point></Placemark>`).join('\n');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document><name>Recorrido de ruta</name>
<Style id="r"><LineStyle><color>fff6823b</color><width>5</width></LineStyle></Style>
<Placemark><name>Ruta</name><styleUrl>#r</styleUrl>
<LineString><tessellate>1</tessellate><coordinates>${lineCoords}</coordinates></LineString></Placemark>
${hazPm}
<gx:Tour><name>Recorrido (pulsa Play)</name><gx:Playlist>
${flyTos}
</gx:Playlist></gx:Tour>
</Document></kml>`;

  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'recorrido_ruta.kml';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function onMapClick(e) {
  if (S.mapMode === 'add-poi') {
    addPOIPrompt(e.latlng);
    setMapMode('normal');
  } else if (S.mapMode === 'add-hazard') {
    addHazardPrompt(e.latlng, S.hazardTypeBeingAdded);
    setMapMode('normal');
  } else if (S.mapMode === 'set-origin-map') {
    setOriginFromMap(e.latlng);
    setMapMode('normal');
  }
}

function setMapMode(mode, hazardType=null) {
  S.mapMode = mode;
  S.hazardTypeBeingAdded = hazardType;
  document.body.classList.remove('mode-add-poi', 'mode-add-hazard', 'mode-set-origin');
  if (mode === 'add-poi') document.body.classList.add('mode-add-poi');
  else if (mode === 'add-hazard') document.body.classList.add('mode-add-hazard');
  else if (mode === 'set-origin-map') document.body.classList.add('mode-set-origin');
  const el = document.getElementById('status-state');
  if (mode === 'add-poi' || mode === 'add-hazard' || mode === 'set-origin-map') {
    el.textContent = 'CLIC EN MAPA';
    el.className = 'status-value warn';
  } else updateRouteStatus();
}

function updateRouteStatus() {
  const el = document.getElementById('status-state');
  if (!S.route) { el.textContent = 'SIN RUTA'; el.className = 'status-value'; }
}

// ============================================================
// TABS
// ============================================================
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector('.tab-content[data-tab="' + tab.dataset.tab + '"]').classList.add('active');
    });
  });
}

// ============================================================
// PUNTOS (POI)
// ============================================================
function initPOIsTab() {
  document.getElementById('btn-add-poi').addEventListener('click', () => setMapMode('add-poi'));
  renderPOIs();
}

function addPOIPrompt(latlng) {
  const name = prompt('Nombre del punto:');
  if (!name) return;
  S.pois.push({ id:'poi_'+Date.now(), name, lat:latlng.lat, lng:latlng.lng });
  renderPOIs();
  saveState();
}

function renderPOIs() {
  S.poiLayer.clearLayers();
  for (const p of S.pois) {
    const isO = S.origin === p.id;
    const cls = isO ? 'marker-origin' : 'marker-poi';
    const m = L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: cls, iconSize:[20,20], iconAnchor:[10,10] }),
    });
    if (isO) {
      m.bindTooltip('◉ ORIGEN · ' + esc(p.name),
        { permanent:true, direction:'right', className:'lbl lbl-origin', offset:[10,0] });
    } else {
      m.bindTooltip(esc(p.name),
        { permanent:true, direction:'right', className:'lbl lbl-poi', offset:[8,0] });
    }
    S.poiLayer.addLayer(m);
  }
  const list = document.getElementById('poi-list');
  if (!S.pois.length) {
    list.innerHTML = '<div class="list-empty">// SIN PUNTOS</div>';
  } else {
    list.innerHTML = S.pois.map(p => {
      const color = S.origin === p.id ? 'var(--success)' : 'var(--info)';
      const role = S.origin === p.id ? 'ORIGEN' : '';
      return `<div class="list-item" data-id="${p.id}">
        <div class="dot" style="background:${color}"></div>
        <div class="name">${esc(p.name)}${role ? '<span class="sub">'+role+'</span>' : ''}</div>
        <button class="icon ghost" data-act="del-poi" data-id="${p.id}">×</button>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-act="del-poi"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        S.pois = S.pois.filter(p => p.id !== id);
        if (S.origin === id) S.origin = null;
        renderPOIs();
        updateRouteSelects();
        saveState();
      });
    });
    list.querySelectorAll('.list-item').forEach(it => {
      it.addEventListener('click', () => {
        const p = S.pois.find(x => x.id === it.dataset.id);
        if (p) S.map.panTo([p.lat, p.lng]);
      });
    });
  }
  updateRouteSelects();
}

function updateRouteSelects() {
  const o = document.getElementById('select-origin');
  const d = document.getElementById('select-destination');
  if (!o || !d) return;
  // Origen: cualquier POI manual (incl. orígenes desde mapa)
  o.innerHTML = '<option value="">— Seleccionar punto —</option>' +
    S.pois.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  // Destino: solo importados de KML/KMZ
  if (S.destinations.length) {
    d.innerHTML = '<option value="">— Seleccionar destino —</option>' +
      S.destinations.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    d.disabled = false;
  } else {
    d.innerHTML = '<option value="">— Importa un KML/KMZ —</option>';
    d.disabled = true;
  }
  o.value = S.origin || '';
  d.value = S.destination || '';
}

// ============================================================
// VEHICULO
// ============================================================
function initVehicleTab() {
  const sel = document.getElementById('vehicle-select');
  sel.innerHTML = '<option value="">— Seleccionar vehículo —</option>' +
    VEHICLES.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
  sel.addEventListener('change', () => {
    const v = VEHICLES.find(x => x.id === sel.value);
    if (v) {
      S.vehicle = { ...v };
      fillVehicleParams(S.vehicle);
      updateHeader();
      saveState();
    }
  });
  document.querySelectorAll('[data-vehicle-field]').forEach(inp => {
    inp.addEventListener('change', () => {
      if (!S.vehicle) S.vehicle = {};
      const k = inp.dataset.vehicleField;
      S.vehicle[k] = parseFloat(inp.value) || 0;
      updateHeader();
      saveState();
    });
  });
}

function fillVehicleParams(v) {
  document.querySelectorAll('[data-vehicle-field]').forEach(inp => {
    inp.value = v[inp.dataset.vehicleField] ?? '';
  });
}

// ============================================================
// CARGA
// ============================================================
function initLoadTab() {
  document.querySelectorAll('[data-load-field]').forEach(inp => {
    inp.addEventListener('change', () => {
      if (!S.load) S.load = {};
      const k = inp.dataset.loadField;
      S.load[k] = inp.type === 'number' ? (parseFloat(inp.value) || 0) : inp.value;
      updateHeader();
      saveState();
    });
  });
  document.getElementById('btn-auto-vehicle').addEventListener('click', () => {
    if (!S.load || !S.load.weight) {
      alert('Define al menos peso de la carga.');
      return;
    }
    const lL = S.load.length||0, lW = S.load.width||0, lH = S.load.height||0, lWt = S.load.weight||0;
    const fits = VEHICLES.filter(v =>
      v.length >= lL * 0.9 && v.width >= lW && v.height >= lH &&
      (v.weight * 0.4) >= lWt   // simplificación: capacidad de carga ≈ 40% del MMA
    ).sort((a,b) => a.weight - b.weight);
    if (!fits.length) {
      alert('Ningún vehículo del catálogo cumple. Necesitarás transporte especial específico.');
      return;
    }
    const best = fits[0];
    document.getElementById('vehicle-select').value = best.id;
    S.vehicle = { ...best };
    fillVehicleParams(S.vehicle);
    updateHeader();
    saveState();
    alert(`Vehículo sugerido: ${best.name}`);
  });
}

// ============================================================
// RIESGOS
// ============================================================
function initHazardsTab() {
  const grid = document.getElementById('hazard-type-grid');
  grid.innerHTML = Object.entries(HAZARD_TYPES).map(([k,v]) =>
    `<button class="hazard-type-btn" data-type="${k}">
       <span class="icon" style="background:${v.color}">${v.icon}</span>
       <span>${v.name}</span>
     </button>`
  ).join('');
  grid.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => setMapMode('add-hazard', b.dataset.type)));
  renderHazards();
}

function addHazardPrompt(latlng, type) {
  const def = HAZARD_TYPES[type];
  const name = prompt(`Nombre/ubicación del riesgo (${def.name}):`);
  if (!name) return;
  const value = prompt(`${def.param} (opcional):`) || '';
  S.hazards.push({ id:'haz_'+Date.now(), name, type, value, lat:latlng.lat, lng:latlng.lng });
  renderHazards();
  saveState();
}

function renderHazards() {
  S.hazardLayer.clearLayers();
  S._hazMarkers = {};
  S.hazards.forEach((h, idx) => {
    if (!h.code) h.code = 'A' + (idx + 1);
    else h.code = 'A' + (idx + 1);   // renumerar siempre en orden de lista
    const t = HAZARD_TYPES[h.type] || {};
    const color = t.color || '#f59e0b';
    const m = L.marker([h.lat, h.lng], {
      icon: L.divIcon({
        className: 'marker-alert',
        html: `<span class="alert-badge" style="--ac:${color}">${h.code}</span>`,
        iconSize:[28,28], iconAnchor:[14,14],
      }),
    });
    m.bindTooltip(`<b>${h.code} · ${esc(h.name)}</b><br>${esc(t.name||'')}` +
                  (h.value ? '<br>' + esc(h.value) : ''));
    S.hazardLayer.addLayer(m);
    S._hazMarkers[h.id] = m;
  });
  const list = document.getElementById('hazard-list');
  if (!S.hazards.length) {
    list.innerHTML = '<div class="list-empty">// SIN RIESGOS MARCADOS</div>';
    return;
  }
  list.innerHTML = S.hazards.map(h => {
    const t = HAZARD_TYPES[h.type] || {};
    return `<div class="list-item" data-id="${h.id}">
      <div class="dot" style="background:${t.color};border-radius:2px"></div>
      <div class="name"><b style="color:${t.color};font-family:'JetBrains Mono',monospace">${h.code}</b> ${esc(h.name)}<span class="sub">${esc(t.name||'')}${h.value?' — '+esc(h.value):''}</span></div>
      <button class="icon ghost" data-act="del-haz" data-id="${h.id}">×</button>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-act="del-haz"]').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      S.hazards = S.hazards.filter(h => h.id !== b.dataset.id);
      renderHazards();
      saveState();
    }));
  list.querySelectorAll('.list-item').forEach(it =>
    it.addEventListener('click', () => {
      const h = S.hazards.find(x => x.id === it.dataset.id);
      if (!h) return;
      S.map.panTo([h.lat, h.lng]);
      blinkMarker(S._hazMarkers[h.id]);   // su homóloga en el plano parpadea
    }));
}

// Hace parpadear el marcador correspondiente al elemento del listado
function blinkMarker(marker) {
  if (!marker) return;
  const el = marker.getElement();
  if (!el) return;
  el.classList.remove('blinking');
  void el.offsetWidth;            // reinicia la animación CSS
  el.classList.add('blinking');
  setTimeout(() => el.classList.remove('blinking'), 4000);
}

// ============================================================
// RUTA
// ============================================================
function initRouteTab() {
  document.getElementById('select-origin').addEventListener('change', e => {
    S.origin = e.target.value || null; renderPOIs(); saveState();
  });
  document.getElementById('select-destination').addEventListener('change', e => {
    S.destination = e.target.value || null; renderDestinations(); saveState();
  });
  document.getElementById('btn-calculate-route').addEventListener('click', calculateRoute);
  document.getElementById('btn-replay-tour').addEventListener('click', () => {
    if (S._routeCoords) animateRoute(S._routeCoords, S.vehicle, { follow:false, flashAlerts:true });
  });
  document.getElementById('btn-streetview').addEventListener('click', startStreetView);
  document.getElementById('btn-earth-tour').addEventListener('click', exportGoogleEarthTour);
  document.getElementById('btn-map-keys').addEventListener('click', setMapKeys);
  document.getElementById('btn-clear-route').addEventListener('click', () => {
    S.route = null;
    if (_routeAnim) { cancelAnimationFrame(_routeAnim); _routeAnim = null; }
    _routeMarker = null;
    S._routeCoords = null;
    S.routeLayer.clearLayers();
    S.warningLayer.clearLayers();
    const bt = document.getElementById('btn-replay-tour');
    const bs = document.getElementById('btn-streetview');
    const be = document.getElementById('btn-earth-tour');
    if (bt) bt.disabled = true;
    if (bs) bs.disabled = true;
    if (be) be.disabled = true;
    closeAnalysisPanel();
    updateRouteStatus();
    saveState();
  });
  document.getElementById('btn-close-analysis').addEventListener('click', closeAnalysisPanel);

  // KML/KMZ import
  document.getElementById('btn-import-kml').addEventListener('click', () => {
    document.getElementById('file-kml').click();
  });
  document.getElementById('file-kml').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) handleKMLImport(f);
    e.target.value = '';
  });

  // Borrar imports
  document.getElementById('btn-clear-imports').addEventListener('click', () => {
    if (!confirm('¿Borrar todos los destinos y superposiciones importados?')) return;
    S.destinations = [];
    S.overlays.forEach(o => { try { URL.revokeObjectURL(o.imageUrl); } catch(_) {} });
    S.overlays = [];
    if (S.destination) S.destination = null;
    renderDestinations();
    renderOverlays();
    saveState();
  });

  // Origen desde mapa
  document.getElementById('btn-set-origin-map').addEventListener('click', () => {
    setMapMode('set-origin-map');
  });

  // Opacidad superposiciones
  document.getElementById('overlay-opacity').addEventListener('input', e => {
    S.overlayOpacity = parseInt(e.target.value, 10) / 100;
    S.overlayLayer.eachLayer(l => { if (l.setOpacity) l.setOpacity(S.overlayOpacity); });
  });
}

// ============================================================
// IMPORTAR KML / KMZ
// ============================================================
async function handleKMLImport(file) {
  try {
    setLoading('Leyendo ' + file.name + '…');
    let kmlText = '';
    const images = {};

    if (file.name.toLowerCase().endsWith('.kmz')) {
      if (typeof JSZip === 'undefined') {
        throw new Error('JSZip no se cargó. Comprueba tu conexión a internet.');
      }
      const zip = await JSZip.loadAsync(file);
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const lower = path.toLowerCase();
        if (lower.endsWith('.kml')) {
          if (!kmlText) kmlText = await entry.async('text');
        } else if (/\.(png|jpe?g|gif|bmp|tiff?)$/i.test(lower)) {
          const blob = await entry.async('blob');
          const url = URL.createObjectURL(blob);
          images[path] = url;
          const base = path.split('/').pop();
          if (base && base !== path && !images[base]) images[base] = url;
        }
      }
      if (!kmlText) throw new Error('No se encontró ningún archivo .kml dentro del .kmz.');
    } else {
      kmlText = await file.text();
    }

    parseKMLContent(kmlText, images, file.name);
    hideLoading();
  } catch (e) {
    hideLoading();
    console.error(e);
    alert('Error importando: ' + e.message);
  }
}

function parseKMLContent(text, images, sourceName) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    alert('XML inválido en el KML.');
    return;
  }

  let nPoints = 0, nOverlays = 0;
  const ts = Date.now();
  const addedBounds = L.latLngBounds();

  // Placemarks con geometría Point → destinos
  const placemarks = doc.getElementsByTagName('Placemark');
  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i];
    const pt = pm.getElementsByTagName('Point')[0];
    if (!pt) continue;
    const cEl = pt.getElementsByTagName('coordinates')[0];
    if (!cEl) continue;
    const first = cEl.textContent.trim().split(/\s+/)[0];
    const parts = first.split(',').map(parseFloat);
    if (parts.length < 2) continue;
    const lng = parts[0], lat = parts[1];
    if (isNaN(lng) || isNaN(lat)) continue;

    const nm = pm.getElementsByTagName('name')[0];
    const ds = pm.getElementsByTagName('description')[0];
    nPoints++;
    const dest = {
      id: 'dst_' + ts + '_' + nPoints,
      name: nm ? nm.textContent.trim() : 'Destino ' + nPoints,
      desc: ds ? ds.textContent.trim().slice(0, 200) : '',
      lat, lng,
      source: sourceName,
    };
    S.destinations.push(dest);
    addedBounds.extend([lat, lng]);
  }

  // GroundOverlay → imageOverlay en mapa
  const overlays = doc.getElementsByTagName('GroundOverlay');
  for (let i = 0; i < overlays.length; i++) {
    const ov = overlays[i];
    const icon = ov.getElementsByTagName('Icon')[0];
    const hrefEl = icon ? icon.getElementsByTagName('href')[0] : null;
    const box = ov.getElementsByTagName('LatLonBox')[0];
    const quad = ov.getElementsByTagName('gx:LatLonQuad')[0] ||
                 ov.getElementsByTagName('LatLonQuad')[0];
    if (!hrefEl || (!box && !quad)) continue;
    const href = hrefEl.textContent.trim();

    let corners = null;   // {tl, tr, bl} en [lat,lng] para overlay rotado
    let bbounds = null;   // [[s,w],[n,e]] para overlay normal
    let rotation = 0;

    if (quad) {
      // gx:LatLonQuad: 4 esquinas en orden SO, SE, NE, NO (lon,lat)
      const coordsTxt = (quad.getElementsByTagName('coordinates')[0]?.textContent || '').trim();
      const pts = coordsTxt.split(/\s+/).map(p => p.split(',').map(Number));
      if (pts.length >= 4) {
        const [sw, se, ne, nw] = pts;
        corners = { tl:[nw[1], nw[0]], tr:[ne[1], ne[0]], bl:[sw[1], sw[0]] };
        const lats = pts.map(p => p[1]), lngs = pts.map(p => p[0]);
        bbounds = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
      }
    }
    if (!corners && box) {
      const n = parseFloat(box.getElementsByTagName('north')[0]?.textContent);
      const s = parseFloat(box.getElementsByTagName('south')[0]?.textContent);
      const e = parseFloat(box.getElementsByTagName('east')[0]?.textContent);
      const w = parseFloat(box.getElementsByTagName('west')[0]?.textContent);
      if ([n,s,e,w].some(isNaN)) continue;
      bbounds = [[s, w], [n, e]];
      const rEl = box.getElementsByTagName('rotation')[0];
      rotation = rEl ? (parseFloat(rEl.textContent) || 0) : 0;
      if (rotation) {
        // Girar las esquinas alrededor del centro (rotación CCW en grados, como GE)
        const cLat = (n + s) / 2, cLng = (e + w) / 2;
        const rad = rotation * Math.PI / 180;
        const cosr = Math.cos(rad), sinr = Math.sin(rad);
        const kx = Math.cos(cLat * Math.PI / 180);   // corrección de longitud
        const rot = (lat, lng) => {
          const dx = (lng - cLng) * kx, dy = (lat - cLat);
          return [ cLat + (dx * sinr + dy * cosr),
                   cLng + (dx * cosr - dy * sinr) / kx ];
        };
        corners = { tl: rot(n, w), tr: rot(n, e), bl: rot(s, w) };
      }
    }

    let url = href;
    if (!/^https?:\/\//.test(href) && !href.startsWith('data:')) {
      const base = href.split('/').pop();
      url = images[href] || images[base] || href;
    }

    const nm = ov.getElementsByTagName('name')[0];
    nOverlays++;
    S.overlays.push({
      id: 'ovl_' + ts + '_' + nOverlays,
      name: nm ? nm.textContent.trim() : 'Superposición ' + nOverlays,
      imageUrl: url,
      bounds: bbounds,
      corners: corners,        // si hay giro o LatLonQuad
      rotation: rotation,
      source: sourceName,
    });
    addedBounds.extend(bbounds[0]);
    addedBounds.extend(bbounds[1]);
  }

  renderDestinations();
  renderOverlays();
  saveState();

  if (addedBounds.isValid()) {
    S.map.flyToBounds(addedBounds.pad(0.15), { duration: 0.8 });
  }

  let msg = `"${sourceName}" importado:\n• ${nPoints} destino(s)\n• ${nOverlays} superposición(es) gráfica(s)`;
  if (!nPoints && !nOverlays) msg = `No se encontraron puntos ni superposiciones en "${sourceName}".`;
  alert(msg);
}

function setOriginFromMap(latlng) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const poi = {
    id: 'poi_' + Date.now(),
    name: `Origen mapa (${hh}:${mm})`,
    lat: latlng.lat, lng: latlng.lng,
  };
  S.pois.push(poi);
  S.origin = poi.id;
  renderPOIs();
  saveState();
}

function renderDestinations() {
  S.destinationLayer.clearLayers();
  for (const d of S.destinations) {
    const isSel = S.destination === d.id;
    const m = L.marker([d.lat, d.lng], {
      icon: L.divIcon({
        className: isSel ? 'marker-destination' : 'marker-destination-flag',
        iconSize: [22, 22], iconAnchor: [11, 11],
      }),
    });
    if (isSel) {
      m.bindTooltip('▶ DESTINO · ' + esc(d.name),
        { permanent:true, direction:'left', className:'lbl lbl-dest', offset:[-10,0] });
    } else {
      m.bindTooltip(esc(d.name),
        { permanent:true, direction:'left', className:'lbl lbl-dest-soft', offset:[-8,0] });
    }
    m.on('click', () => {
      S.destination = d.id;
      renderDestinations();
      saveState();
    });
    S.destinationLayer.addLayer(m);
  }

  const summary = document.getElementById('destinations-summary');
  const list = document.getElementById('destination-list');
  if (S.destinations.length) {
    summary.style.display = '';
    document.getElementById('destinations-count').textContent = S.destinations.length;
    list.innerHTML = S.destinations.map(d => {
      const sel = S.destination === d.id;
      return `<div class="list-item dest-import ${sel ? 'selected' : ''}" data-id="${d.id}">
        <div class="dot" style="background:var(--critical)"></div>
        <div class="name">${esc(d.name)}${sel ? '<span class="sub">DESTINO ACTIVO</span>' : (d.source ? '<span class="sub">'+esc(d.source)+'</span>' : '')}</div>
      </div>`;
    }).join('');
    list.querySelectorAll('.list-item').forEach(it => {
      it.addEventListener('click', () => {
        const d = S.destinations.find(x => x.id === it.dataset.id);
        if (!d) return;
        S.destination = d.id;
        renderDestinations();
        S.map.panTo([d.lat, d.lng]);
        saveState();
      });
    });
  } else {
    summary.style.display = 'none';
  }
  updateClearImportsButton();
  updateRouteSelects();
}

function renderOverlays() {
  S.overlayLayer.clearLayers();
  for (const o of S.overlays) {
    if (o.visible === false) continue;
    try {
      if (o.tiled) {
        L.tileLayer(o.tilesDir + '/{z}/{x}/{y}.png', {
          minZoom: o.minZoom || 11,
          maxZoom: (o.maxZoom || 17) + 3,
          minNativeZoom: o.minZoom || 11,
          maxNativeZoom: o.maxZoom || 17,
          bounds: o.bounds,
          opacity: S.overlayOpacity,
          tms: false,
          interactive: false,
        }).addTo(S.overlayLayer);
      } else if (o.corners && L.imageOverlay.rotated) {
        // Giro o LatLonQuad: colocar con las 3 esquinas (corrige el desplazamiento)
        const c = o.corners;
        L.imageOverlay.rotated(
          o.imageUrl,
          L.latLng(c.tl[0], c.tl[1]),
          L.latLng(c.tr[0], c.tr[1]),
          L.latLng(c.bl[0], c.bl[1]),
          { opacity: S.overlayOpacity, interactive: false }
        ).addTo(S.overlayLayer);
      } else {
        L.imageOverlay(o.imageUrl, o.bounds, {
          opacity: S.overlayOpacity, interactive: false,
        }).addTo(S.overlayLayer);
      }
    } catch (e) { console.warn('No se pudo cargar overlay', o.name, e); }
  }

  const summary = document.getElementById('overlays-summary');
  const list = document.getElementById('overlay-list');
  if (S.overlays.length) {
    summary.style.display = '';
    document.getElementById('overlays-count').textContent = S.overlays.length;
    list.innerHTML = S.overlays.map(o => `
      <div class="list-item" data-id="${o.id}">
        <div class="dot" style="background:var(--accent);border-radius:2px"></div>
        <div class="name">${esc(o.name)}${o.source ? '<span class="sub">'+esc(o.source)+'</span>' : ''}</div>
      </div>`).join('');
    list.querySelectorAll('.list-item').forEach(it => {
      it.addEventListener('click', () => {
        const o = S.overlays.find(x => x.id === it.dataset.id);
        if (o) S.map.flyToBounds(o.bounds, { duration: 0.6 });
      });
    });
  } else {
    summary.style.display = 'none';
  }
  updateClearImportsButton();
}

function updateClearImportsButton() {
  const btn = document.getElementById('btn-clear-imports');
  if (btn) btn.style.display = (S.destinations.length || S.overlays.length) ? '' : 'none';
}

// ============================================================
// GRAFO + DIJKSTRA
// ============================================================
function buildGraph(geojson) {
  const nodes = new Map();
  const adjacency = new Map();
  for (const f of geojson.features) {
    const ids = f.properties.nodes;
    const coords = f.geometry.coordinates;
    if (!ids || ids.length !== coords.length || ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      if (!nodes.has(ids[i])) nodes.set(ids[i], coords[i]);
    }
    const oneway = (f.properties.oneway === 'yes' || f.properties.oneway === '1' || f.properties.oneway === 'true');
    for (let i = 0; i < ids.length - 1; i++) {
      const a = ids[i], b = ids[i+1];
      const len = haversine(coords[i], coords[i+1]);
      if (!adjacency.has(a)) adjacency.set(a, []);
      if (!adjacency.has(b)) adjacency.set(b, []);
      adjacency.get(a).push({ to:b, length:len, way:f.properties });
      if (!oneway) adjacency.get(b).push({ to:a, length:len, way:f.properties });
    }
  }
  return { nodes, adjacency };
}

function haversine(c1, c2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(c2[1] - c1[1]);
  const dLng = toRad(c2[0] - c1[0]);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(c1[1])) * Math.cos(toRad(c2[1])) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function snapToGraph(latlng) {
  let min = Infinity, nearest = null;
  for (const [id, c] of S.graph.nodes) {
    const d = haversine([latlng.lng, latlng.lat], c);
    if (d < min) { min = d; nearest = id; }
  }
  return { id: nearest, distance: min };
}

function isWayAllowed(way, vehicle, totalWeight) {
  const hwy = way.highway;
  if (['footway','cycleway','steps','pedestrian','bridleway'].includes(hwy)) return false;
  if (way.access === 'no' || way.access === 'private') return false;
  if (!vehicle) return true;
  const mxW = parseFloat(way.maxwidth);
  if (!isNaN(mxW) && mxW < vehicle.width + 0.2) return false;
  const mxH = parseFloat(way.maxheight);
  if (!isNaN(mxH) && mxH < vehicle.height + 0.1) return false;
  const mxWt = parseFloat(way.maxweight);
  if (!isNaN(mxWt) && mxWt * 1000 < totalWeight) return false;
  if (vehicle.type === 'standard') {
    if (hwy === 'path') return false;
    if (hwy === 'track' && (way.tracktype === 'grade4' || way.tracktype === 'grade5')) return false;
  }
  if ((vehicle.type === 'special_long' || vehicle.type === 'special_heavy' || vehicle.type === 'special_dim')
      && (hwy === 'track' || hwy === 'path' || hwy === 'service')) {
    return false;
  }
  return true;
}

function dijkstra(startId, endId, vehicle, totalWeight) {
  const dist = new Map([[startId, 0]]);
  const prev = new Map();
  const visited = new Set();
  const pq = [[0, startId]];
  while (pq.length) {
    pq.sort((a,b) => a[0] - b[0]);
    const [d, u] = pq.shift();
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === endId) break;
    const adj = S.graph.adjacency.get(u) || [];
    for (const e of adj) {
      if (visited.has(e.to)) continue;
      if (!isWayAllowed(e.way, vehicle, totalWeight)) continue;
      const alt = d + e.length;
      if (alt < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, alt);
        prev.set(e.to, { from:u, way:e.way });
        pq.push([alt, e.to]);
      }
    }
  }
  if (!dist.has(endId)) return null;
  const pathNodes = [endId];
  const pathWays = [];
  let cur = endId;
  while (cur !== startId) {
    const p = prev.get(cur);
    if (!p) return null;
    pathWays.unshift(p.way);
    cur = p.from;
    pathNodes.unshift(cur);
  }
  return {
    nodes: pathNodes,
    ways: pathWays,
    coords: pathNodes.map(id => S.graph.nodes.get(id)),
    distance: dist.get(endId),
  };
}

function calculateRoute() {
  if (!S.origin || !S.destination) { alert('Selecciona origen y destino.'); return; }
  if (!S.vehicle) { alert('Selecciona o configura un vehículo.'); return; }
  const orig = S.pois.find(p => p.id === S.origin);
  const dest = S.destinations.find(d => d.id === S.destination);
  if (!orig || !dest) { alert('Puntos no encontrados.'); return; }

  setLoading('Calculando ruta…');

  setTimeout(() => {
    try {
      const so = snapToGraph(orig);
      const sd = snapToGraph(dest);
      if (so.distance > 500 && !confirm(`Origen a ${so.distance.toFixed(0)}m de la red viaria. ¿Continuar?`)) {
        hideLoading(); return;
      }
      if (sd.distance > 500 && !confirm(`Destino a ${sd.distance.toFixed(0)}m de la red viaria. ¿Continuar?`)) {
        hideLoading(); return;
      }
      const totalWeight = S.vehicle.weight + (S.load?.weight || 0);
      const res = dijkstra(so.id, sd.id, S.vehicle, totalWeight);
      if (!res) {
        hideLoading();
        alert('No se encontró ruta entre los puntos para este vehículo. Prueba con otro vehículo o revisa que los puntos estén accesibles desde la red.');
        return;
      }
      S.route = res;
      drawRoute(orig, dest);
      runAnalysis();
      hideLoading();
      saveState();
    } catch (e) {
      console.error(e);
      hideLoading();
      alert('Error: ' + e.message);
    }
  }, 30);
}

function drawRoute(orig, dest) {
  S.routeLayer.clearLayers();
  if (!S.route) return;
  const coords = S.route.coords.map(c => [c[1], c[0]]);
  // halo + line + start/end
  L.polyline(coords, { color:'#000', weight:9, opacity:0.5 }).addTo(S.routeLayer);
  L.polyline(coords, { color:'#3b82f6', weight:4, opacity:0.95 }).addTo(S.routeLayer);
  // Connector lines from POI to snapped graph
  L.polyline([[orig.lat, orig.lng], coords[0]], { color:'#10b981', weight:2, dashArray:'4,4', opacity:0.7 }).addTo(S.routeLayer);
  L.polyline([[dest.lat, dest.lng], coords[coords.length-1]], { color:'#ef4444', weight:2, dashArray:'4,4', opacity:0.7 }).addTo(S.routeLayer);
  S.map.fitBounds(L.latLngBounds(coords).pad(0.15));
  S._routeCoords = coords;
  const bt = document.getElementById('btn-replay-tour');
  const bs = document.getElementById('btn-streetview');
  const be = document.getElementById('btn-earth-tour');
  if (bt) bt.disabled = false;
  if (bs) bs.disabled = false;
  if (be) be.disabled = false;
  animateRoute(coords, S.vehicle, { follow:false, flashAlerts:true });
}

// Recorre la ruta con un elemento diferenciador por tipo de vehículo.
// opts.follow=true  -> la cámara va pegada al vehículo (vista de suelo)
// opts.flashAlerts  -> resalta las alertas de forma llamativa al pasar cerca
let _routeAnim = null;
let _routeMarker = null;
function metersBetween(a, b) {
  const mLat = 110540, mLng = 111320 * Math.cos(a[0] * Math.PI/180);
  return Math.hypot((a[1]-b[1])*mLng, (a[0]-b[0])*mLat);
}
function bearing(a, b) {
  const dLng = (b[1]-a[1]) * Math.cos(a[0]*Math.PI/180);
  const dLat = (b[0]-a[0]);
  return (Math.atan2(dLng, dLat) * 180/Math.PI + 360) % 360;
}
function animateRoute(coords, vehicle, opts) {
  opts = opts || {};
  const follow = !!opts.follow;
  const flashAlerts = opts.flashAlerts !== false;
  if (_routeAnim) { cancelAnimationFrame(_routeAnim); _routeAnim = null; }
  if (_routeMarker) { S.routeLayer.removeLayer(_routeMarker); _routeMarker = null; }
  if (!coords || coords.length < 2) return;
  const g = vehicleGlyph(vehicle || {});
  const marker = L.marker(coords[0], {
    icon: L.divIcon({
      className: 'marker-vehicle',
      html: `<span class="veh-anim" style="--vc:${g.color}">${g.emoji}</span>`,
      iconSize:[34,34], iconAnchor:[17,17],
    }),
    zIndexOffset: 1000,
  }).addTo(S.routeLayer);
  _routeMarker = marker;

  const segs = []; let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0]-coords[i-1][0], coords[i][1]-coords[i-1][1]);
    segs.push(d); total += d;
  }
  if (total <= 0) return;
  const DURATION = follow ? Math.min(30000, Math.max(8000, total * 450000))
                          : Math.min(14000, Math.max(4000, total * 220000));
  if (follow) {
    const maxZ = (S.config.tiles && S.config.tiles.max_zoom ? S.config.tiles.max_zoom + 3 : 19);
    S.map.setZoom(Math.min(maxZ, 19));
  }
  const flashed = {};
  let startT = null;
  function step(ts) {
    if (startT === null) startT = ts;
    let p = (ts - startT) / DURATION;
    if (p > 1) p = 1;
    let dist = p * total, acc = 0, i = 0;
    while (i < segs.length && acc + segs[i] < dist) { acc += segs[i]; i++; }
    let pos;
    if (i >= segs.length) pos = coords[coords.length-1];
    else {
      const f = segs[i] ? (dist - acc) / segs[i] : 0;
      pos = [ coords[i][0] + (coords[i+1][0]-coords[i][0]) * f,
              coords[i][1] + (coords[i+1][1]-coords[i][1]) * f ];
    }
    marker.setLatLng(pos);
    if (follow) S.map.panTo(pos, { animate:false });
    if (flashAlerts && S.hazards) {
      for (const h of S.hazards) {
        if (flashed[h.id]) continue;
        if (metersBetween(pos, [h.lat, h.lng]) < 60) {
          flashed[h.id] = true;
          blinkMarker(S._hazMarkers && S._hazMarkers[h.id]);
        }
      }
    }
    if (p < 1) _routeAnim = requestAnimationFrame(step);
    else _routeAnim = null;
  }
  _routeAnim = requestAnimationFrame(step);
}

// Recorrido Street View (abre Google) + recorrido "pegado al suelo" sobre el PNOA
function startStreetView() {
  const coords = S._routeCoords;
  if (!coords || coords.length < 2) { alert('Calcula primero una ruta.'); return; }
  const o = coords[0];
  const nxt = coords[Math.min(5, coords.length - 1)];
  const head = bearing(o, nxt);
  const url = `https://www.google.com/maps/@?api=1&map_action=pano` +
              `&viewpoint=${o[0]},${o[1]}&heading=${head.toFixed(0)}`;
  window.open(url, '_blank');   // si no hay cobertura, Google avisa
  // En paralelo, recorrido a ras de suelo sobre la ortofoto (siempre disponible)
  animateRoute(coords, S.vehicle, { follow:true, flashAlerts:true });
}

// ============================================================
// ANÁLISIS
// ============================================================
function runAnalysis() {
  if (!S.route || !S.vehicle) return;
  S.warningLayer.clearLayers();
  const warnings = [];
  warnings.push(...analyzeTurns(S.route.coords, S.vehicle));
  warnings.push(...analyzeWays(S.route.ways, S.vehicle));
  warnings.push(...analyzeHazardsOnRoute(S.route, S.hazards, S.vehicle));
  if (S.load) warnings.push(...analyzeLoadConstraints(S.load, S.vehicle));
  const reg = regulatoryAssessment(S.vehicle, S.load, S.route);
  renderAnalysis(warnings, reg);
}

function analyzeTurns(coords, vehicle) {
  const latRef = S.config.center.lat;
  const mLat = 110540;
  const mLng = 111320 * Math.cos(latRef * Math.PI / 180);
  const pts = coords.map(c => [c[0]*mLng, c[1]*mLat]);
  const warnings = [];
  const minR = vehicle.turning_radius;

  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i-1], B = pts[i], C = pts[i+1];
    const ba = [A[0]-B[0], A[1]-B[1]];
    const bc = [C[0]-B[0], C[1]-B[1]];
    const lba = Math.hypot(...ba), lbc = Math.hypot(...bc);
    if (lba < 4 || lbc < 4) continue;
    const cos = (ba[0]*bc[0] + ba[1]*bc[1]) / (lba * lbc);
    const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    const radius = osculatingRadius(A, B, C);
    const turnSeverity = 180 - angle;

    if (turnSeverity > 130 || (isFinite(radius) && radius < minR * 0.7)) {
      warnings.push({
        sev:'critical', type:'GIRO',
        title:`Giro brusco (${turnSeverity.toFixed(0)}° desv.)`,
        msg:`Radio estimado ${isFinite(radius)?radius.toFixed(1)+'m':'∞'} vs. requerido ${minR}m. Probablemente impasable o requiere maniobra múltiple.`,
        coord:[coords[i][1], coords[i][0]],
      });
    } else if (turnSeverity > 90 || (isFinite(radius) && radius < minR * 1.3)) {
      warnings.push({
        sev:'warning', type:'GIRO',
        title:`Giro estrecho (${turnSeverity.toFixed(0)}° desv.)`,
        msg:`Radio ${isFinite(radius)?radius.toFixed(1)+'m':'amplio'} vs. requerido ${minR}m. Maniobrar con precaución; valorar in situ.`,
        coord:[coords[i][1], coords[i][0]],
      });
    }
  }
  return warnings;
}

function osculatingRadius(A, B, C) {
  const ax=A[0], ay=A[1], bx=B[0], by=B[1], cx=C[0], cy=C[1];
  const d = 2 * (ax*(by-cy) + bx*(cy-ay) + cx*(ay-by));
  if (Math.abs(d) < 1e-6) return Infinity;
  const sqA = ax*ax+ay*ay, sqB = bx*bx+by*by, sqC = cx*cx+cy*cy;
  const ux = (sqA*(by-cy) + sqB*(cy-ay) + sqC*(ay-by)) / d;
  const uy = (sqA*(cx-bx) + sqB*(ax-cx) + sqC*(bx-ax)) / d;
  return Math.hypot(ux-ax, uy-ay);
}

function analyzeWays(ways, vehicle) {
  const warn = [];
  const counts = {};
  for (const w of ways) counts[w.highway || 'unknown'] = (counts[w.highway || 'unknown'] || 0) + 1;

  if (counts.track && vehicle.type !== 'offroad' && vehicle.type !== 'standard') {
    warn.push({ sev:'critical', type:'VÍA', title:`${counts.track} tramo(s) por pista forestal/agrícola`,
      msg:`Vehículos especiales no recomendados en pistas no asfaltadas.` });
  } else if (counts.track) {
    warn.push({ sev:'warning', type:'VÍA', title:`${counts.track} tramo(s) por pista`,
      msg:`Verificar estado y firmeza in situ; capacidad portante puede variar con la meteorología.` });
  }

  if (counts.service) {
    warn.push({ sev:'info', type:'VÍA', title:`${counts.service} tramo(s) por viario de servicio`,
      msg:`Acceso de servicio; comprobar permisos y horarios.` });
  }

  // Anchos declarados
  const narrow = ways.filter(w => {
    const mw = parseFloat(w.maxwidth);
    return !isNaN(mw) && mw < vehicle.width + 0.3;
  });
  if (narrow.length) {
    warn.push({ sev:'critical', type:'ANCHO', title:`${narrow.length} tramo(s) con ancho insuficiente`,
      msg:`Anchuras declaradas inferiores a ${(vehicle.width+0.3).toFixed(1)}m.` });
  }

  // Gálibos declarados
  const lowH = ways.filter(w => {
    const mh = parseFloat(w.maxheight);
    return !isNaN(mh) && mh < vehicle.height + 0.2;
  });
  if (lowH.length) {
    warn.push({ sev:'critical', type:'GÁLIBO', title:`${lowH.length} tramo(s) con gálibo insuficiente`,
      msg:`Altura libre inferior a ${(vehicle.height+0.2).toFixed(1)}m declarada en OSM.` });
  }

  // Puentes con peso
  const totalWt = vehicle.weight + (S.load?.weight || 0);
  const weakBr = ways.filter(w => {
    if (!w.bridge || w.bridge === 'no') return false;
    const mw = parseFloat(w.maxweight);
    return !isNaN(mw) && mw * 1000 < totalWt;
  });
  if (weakBr.length) {
    warn.push({ sev:'critical', type:'PUENTE', title:`${weakBr.length} puente(s) con carga máx. insuficiente`,
      msg:`Vehículo+carga = ${(totalWt/1000).toFixed(1)}t supera la carga declarada en algún puente.` });
  }

  return warn;
}

function analyzeHazardsOnRoute(route, hazards, vehicle) {
  const warn = [];
  const latRef = S.config.center.lat;
  const mLat = 110540;
  const mLng = 111320 * Math.cos(latRef * Math.PI / 180);
  const pts = route.coords.map(c => [c[0]*mLng, c[1]*mLat]);
  const BUFFER = 35;  // m
  const totalWt = vehicle.weight + (S.load?.weight || 0);

  for (const h of hazards) {
    const hp = [h.lng*mLng, h.lat*mLat];
    let minD = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = pointToSegmentDist(hp, pts[i], pts[i+1]);
      if (d < minD) minD = d;
    }
    if (minD > BUFFER) continue;

    const t = HAZARD_TYPES[h.type] || {};
    let sev = 'info';
    let msg = h.value ? `${t.param}: ${h.value}` : 'Verificar in situ.';

    if (h.type === 'galibo') {
      const mh = parseFloat(h.value);
      if (!isNaN(mh)) {
        if (mh < vehicle.height) { sev='critical'; msg=`Gálibo ${mh}m < vehículo ${vehicle.height}m. NO transitable.`; }
        else if (mh < vehicle.height + 0.3) { sev='warning'; msg=`Margen escaso (${(mh-vehicle.height).toFixed(2)}m).`; }
        else { sev='info'; msg=`OK (margen ${(mh-vehicle.height).toFixed(2)}m).`; }
      }
    } else if (h.type === 'estructura_debil') {
      const mw = parseFloat(h.value);
      if (!isNaN(mw)) {
        if (mw*1000 < totalWt) { sev='critical'; msg=`Resistencia ${mw}t < total ${(totalWt/1000).toFixed(1)}t. NO transitable.`; }
        else if (mw*1000 < totalWt*1.15) { sev='warning'; msg=`Margen ajustado (${(mw-totalWt/1000).toFixed(1)}t).`; }
        else { sev='info'; msg=`OK.`; }
      } else { sev='warning'; }
    } else if (h.type === 'estrechamiento') {
      const mw = parseFloat(h.value);
      if (!isNaN(mw)) {
        if (mw < vehicle.width) { sev='critical'; msg=`Ancho ${mw}m < vehículo ${vehicle.width}m.`; }
        else if (mw < vehicle.width + 0.3) { sev='warning'; msg=`Margen ${(mw-vehicle.width).toFixed(2)}m.`; }
        else { sev='info'; msg=`OK.`; }
      } else { sev='warning'; }
    } else if (h.type === 'cauce') {
      const mw = parseFloat(h.value);
      if (!isNaN(mw) && mw*1000 < totalWt) { sev='critical'; msg=`Estructura insuficiente: ${mw}t.`; }
      else { sev='warning'; msg=`Cruce de cauce — verificar estado de la estructura in situ.`; }
    } else if (h.type === 'pendiente') {
      const g = parseFloat(h.value);
      if (!isNaN(g) && g > (vehicle.max_grade || 10)) { sev='critical'; msg=`Pendiente ${g}% > capacidad ${vehicle.max_grade}%.`; }
      else if (!isNaN(g)) { sev='info'; msg=`Pendiente ${g}% (cap. ${vehicle.max_grade}%).`; }
    } else if (h.type === 'cruce_critico') {
      sev = 'critical'; msg = h.value || 'Cruce crítico marcado.';
    } else {
      sev = 'warning';
    }

    warn.push({
      sev, type:(t.name||'RIESGO').toUpperCase(),
      title:h.name, msg,
      coord:[h.lat, h.lng],
    });
  }
  return warn;
}

function pointToSegmentDist(p, a, b) {
  const dx=b[0]-a[0], dy=b[1]-a[1];
  const l2 = dx*dx + dy*dy;
  if (l2 < 1e-9) return Math.hypot(p[0]-a[0], p[1]-a[1]);
  const t = Math.max(0, Math.min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / l2));
  return Math.hypot(p[0] - (a[0] + t*dx), p[1] - (a[1] + t*dy));
}

function analyzeLoadConstraints(load, vehicle) {
  const warn = [];
  if (load.length > vehicle.length * 1.1) {
    warn.push({ sev:'warning', type:'CARGA', title:`Carga muy larga`,
      msg:`Carga ${load.length}m vs. caja ${vehicle.length}m. Posible vuelo trasero / configuración especial.` });
  }
  if (load.width > vehicle.width) {
    warn.push({ sev:'critical', type:'CARGA', title:`Sobreancho`,
      msg:`Carga ${load.width}m supera ancho vehículo ${vehicle.width}m. Transporte especial obligatorio.` });
  }
  if (load.weight > vehicle.weight * 0.5) {
    warn.push({ sev:'warning', type:'CARGA', title:`Carga al límite`,
      msg:`Carga ${(load.weight/1000).toFixed(1)}t cerca de capacidad del vehículo.` });
  }
  if (load.type === 'dangerous') {
    warn.push({ sev:'critical', type:'ADR', title:`Mercancía peligrosa (ADR)`,
      msg:`Requiere conductor con ADR, vehículo homologado, documentación específica y rutas autorizadas.` });
  }
  if (load.type === 'indivisible' && load.length > 12) {
    warn.push({ sev:'warning', type:'INDIVISIBLE', title:`Carga indivisible larga`,
      msg:`Estudio de itinerario y posible vehículo piloto requerido.` });
  }
  return warn;
}

function regulatoryAssessment(vehicle, load, route) {
  const r = { category:'Transporte normal', permits:[], resources:[], notes:[] };
  const totalLen = Math.max(vehicle.length, load?.length || 0);
  const totalWid = Math.max(vehicle.width, load?.width || 0);
  const totalHt  = Math.max(vehicle.height, load?.height || 0);
  const totalWt  = vehicle.weight + (load?.weight || 0);

  const lim = { length:16.5, width:2.55, height:4.0, weight:40000 };
  const excede = [];
  if (totalLen > lim.length) excede.push(`longitud (${totalLen}m / ${lim.length}m)`);
  if (totalWid > lim.width)  excede.push(`anchura (${totalWid}m / ${lim.width}m)`);
  if (totalHt  > lim.height) excede.push(`altura (${totalHt}m / ${lim.height}m)`);
  if (totalWt  > lim.weight) excede.push(`masa (${(totalWt/1000).toFixed(1)}t / ${(lim.weight/1000)}t)`);

  if (!excede.length) {
    r.category = 'Transporte normal (dentro de límites generales)';
    r.notes.push('Sin requisitos especiales por dimensiones/masa.');
  } else {
    r.category = `Transporte ESPECIAL — exceso: ${excede.join(', ')}`;
    r.permits.push('Autorización Complementaria de Circulación (DGT) o equivalente autonómica');
    r.permits.push('Vehículo con homologación apropiada y rotativos según RGC');

    if (totalWid > 3.0 || totalLen > 25 || excede.length >= 2) {
      r.permits.push('Estudio de itinerario / autorización por trayecto');
      r.resources.push('Vehículo piloto delantero (cartel "TRANSPORTE ESPECIAL")');
    }
    if (totalWid > 3.5 || totalLen > 30 || totalWt > 60000 || totalHt > 4.5) {
      r.resources.push('Vehículo piloto trasero adicional');
      r.resources.push('Acompañamiento Guardia Civil de Tráfico');
    }
    if (totalWt > 50000) r.notes.push('Verificar capacidad portante de puentes en el itinerario');
    if (totalHt > 4.5) r.notes.push('Coordinar con compañías de líneas eléctricas/telefónicas si cruce aéreo');
    if (totalLen > 20) r.notes.push('Restricciones horarias habituales: no circulación en horas punta');
  }

  // Recursos por longitud de ruta
  const dist = route.distance / 1000;
  if (dist > 80) r.resources.push('Conductor de relevo (jornada > 4.5h conducción)');
  if (dist > 200) r.resources.push('Planificación de paradas reglamentarias (tacógrafo)');

  // Por tipo de carga
  if (load) {
    if (load.weight > 5000) r.resources.push('Equipo de eslingado/trincado homologado');
    if (load.weight > 20000 || (load.length || 0) > 12) r.resources.push('Grúa para carga/descarga');
    if (load.type === 'dangerous') {
      r.permits.push('Carta de porte ADR; ficha de seguridad');
      r.resources.push('Conductor con permiso ADR vigente');
      r.resources.push('Equipo de emergencia ADR (extintor adicional, EPI, cuñas, lámpara…)');
    }
    if (load.type === 'machinery' && load.weight > 10000) {
      r.resources.push('Rampas o medios de carga adecuados');
    }
  }

  // Tramos con riesgos críticos -> recursos extra
  const critHaz = S.hazards.filter(h => h.type === 'estructura_debil' || h.type === 'cauce');
  if (critHaz.length) r.notes.push(`${critHaz.length} estructura(s) crítica(s) marcada(s) en ruta — inspección previa`);

  return r;
}

function renderAnalysis(warnings, reg) {
  document.getElementById('analysis-panel').classList.add('open');

  const dist = S.route.distance / 1000;
  const speed = avgSpeedKmh(S.vehicle, S.route);
  const time = dist / speed * 60;

  document.getElementById('stat-distance').textContent = dist.toFixed(2) + ' km';
  document.getElementById('stat-time').textContent = time < 60 ? time.toFixed(0)+' min' : (time/60).toFixed(1)+' h';
  document.getElementById('stat-segments').textContent = S.route.ways.length;
  document.getElementById('stat-warnings').textContent = warnings.length;

  // Critical -> warning -> info
  const critical = warnings.filter(w => w.sev === 'critical');
  const warning = warnings.filter(w => w.sev === 'warning');
  const info = warnings.filter(w => w.sev === 'info');

  // Código secuencial para los puntos críticos localizables sobre la ruta
  let _ci = 0;
  [...critical, ...warning].forEach(w => { if (w.coord) w.code = 'C' + (++_ci); });

  // Col 1: warnings
  const cw = document.getElementById('col-warnings');
  if (!warnings.length) {
    cw.innerHTML = '<div class="section-title">ALERTAS</div><div class="list-empty">// SIN ALERTAS</div>';
  } else {
    cw.innerHTML = '<div class="section-title">ALERTAS (' + warnings.length + ')</div>' +
      [...critical, ...warning, ...info].map(w => `
        <div class="warning-card ${w.sev}" data-coord="${w.coord ? w.coord.join(',') : ''}">
          <div class="type">${w.code ? w.code + ' · ' : ''}${esc(w.type)}</div>
          <div class="title">${esc(w.title)}</div>
          <div class="msg">${esc(w.msg)}</div>
        </div>
      `).join('');
    cw.querySelectorAll('.warning-card[data-coord]').forEach(c => {
      const coord = c.dataset.coord;
      if (!coord) return;
      c.style.cursor = 'pointer';
      c.addEventListener('click', () => {
        const [lat, lng] = coord.split(',').map(parseFloat);
        S.map.panTo([lat, lng]);
      });
    });
  }

  // Col 2: regulatory
  const cr = document.getElementById('col-regulatory');
  cr.innerHTML = `
    <div class="section-title">CATEGORÍA</div>
    <div style="margin-bottom:14px;font-weight:600;font-size:12px;line-height:1.5">${esc(reg.category)}</div>
    <div class="section-title">PERMISOS / AUTORIZACIONES</div>
    ${reg.permits.length ? '<ul>'+reg.permits.map(p => '<li>'+esc(p)+'</li>').join('')+'</ul>' : '<div class="list-empty">// NINGUNO</div>'}
    ${reg.notes.length ? '<div class="section-title">NOTAS</div><ul>'+reg.notes.map(n => '<li>'+esc(n)+'</li>').join('')+'</ul>' : ''}
  `;

  // Col 3: resources
  const cre = document.getElementById('col-resources');
  cre.innerHTML = `
    <div class="section-title">MEDIOS MATERIALES Y HUMANOS</div>
    ${reg.resources.length ? '<ul>'+reg.resources.map(r => '<li>'+esc(r)+'</li>').join('')+'</ul>' : '<div class="list-empty">// SIN REQUISITOS ESPECIALES</div>'}
  `;

  // Marcadores de puntos críticos sobre la ruta (con código C1, C2...)
  S.warningLayer.clearLayers();
  for (const w of [...critical, ...warning]) {
    if (w.coord) {
      const m = L.marker(w.coord, {
        icon: L.divIcon({
          className: 'marker-warning-route ' + (w.sev === 'critical' ? 'crit' : 'warn'),
          html: `<span class="crit-badge">${w.code || '!'}</span>`,
          iconSize:[24,24], iconAnchor:[12,12],
        }),
      });
      m.bindTooltip(`<b>${w.code ? w.code + ' · ' : ''}${esc(w.title)}</b><br>${esc(w.msg)}`,
        { permanent:false });
      S.warningLayer.addLayer(m);
    }
  }

  // Estado en cabecera
  const el = document.getElementById('status-state');
  if (critical.length) { el.textContent = `${critical.length} CRÍTICAS`; el.className = 'status-value crit'; }
  else if (warning.length) { el.textContent = `${warning.length} ALERTAS`; el.className = 'status-value warn'; }
  else { el.textContent = 'RUTA OK'; el.className = 'status-value ok'; }
}

function avgSpeedKmh(vehicle, route) {
  let totW = 0, totLen = 0;
  const SPD = { motorway:90, trunk:70, primary:60, secondary:50, tertiary:40,
                unclassified:35, residential:30, service:20, track:15, path:8 };
  for (let i = 0; i < route.ways.length; i++) {
    const w = route.ways[i];
    const len = haversine(route.coords[i], route.coords[i+1]);
    const sp = SPD[w.highway] || 30;
    totLen += len;
    totW += len / sp;
  }
  if (totW === 0) return 30;
  // ajuste por tipo de vehículo
  const factor = vehicle.type === 'standard' ? 0.85 :
                 vehicle.type === 'offroad' ? 0.7 : 0.65;
  return (totLen / totW) * factor;
}

function closeAnalysisPanel() {
  document.getElementById('analysis-panel').classList.remove('open');
}

// ============================================================
// HEADER & PERSISTENCIA
// ============================================================
function updateHeader() {
  document.getElementById('status-vehicle').textContent = S.vehicle?.name?.split(' ')[0].toUpperCase() || '—';
  let l = '—';
  if (S.load && S.load.weight) {
    l = (S.load.weight/1000).toFixed(1) + 't';
    if (S.load.length) l += ` · ${S.load.length}m`;
  }
  document.getElementById('status-load').textContent = l;
}

// Inyecta los *_georef.tif procesados por preparar_dashboard.py
// como superposiciones nativas del mapa (no se cargan desde KML).
function injectPipelineOverlays() {
  // 1) Overlays TESELADOS (prioridad: crisp a cualquier zoom)
  const tiled = (S.config && S.config.user_overlays_tiled) || [];
  const yaTeselado = new Set();
  for (const t of tiled) {
    const disp = t.display_name || t.name;
    yaTeselado.add(disp);
    const id = 'pipeline_tiled_' + String(disp).replace(/\s+/g, '_');
    if (S.overlays.some(o => o.id === id)) continue;
    // bounds llegan como [s, w, n, e] → Leaflet quiere [[s,w],[n,e]]
    const b = t.bounds;
    S.overlays.push({
      id,
      name: disp + ' (teselado)',
      bounds: [[b[0], b[1]], [b[2], b[3]]],
      tiled: true,
      tilesDir: t.tiles_dir,
      minZoom: t.min_zoom,
      maxZoom: t.max_zoom,
      opacity: 0.85,
      visible: true,
      fromPipeline: true,
    });
  }
  // 2) Overlays de IMAGEN (solo si no hay versión teselada del mismo)
  const list = (S.config && S.config.user_overlays) || [];
  for (const uo of list) {
    if (yaTeselado.has(uo.name)) continue;
    const id = 'pipeline_' + String(uo.name).replace(/\s+/g, '_');
    if (S.overlays.some(o => o.id === id)) continue;
    // bounds puede venir como dict {w,s,e,n} o como array Leaflet
    let bounds = uo.bounds;
    if (bounds && !Array.isArray(bounds)) {
      bounds = [[bounds.south, bounds.west], [bounds.north, bounds.east]];
    }
    S.overlays.push({
      id,
      name: uo.name + ' (georef)',
      imageUrl: uo.file,
      bounds,
      rotation: 0,
      opacity: 0.85,
      visible: true,
      fromPipeline: true,
    });
  }
  if (typeof renderOverlays === 'function') renderOverlays();
  // Mostrar el panel de overlays aunque no haya importado KMZ
  const sum = document.getElementById('overlays-summary');
  if (sum && S.overlays.length) sum.style.display = '';
}

function saveState() {
  try {
    // overlays NO se persisten (imageUrl son blobs temporales);
    // destinations sí (solo coordenadas + nombre)
    localStorage.setItem('routectrl_state', JSON.stringify({
      pois: S.pois, hazards: S.hazards, destinations: S.destinations,
      vehicle: S.vehicle, load: S.load,
      origin: S.origin, destination: S.destination,
    }));
  } catch (e) { console.warn('No se pudo guardar estado.'); }
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem('routectrl_state') || '{}');
    S.pois = s.pois || [];
    S.hazards = s.hazards || [];
    S.destinations = s.destinations || [];
    S.vehicle = s.vehicle || null;
    S.load = s.load || null;
    S.origin = s.origin || null;
    S.destination = s.destination || null;
    if (S.vehicle && S.vehicle.id) {
      const sel = document.getElementById('vehicle-select');
      if (sel) sel.value = S.vehicle.id;
      fillVehicleParams(S.vehicle);
    }
    if (S.load) {
      Object.entries(S.load).forEach(([k,v]) => {
        const el = document.querySelector(`[data-load-field="${k}"]`);
        if (el) el.value = v ?? '';
      });
    }
    renderPOIs();
    renderDestinations();
    renderHazards();
  } catch (e) { console.warn('Sin estado guardado.'); }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============================================================
// ARRANQUE
// ============================================================
init();
