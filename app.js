// ==========================================
// 1. CONFIGURACIÓN (REEMPLAZA CON TUS DATOS)
// ==========================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbznwikMctSh4afbtipMT3Do4yrefpT1XbDoUwzC9LOATjmTYUXMQWtGY8cCv-bndYxx/exec';

const firebaseConfig = {
  apiKey: "AIzaSyBxuYMmrJUfv28ao2hopmvp08ZRVuLnFcw",
  authDomain: "tamacakes-auth.firebaseapp.com",
  projectId: "tamacakes-auth",
  storageBucket: "tamacakes-auth.firebasestorage.app",
  messagingSenderId: "861917887492",
  appId: "1:861917887492:web:975b2f4971a4ed17954951"
};

// ==========================================
// 2. INICIALIZACIÓN
// ==========================================
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ==========================================
// 3. VIGILANTE DE SESIÓN (SOLUCIÓN AL F5)
// ==========================================
auth.onAuthStateChanged((user) => {
  if (user) {
    // Si el navegador recuerda que ya iniciaste sesión
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginMsg').textContent = '⏳ Restaurando sesión...';
    document.getElementById('loginMsg').style.color = '#9c7a60';
    
    // Cargamos los datos sin pedir contraseña de nuevo
    cargarDatosDesdeSheets(user.email);
  } else {
    // Si es la primera vez o le dio a "Salir"
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
  }
});

// ==========================================
// VARIABLES GLOBALES (ESTADO DEL SISTEMA)
// ==========================================
let currentUser = null;
let inventario  = []; // Materia Prima
let recetas     = []; // Catálogo de Fórmulas
let productos   = []; // Pasteles listos para venta
let tareas      = []; // Órdenes de cocina
let pedidos     = []; // Ventas a clientes

const ESTADOS     = ['Agendado','Realizando','Listo para entrega','Entregado'];
const ESTADOS_TAR = ['Pendiente', 'En progreso', 'Completado'];
const genId       = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

// ==========================================
// LÓGICA DE CONEXIÓN Y CARGA
// ==========================================
function apiCall(action, payload={}) {
  const requestBody = JSON.stringify({ action: action, email: payload.email || (currentUser ? currentUser.email : ''), payload: payload });
  return fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: requestBody }).then(r => r.json());
}

function cargarDatosDesdeSheets(emailValidado) {
  apiCall('getAll', { email: emailValidado })
    .then(data => {
      if (data.error) {
        document.getElementById('loginMsg').textContent = '⛔ Sin permisos.';
        auth.signOut(); return;
      }
      currentUser = { email: emailValidado, rol: data.rol };
      
      // PARSEAR TODAS LAS TABLAS
      inventario = parseInv(data.inventario || []);
      recetas    = parseRct(data.recetas || []);
      productos  = parsePro(data.productos || []);
      tareas     = parseTar(data.tareas || []);
      pedidos    = parseOrd(data.pedidos || []);

      document.getElementById('userName').textContent = emailValidado.split('@')[0];
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('app').style.display = 'block';

      setSyncing(false, 'Sincronizado ✓');
      applyRol(); 
      
      // RENDERIZAR TODO
      renderTablaInv(); renderTablaRct(); renderTablaPro(); renderTablaTar(); renderTablaOrd();
      updateSelects(); checkAlertasGlobales();
      
      const hoy = new Date().toISOString().split('T')[0];
      document.getElementById('ordFechaPed').value = hoy; document.getElementById('ordFechaEnt').value = hoy; document.getElementById('tarFecha').value = hoy;
    }).catch(console.error);
}

function logout() {
  auth.signOut().then(() => {
    currentUser = null; inventario = []; recetas = []; productos = []; tareas = []; pedidos = [];
    document.getElementById('loginEmail').value = ''; document.getElementById('loginPass').value = '';
  });
}

// ==========================================
// SINCRONIZACIÓN Y PARSERS
// ==========================================
function setSyncing(active, msg='') { document.getElementById('syncMsg').textContent = msg||(active?'Sincronizando…':'Sincronizado'); }
function syncInv() { setSyncing(true); return apiCall('saveInventario',{data:inventario}).then(()=>setSyncing(false,'Guardado ✓')); }
function syncRct() { setSyncing(true); return apiCall('saveRecetas',{data:recetas}).then(()=>setSyncing(false,'Guardado ✓')); }
function syncPro() { setSyncing(true); return apiCall('saveProductos',{data:productos}).then(()=>setSyncing(false,'Guardado ✓')); }
function syncTar() { setSyncing(true); return apiCall('saveTareas',{data:tareas}).then(()=>setSyncing(false,'Guardado ✓')); }
function syncOrd() { setSyncing(true); return apiCall('savePedidos',{data:pedidos}).then(()=>setSyncing(false,'Guardado ✓')); }

function parseInv(rows) { return rows.map(r=>({id:String(r.id||genId()),nombre:String(r.nombre||''),categoria:String(r.categoria||''),cantidad:Number(r.cantidad||0),unidad:String(r.unidad||'u'),costo:Number(r.costo||0)})); }
function parseRct(rows) { return rows.map(r=>{ let ing=[]; try{ing=typeof r.ingredientes==='string'?JSON.parse(r.ingredientes):(r.ingredientes||[]);}catch{} return {id:String(r.id||genId()),nombre:String(r.nombre||''),ingredientes:ing}; }); }
function parsePro(rows) { return rows.map(r=>({id:String(r.id||genId()),nombre:String(r.nombre||''),categoria:String(r.categoria||''),cantidad:Number(r.cantidad||0),costo_produccion:Number(r.costo_produccion||0),precio_venta:Number(r.precio_venta||0),id_receta:String(r.id_receta||'')})); }
function parseTar(rows) { return rows.map(r=>({id:String(r.id||genId()),descripcion:String(r.descripcion||''),producto_id:String(r.producto_id||''),cantidad_producir:Number(r.cantidad_producir||0),fecha_limite:String(r.fecha_limite||''),estado:String(r.estado||'Pendiente'),timestamp:String(r.timestamp||'')})); }
function parseOrd(rows) { return rows.map(r=>{ let items=[]; try{items=typeof r.items==='string'?JSON.parse(r.items):(r.items||[]);}catch{} return{id:String(r.id||genId()),cliente:String(r.cliente||''),items,fecha_pedido:String(r.fecha_pedido||''),fecha_entrega:String(r.fecha_entrega||''),metodo_pago:String(r.metodo_pago||''),estado_pago:String(r.estado_pago||''),adelanto:Number(r.adelanto||0),estado:String(r.estado||ESTADOS[0])}; }); }

function applyRol() { /* Admin form toggles */ }

// ==========================================
// MOTOR DE ALERTAS
// ==========================================
function checkAlertasGlobales() {
  let alertas = [];
  inventario.forEach(m => { if(m.cantidad <= 5) alertas.push(`🌾 <strong>Materia Prima Baja:</strong> Quedan solo ${m.cantidad} ${m.unidad} de ${m.nombre}`); });
  productos.forEach(p => { if(p.cantidad <= 5) alertas.push(`🍰 <strong>Stock de Venta Bajo:</strong> Quedan solo ${p.cantidad} unidades de ${p.nombre}`); });
  
  const panel = document.getElementById('alertasGlobales');
  if(alertas.length > 0) {
    panel.innerHTML = `<div style="background:#fff3cd; color:#856404; padding:12px; border-radius:8px; border:1px solid #ffeeba;">
      <h4 style="margin:0 0 8px 0;">⚠️ Alertas de Inventario</h4>
      <ul style="margin:0; padding-left:20px; font-size:.9rem;">${alertas.map(a => `<li style="margin-bottom:4px;">${a}</li>`).join('')}</ul>
    </div>`;
  } else { panel.innerHTML = ''; }
}

// ==========================================
// 1. MATERIA PRIMA
// ==========================================
function addMateriaPrima() {
  const n=document.getElementById('invNombre').value.trim(), c=document.getElementById('invCategoria').value.trim(), u=document.getElementById('invUnidad').value, q=Number(document.getElementById('invCantidad').value), cost=Number(document.getElementById('invCosto').value);
  if(!n||isNaN(q)||isNaN(cost)){alert('Completa los campos numéricos y el nombre.');return;}
  inventario.push({id:genId(),nombre:n,categoria:c,cantidad:q,unidad:u,costo:cost}); // Nota: costo debería ser costo por unidad (ej. costo de 1kg) para cálculos de receta.
  ['invNombre','invCategoria','invCantidad','invCosto'].forEach(id=>document.getElementById(id).value='');
  syncInv(); renderTablaInv(); updateSelects(); checkAlertasGlobales();
}
function renderTablaInv() {
  const tb=document.getElementById('tbodyInv');
  if(!inventario.length){ tb.innerHTML=`<tr><td colspan="5"><div class="empty">Sin materia prima</div></td></tr>`; return; }
  tb.innerHTML=inventario.map(p=>`<tr><td><strong>${p.nombre}</strong></td><td><span class="badge badge-gray">${p.categoria}</span></td><td style="${p.cantidad<=5?'color:red;font-weight:bold':''}">${p.cantidad} ${p.unidad}</td><td>$${p.costo.toFixed(2)} c/${p.unidad}</td><td><button class="btn btn-danger btn-sm btn-icon" onclick="inventario=inventario.filter(x=>x.id!=='${p.id}');syncInv();renderTablaInv();checkAlertasGlobales();">🗑️</button></td></tr>`).join('');
}

// ==========================================
// 2. RECETAS (NÚCLEO DEL MRP)
// ==========================================
function addFilaIngrediente() {
  const div = document.createElement('div'); div.className = 'item-row rct-ingrediente'; div.style.display='flex'; div.style.gap='10px'; div.style.marginBottom='8px';
  div.innerHTML = `<select class="rctIdMateria" style="flex:2">${inventario.map(m=>`<option value="${m.id}">${m.nombre} (Mide en ${m.unidad})</option>`).join('')}</select><input type="number" class="rctCantMateria" placeholder="Cantidad" min="0" step="0.01" style="flex:1"><button class="btn btn-outline btn-sm btn-icon" onclick="this.parentElement.remove()">✕</button>`;
  document.getElementById('listaIngredientesReceta').appendChild(div);
}
function guardarReceta() {
  const nombre = document.getElementById('rctNombre').value.trim();
  const filas = document.querySelectorAll('.rct-ingrediente');
  if(!nombre || filas.length===0){alert('Falta el nombre o ingredientes.');return;}
  
  let ingredientes = [];
  filas.forEach(f => {
    ingredientes.push({ id_materia: f.querySelector('.rctIdMateria').value, cantidad: Number(f.querySelector('.rctCantMateria').value) });
  });
  recetas.push({id:genId(), nombre, ingredientes});
  document.getElementById('rctNombre').value=''; document.getElementById('listaIngredientesReceta').innerHTML='';
  syncRct(); renderTablaRct(); updateSelects();
}
function calcularCostoReceta(id_receta) {
  const r = recetas.find(x=>x.id===id_receta); if(!r) return 0;
  return r.ingredientes.reduce((total, ing) => {
    const mat = inventario.find(m=>m.id===ing.id_materia);
    return total + (mat ? mat.costo * ing.cantidad : 0);
  }, 0);
}
function renderTablaRct() {
  const tb=document.getElementById('tbodyRct');
  if(!recetas.length){ tb.innerHTML=`<tr><td colspan="4"><div class="empty">Sin recetas</div></td></tr>`; return; }
  tb.innerHTML=recetas.map(r=>{
    const costo = calcularCostoReceta(r.id);
    const txtIng = r.ingredientes.map(ing=>{ const m=inventario.find(x=>x.id===ing.id_materia); return m?`${ing.cantidad}${m.unidad} de ${m.nombre}`:'?'; }).join(', ');
    return`<tr><td><strong>${r.nombre}</strong></td><td style="font-size:.8rem">${txtIng}</td><td>$${costo.toFixed(2)}</td><td><button class="btn btn-danger btn-sm btn-icon" onclick="recetas=recetas.filter(x=>x.id!=='${r.id}');syncRct();renderTablaRct();updateSelects();">🗑️</button></td></tr>`;
  }).join('');
}

// ==========================================
// 3. PRODUCTOS FINALES
// ==========================================
function addProducto() {
  const n=document.getElementById('proNombre').value.trim(), c=document.getElementById('proCategoria').value.trim(), id_rct=document.getElementById('proReceta').value, precio=Number(document.getElementById('proPrecio').value);
  if(!n || !id_rct || isNaN(precio)){alert('Datos incompletos.');return;}
  productos.push({id:genId(), nombre:n, categoria:c, cantidad:0, costo_produccion:calcularCostoReceta(id_rct), precio_venta:precio, id_receta:id_rct});
  syncPro(); renderTablaPro(); updateSelects(); checkAlertasGlobales();
}
function renderTablaPro() {
  const tb=document.getElementById('tbodyPro');
  if(!productos.length){ tb.innerHTML=`<tr><td colspan="7"><div class="empty">Sin productos listos</div></td></tr>`; return; }
  tb.innerHTML=productos.map(p=>`<tr><td><strong>${p.nombre}</strong></td><td><span class="badge badge-gray">${p.categoria}</span></td><td style="${p.cantidad<=5?'color:red;font-weight:bold':''}">${p.cantidad} uds</td><td>$${p.costo_produccion.toFixed(2)}</td><td>$${p.precio_venta.toFixed(2)}</td><td style="color:green">+$${(p.precio_venta - p.costo_produccion).toFixed(2)}</td><td><button class="btn btn-danger btn-sm btn-icon" onclick="productos=productos.filter(x=>x.id!=='${p.id}');syncPro();renderTablaPro();checkAlertasGlobales();">🗑️</button></td></tr>`).join('');
}

// ==========================================
// 4. TAREAS (PRODUCCIÓN AUTOMATIZADA)
// ==========================================
function addTarea() {
  const prodId=document.getElementById('tarProducto').value, cant=Number(document.getElementById('tarCantidad').value), desc=document.getElementById('tarDesc').value, fecha=document.getElementById('tarFecha').value;
  if(!prodId||!cant||!fecha){alert('Datos incompletos.');return;}
  tareas.push({id:genId(), descripcion:desc, producto_id:prodId, cantidad_producir:cant, fecha_limite:fecha, estado:'Pendiente', timestamp:new Date().toISOString()});
  syncTar(); renderTablaTar();
}
function cambiarEstadoTar(id, estadoNuevo) { 
  const t=tareas.find(x=>x.id===id); if(!t)return;
  
  // SI SE MARCA COMO COMPLETADO: Magia de resta de inventario
  if(estadoNuevo === 'Completado' && t.estado !== 'Completado') {
    const prod = productos.find(x=>x.id===t.producto_id);
    const receta = recetas.find(x=>x.id===prod?.id_receta);
    if(!prod || !receta) return alert('Error: Producto o receta no encontrados.');

    // 1. Validar si hay suficiente materia prima
    let faltaStock = [];
    receta.ingredientes.forEach(ing => {
      const mat = inventario.find(m=>m.id===ing.id_materia);
      const requerido = ing.cantidad * t.cantidad_producir;
      if(!mat || mat.cantidad < requerido) faltaStock.push(`Faltan ${requerido - (mat?mat.cantidad:0)} ${mat?mat.unidad:''} de ${mat?mat.nombre:'Desconocido'}`);
    });

    if(faltaStock.length > 0) {
      alert('⚠️ NO HAY SUFICIENTE MATERIA PRIMA EN BODEGA:\n\n' + faltaStock.join('\n'));
      renderTablaTar(); return; // Cancela la acción
    }

    // 2. Si hay stock, descontamos materia prima
    receta.ingredientes.forEach(ing => {
      const mat = inventario.find(m=>m.id===ing.id_materia);
      mat.cantidad -= (ing.cantidad * t.cantidad_producir);
    });

    // 3. Sumamos los pasteles listos al catálogo de productos
    prod.cantidad += t.cantidad_producir;

    t.estado = estadoNuevo;
    Promise.all([syncTar(), syncInv(), syncPro()]).then(()=>{ renderTablaTar(); renderTablaInv(); renderTablaPro(); checkAlertasGlobales(); alert('✅ Producción completada. Inventarios actualizados automáticamente.'); });
  } else {
    t.estado = estadoNuevo; syncTar(); renderTablaTar();
  }
}
function renderTablaTar() {
  const tb=document.getElementById('tbodyTar');
  if(!tareas.length){ tb.innerHTML=`<tr><td colspan="5"><div class="empty">Cocina libre</div></td></tr>`; return; }
  tb.innerHTML=[...tareas].sort((a,b)=>new Date(a.fecha_limite)-new Date(b.fecha_limite)).map(t=>{ 
    const p=productos.find(x=>x.id===t.producto_id);
    const opts=ESTADOS_TAR.map(e=>`<option value="${e}" ${e===t.estado?'selected':''}>${e}</option>`).join('');
    return`<tr><td><strong>${t.cantidad_producir}x ${p?p.nombre:'?'}</strong></td><td style="font-size:.8rem">${t.descripcion}</td><td>${t.fecha_limite}</td><td><select style="padding:.2rem;border-radius:4px" onchange="cambiarEstadoTar('${t.id}',this.value)" ${t.estado==='Completado'?'disabled':''}>${opts}</select></td><td><button class="btn btn-danger btn-sm btn-icon" onclick="tareas=tareas.filter(x=>x.id!=='${t.id}');syncTar();renderTablaTar();">🗑️</button></td></tr>`; 
  }).join('');
}

// ==========================================
// 5. PEDIDOS (VENTAS)
// ==========================================
function toggleAdelanto(){ document.getElementById('divAdelanto').style.display = (document.getElementById('ordEstadoPago').value==='Adelanto')?'flex':'none'; }
function addItemRow() {
  const div=document.createElement('div'); div.className='item-row';
  div.innerHTML=`<select class="ordenProducto" style="flex:2">${productos.map(p=>`<option value="${p.id}">${p.nombre} (Stock: ${p.cantidad} a $${p.precio_venta})</option>`).join('')}</select><input type="number" class="ordenCantidad" min="1" placeholder="Cant." style="flex:1"><button class="btn btn-outline btn-sm btn-icon" onclick="this.parentElement.remove()">✕</button>`;
  document.getElementById('ordenItems').appendChild(div);
}
function updateSelects() { 
  const pR=document.getElementById('proReceta'); if(pR) pR.innerHTML = recetas.map(r=>`<option value="${r.id}">${r.nombre}</option>`).join('');
  const tP=document.getElementById('tarProducto'); if(tP) tP.innerHTML = productos.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('');
  document.querySelectorAll('.ordenProducto').forEach(sel=>{ const v=sel.value; sel.innerHTML=productos.map(p=>`<option value="${p.id}" ${p.id===v?'selected':''}>${p.nombre} (Stock: ${p.cantidad})</option>`).join(''); });
}

function agendarPedido() {
  const c=document.getElementById('ordCliente').value.trim(), fP=document.getElementById('ordFechaPed').value, fE=document.getElementById('ordFechaEnt').value, met=document.getElementById('ordMetodo').value, estP=document.getElementById('ordEstadoPago').value;
  const adelanto = estP==='Adelanto'?Number(document.getElementById('ordAdelanto').value):(estP==='Pagado'?-1:0);
  if(!c||!fP||!fE){alert('Faltan datos de cliente.');return;}
  
  const rows=[...document.querySelectorAll('.item-row')]; if(!rows.length){alert('Añade productos de la vitrina.');return;}
  const items=rows.map(r=>({productoId:r.querySelector('.ordenProducto').value, cantidad:Number(r.querySelector('.ordenCantidad').value)||0}));
  
  // Validar y restar stock de PRODUCTOS FINALES
  for(const it of items){ const p=productos.find(x=>x.id===it.productoId); if(!p||it.cantidad>p.cantidad){alert(`Stock insuficiente de ${p?p.nombre:'producto'}. Ve a Tareas y pon a cocinar más.`);return;} }
  items.forEach(it=>{const p=productos.find(x=>x.id===it.productoId); if(p) p.cantidad -= it.cantidad;});
  
  pedidos.push({id:genId(), cliente:c, items, fecha_pedido:fP, fecha_entrega:fE, metodo_pago:met, estado_pago:estP, adelanto, estado:ESTADOS[0], timestamp:new Date().toISOString()});
  Promise.all([syncPro(), syncOrd()]).then(()=>{ 
    document.getElementById('ordenItems').innerHTML=''; addItemRow(); renderTablaPro(); renderTablaOrd(); checkAlertasGlobales();
  });
}

function renderTablaOrd() {
  const tb=document.getElementById('tbodyOrd');
  if(!pedidos.length){ tb.innerHTML=`<tr><td colspan="6"><div class="empty">Sin ventas</div></td></tr>`; return; }
  tb.innerHTML=pedidos.map(o=>{ 
    let tot=0; const txt=o.items.map(it=>{const p=productos.find(x=>x.id===it.productoId); if(p) tot+=(p.precio_venta*it.cantidad); return`${p?p.nombre:'?'} x${it.cantidad}`;}).join('<br>'); 
    let ad = o.estado_pago==='Pagado'?tot:o.adelanto, falta = tot-ad;
    const opts=ESTADOS.map(e=>`<option value="${e}" ${e===o.estado?'selected':''}>${e}</option>`).join(''); 
    return`<tr><td><strong>${o.cliente}</strong></td><td style="font-size:.8rem">P: ${o.fecha_pedido}<br>E: <strong>${o.fecha_entrega}</strong></td><td style="font-size:.85rem">${txt}</td><td style="font-size:.85rem">Total: $${tot.toFixed(2)}<br><strong style="color:var(--rose)">Falta: $${falta.toFixed(2)}</strong></td><td><span class="badge ${o.estado_pago==='Pagado'?'badge-green':'badge-gray'}">${o.estado_pago}</span><br><span style="font-size:.7rem">${o.metodo_pago}</span></td><td><select style="font-size:.8rem;padding:.2rem;border-radius:4px" onchange="const p=pedidos.find(x=>x.id==='${o.id}');if(p){p.estado=this.value;syncOrd();}">${opts}</select></td></tr>`; 
  }).join('');
}

// Navegación de pestañas
function switchTab(name,btn){ document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); document.getElementById('tab-'+name).classList.add('active'); btn.classList.add('active'); }