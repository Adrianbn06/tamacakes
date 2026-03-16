/* Reemplaza con tus datos de Firebase */
const firebaseConfig = {
  apiKey: "AIzaSyBxuYMmrJUfv28ao2hopmvp08ZRVuLnFcw",
  authDomain: "tamacakes-auth.firebaseapp.com",
  projectId: "tamacakes-auth",
  storageBucket: "tamacakes-auth.firebasestorage.app",
  messagingSenderId: "861917887492",
  appId: "1:861917887492:web:975b2f4971a4ed17954951"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbznwikMctSh4afbtipMT3Do4yrefpT1XbDoUwzC9LOATjmTYUXMQWtGY8cCv-bndYxx/exec';

let currentUser = null;
let inventario=[], recetas=[], productos=[], tareas=[], pedidos=[];
const ESTADOS = ['Agendado','Realizando','Listo para entrega','Entregado'];
const ESTADOS_TAR = ['Pendiente','En progreso','Completado'];
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

// CONTROL DE SESIÓN Y VISTA
auth.onAuthStateChanged((user) => {
  if (user) {
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginMsg').textContent = '⏳ Restaurando sesión...';
    cargarDatos(user.email);
  } else {
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginMsg').textContent = '';
  }
});

function iniciarSesion() {
  const e = document.getElementById('loginEmail').value, p = document.getElementById('loginPass').value;
  if(!e||!p){ document.getElementById('loginMsg').textContent = '⚠️ Faltan datos.'; return;}
  document.getElementById('loginMsg').textContent = '⏳ Verificando...';
  auth.signInWithEmailAndPassword(e, p).catch(err => document.getElementById('loginMsg').textContent = '⛔ Credenciales incorrectas.');
}
function logout() { auth.signOut(); }

async function apiCall(action, payload={}) {
  const req = JSON.stringify({ action: action, email: currentUser?.email || payload.email, payload: payload });
  const res = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: req, headers: {'Content-Type': 'text/plain'} });
  return await res.json();
}

function cargarDatos(email) {
  apiCall('getAll', { email }).then(data => {
    if (data.error) { auth.signOut(); return; }
    currentUser = { email, rol: data.rol };
    
    // Parseo seguro de números y JSON
    inventario = (data.inventario||[]).map(x=>({...x, cantidad:Number(x.cantidad), costo:Number(x.costo)}));
    recetas = (data.recetas||[]).map(x=>({...x, ingredientes:JSON.parse(x.ingredientes||'[]')}));
    productos = (data.productos||[]).map(x=>({...x, cantidad:Number(x.cantidad), costo_produccion:Number(x.costo_produccion), precio_venta:Number(x.precio_venta)}));
    tareas = (data.tareas||[]).map(x=>({...x, cantidad_producir:Number(x.cantidad_producir)}));
    pedidos = (data.pedidos||[]).map(x=>({...x, items:JSON.parse(x.items||'[]'), adelanto:Number(x.adelanto)}));

    document.getElementById('userName').textContent = email.split('@')[0];
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    setSyncing(false, 'Sincronizado ✓');
    renderTodo();
    document.getElementById('ordFechaPed').value = new Date().toISOString().split('T')[0];
    document.getElementById('ordFechaEnt').value = new Date().toISOString().split('T')[0];
    document.getElementById('tarFecha').value = new Date().toISOString().split('T')[0];
  }).catch(err => { document.getElementById('loginMsg').textContent = 'Error de conexión BD.'; });
}

function setSyncing(act, msg='') { document.getElementById('syncMsg').textContent = msg||(act?'Sincronizando...':'Sincronizado ✓'); }
const syncInv = async() => { setSyncing(true); await apiCall('saveInventario',{data:inventario}); setSyncing(false); };
const syncRct = async() => { setSyncing(true); await apiCall('saveRecetas',{data:recetas}); setSyncing(false); };
const syncPro = async() => { setSyncing(true); await apiCall('saveProductos',{data:productos}); setSyncing(false); };
const syncTar = async() => { setSyncing(true); await apiCall('saveTareas',{data:tareas}); setSyncing(false); };
const syncOrd = async() => { setSyncing(true); await apiCall('savePedidos',{data:pedidos}); setSyncing(false); };

function renderTodo() { renderInv(); renderRct(); renderPro(); renderTar(); renderOrd(); updateSelects(); checkAlertas(); }

function checkAlertas() {
  const alertas = [];
  inventario.forEach(m => { if(m.cantidad < 5) alertas.push(`Materia prima baja: ${m.nombre} (${m.cantidad} ${m.unidad})`); });
  productos.forEach(p => { if(p.cantidad < 5) alertas.push(`Stock de venta bajo: ${p.nombre} (${p.cantidad} uds)`); });
  document.getElementById('alertasGlobales').innerHTML = alertas.length ? `<div class="alert-box"><strong>⚠️ Alertas:</strong><br>${alertas.join('<br>')}</div>` : '';
}

// 1. MATERIA PRIMA
function addMateriaPrima() {
  const n=document.getElementById('invNombre').value, c=document.getElementById('invCategoria').value, u=document.getElementById('invUnidad').value, q=Number(document.getElementById('invCantidad').value), cost=Number(document.getElementById('invCosto').value);
  if(!n) return;
  inventario.push({id:genId(), nombre:n, categoria:c, unidad:u, cantidad:q, costo:cost});
  syncInv(); renderTodo();
}
function renderInv() {
  const tb = document.getElementById('tbodyInv');
  if(!inventario.length) { tb.innerHTML='<tr><td colspan="5" class="empty">Sin ingredientes</td></tr>'; return; }
  tb.innerHTML = inventario.map(m=>`<tr><td><strong>${m.nombre}</strong></td><td><span class="badge badge-gray">${m.categoria}</span></td><td style="${m.cantidad<5?'color:red':''}">${m.cantidad} ${m.unidad}</td><td>$${m.costo} c/${m.unidad}</td><td><button class="btn btn-danger btn-icon" onclick="inventario=inventario.filter(x=>x.id!=='${m.id}');syncInv();renderTodo();">🗑️</button></td></tr>`).join('');
}

// 2. RECETAS
function addFilaIngrediente() {
  const div = document.createElement('div'); div.className='fila-ingrediente';
  div.innerHTML=`<select class="rctMateria">${inventario.map(m=>`<option value="${m.id}">${m.nombre} (${m.unidad})</option>`).join('')}</select><input type="number" class="rctCant" placeholder="Cant."><button class="btn btn-outline btn-icon" onclick="this.parentElement.remove()">X</button>`;
  document.getElementById('listaIngredientesReceta').appendChild(div);
}
function guardarReceta() {
  const nom = document.getElementById('rctNombre').value;
  const filas = [...document.querySelectorAll('.fila-ingrediente')];
  if(!nom || !filas.length) return;
  const ings = filas.map(f=>({id_materia: f.querySelector('.rctMateria').value, cantidad: Number(f.querySelector('.rctCant').value)}));
  recetas.push({id:genId(), nombre:nom, ingredientes:ings});
  document.getElementById('listaIngredientesReceta').innerHTML='';
  syncRct(); renderTodo();
}
function calCostoRct(id_rct) {
  const r = recetas.find(x=>x.id===id_rct); if(!r) return 0;
  return r.ingredientes.reduce((t, ing) => { const m=inventario.find(x=>x.id===ing.id_materia); return t + (m?m.costo*ing.cantidad:0); }, 0);
}
function renderRct() {
  const tb = document.getElementById('tbodyRct');
  if(!recetas.length) { tb.innerHTML='<tr><td colspan="4" class="empty">Sin recetas</td></tr>'; return; }
  tb.innerHTML = recetas.map(r=>{
    const txt = r.ingredientes.map(i=>{const m=inventario.find(x=>x.id===i.id_materia); return m?`${i.cantidad}${m.unidad} ${m.nombre}`:'?';}).join(', ');
    return `<tr><td><strong>${r.nombre}</strong></td><td style="font-size:.8rem">${txt}</td><td>$${calCostoRct(r.id).toFixed(2)}</td><td><button class="btn btn-danger btn-icon" onclick="recetas=recetas.filter(x=>x.id!=='${r.id}');syncRct();renderTodo();">🗑️</button></td></tr>`;
  }).join('');
}

// 3. PRODUCTOS
function addProducto() {
  const n=document.getElementById('proNombre').value, c=document.getElementById('proCategoria').value, r=document.getElementById('proReceta').value, p=Number(document.getElementById('proPrecio').value);
  if(!n||!r)return;
  productos.push({id:genId(), nombre:n, categoria:c, id_receta:r, precio_venta:p, cantidad:0, costo_produccion:calCostoRct(r)});
  syncPro(); renderTodo();
}
function renderPro() {
  const tb = document.getElementById('tbodyPro');
  if(!productos.length) { tb.innerHTML='<tr><td colspan="6" class="empty">Sin catálogo</td></tr>'; return; }
  tb.innerHTML = productos.map(p=>`<tr><td><strong>${p.nombre}</strong></td><td style="${p.cantidad<5?'color:red':''}">${p.cantidad} uds</td><td>$${p.costo_produccion.toFixed(2)}</td><td>$${p.precio_venta.toFixed(2)}</td><td style="color:var(--sage)">+$${(p.precio_venta-p.costo_produccion).toFixed(2)}</td><td><button class="btn btn-danger btn-icon" onclick="productos=productos.filter(x=>x.id!=='${p.id}');syncPro();renderTodo();">🗑️</button></td></tr>`).join('');
}

// 4. COCINA (DESCUENTO AUTOMÁTICO)
function addTarea() {
  const pId=document.getElementById('tarProducto').value, q=Number(document.getElementById('tarCantidad').value), f=document.getElementById('tarFecha').value, d=document.getElementById('tarDesc').value;
  if(!pId||!q)return;
  tareas.push({id:genId(), producto_id:pId, cantidad_producir:q, fecha_limite:f, descripcion:d, estado:'Pendiente'});
  syncTar(); renderTodo();
}
function cambiarEstadoTar(id, st) {
  const t = tareas.find(x=>x.id===id); if(!t)return;
  if(st === 'Completado' && t.estado !== 'Completado') {
    const prod = productos.find(x=>x.id===t.producto_id);
    const rct = recetas.find(x=>x.id===prod?.id_receta);
    if(!prod || !rct) return alert('Error de vinculación');
    
    // Validar Stock
    let falta = false;
    rct.ingredientes.forEach(ing => { const m=inventario.find(x=>x.id===ing.id_materia); if(!m || m.cantidad < (ing.cantidad*t.cantidad_producir)) falta=true; });
    if(falta) return alert('No hay suficiente materia prima en bodega para cocinar esto.');
    
    // Descontar materia y sumar producto
    rct.ingredientes.forEach(ing => { const m=inventario.find(x=>x.id===ing.id_materia); m.cantidad -= (ing.cantidad*t.cantidad_producir); });
    prod.cantidad += t.cantidad_producir;
    
    t.estado = 'Completado';
    Promise.all([syncTar(), syncInv(), syncPro()]).then(renderTodo);
  } else {
    t.estado = st; syncTar(); renderTodo();
  }
}
function renderTar() {
  const tb = document.getElementById('tbodyTar');
  if(!tareas.length) { tb.innerHTML='<tr><td colspan="5" class="empty">Sin órdenes</td></tr>'; return; }
  tb.innerHTML = tareas.map(t=>{
    const p=productos.find(x=>x.id===t.producto_id);
    const sel = `<select onchange="cambiarEstadoTar('${t.id}',this.value)" ${t.estado==='Completado'?'disabled':''}>${ESTADOS_TAR.map(e=>`<option ${t.estado===e?'selected':''}>${e}</option>`).join('')}</select>`;
    return `<tr><td><strong>${t.cantidad_producir}x ${p?p.nombre:'?'}</strong></td><td>${t.fecha_limite}</td><td>${t.descripcion}</td><td>${sel}</td><td><button class="btn btn-danger btn-icon" onclick="tareas=tareas.filter(x=>x.id!=='${t.id}');syncTar();renderTodo();">🗑️</button></td></tr>`;
  }).join('');
}

// 5. VENTAS (PEDIDOS)
function toggleAdelanto() { document.getElementById('divAdelanto').style.display = document.getElementById('ordEstadoPago').value==='Adelanto'?'block':'none'; }
function addItemRow() {
  const div=document.createElement('div'); div.className='item-row';
  div.innerHTML=`<select class="ordProd">${productos.map(p=>`<option value="${p.id}">${p.nombre} (Stock: ${p.cantidad} | $${p.precio_venta})</option>`).join('')}</select><input type="number" class="ordCant" min="1" placeholder="Cant"><button class="btn btn-outline btn-icon" onclick="this.parentElement.remove()">X</button>`;
  document.getElementById('ordenItems').appendChild(div);
}
function updateSelects() {
  const rSel=document.getElementById('proReceta'); if(rSel) rSel.innerHTML=recetas.map(r=>`<option value="${r.id}">${r.nombre}</option>`).join('');
  const tSel=document.getElementById('tarProducto'); if(tSel) tSel.innerHTML=productos.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('');
  document.querySelectorAll('.ordProd').forEach(s=>{ const v=s.value; s.innerHTML=productos.map(p=>`<option value="${p.id}" ${p.id===v?'selected':''}>${p.nombre}</option>`).join(''); });
}
function agendarPedido() {
  const c=document.getElementById('ordCliente').value, fE=document.getElementById('ordFechaEnt').value, fP=document.getElementById('ordFechaPed').value, m=document.getElementById('ordMetodo').value, stP=document.getElementById('ordEstadoPago').value;
  const ad=stP==='Adelanto'?Number(document.getElementById('ordAdelanto').value):(stP==='Pagado'?-1:0);
  if(!c)return;
  const items = [...document.querySelectorAll('.item-row')].map(r=>({productoId:r.querySelector('.ordProd').value, cantidad:Number(r.querySelector('.ordCant').value)}));
  
  // Validar y descontar stock de vitrina
  for(const it of items){ const p=productos.find(x=>x.id===it.productoId); if(!p || it.cantidad>p.cantidad) return alert('Stock de vitrina insuficiente. Manda a cocinar más.'); }
  items.forEach(it=>{ const p=productos.find(x=>x.id===it.productoId); p.cantidad-=it.cantidad; });
  
  pedidos.push({id:genId(), cliente:c, items, fecha_pedido:fP, fecha_entrega:fE, metodo_pago:m, estado_pago:stP, adelanto:ad, estado:ESTADOS[0]});
  Promise.all([syncPro(), syncOrd()]).then(()=>{ document.getElementById('ordenItems').innerHTML=''; addItemRow(); renderTodo(); });
}
function renderOrd() {
  const kw = document.getElementById('filtroOrd').value.toLowerCase();
  const list = pedidos.filter(o=>o.cliente.toLowerCase().includes(kw));
  const tb = document.getElementById('tbodyOrd');
  if(!list.length) { tb.innerHTML='<tr><td colspan="5" class="empty">Sin ventas</td></tr>'; return; }
  tb.innerHTML = list.map(o=>{
    let tot=0; const txt=o.items.map(it=>{const p=productos.find(x=>x.id===it.productoId); if(p)tot+=p.precio_venta*it.cantidad; return `${p?p.nombre:'?'} x${it.cantidad}`;}).join('<br>');
    const adReal = o.estado_pago==='Pagado'?tot:o.adelanto;
    const stSel = `<select onchange="const p=pedidos.find(x=>x.id==='${o.id}');if(p){p.estado=this.value;syncOrd();}">${ESTADOS.map(e=>`<option ${o.estado===e?'selected':''}>${e}</option>`).join('')}</select>`;
    return `<tr><td><strong>${o.cliente}</strong></td><td style="font-size:.8rem">${txt}</td><td style="font-size:.8rem">P: ${o.fecha_pedido}<br>E: ${o.fecha_entrega}</td><td style="font-size:.8rem">Total: $${tot.toFixed(2)}<br>Falta: $${(tot-adReal).toFixed(2)}<br><span class="badge badge-gray">${o.estado_pago}</span></td><td>${stSel}</td></tr>`;
  }).join('');
}

// NAVEGACIÓN
function switchTab(name,btn){
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active'); btn.classList.add('active');
}