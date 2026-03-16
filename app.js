const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbznwikMctSh4afbtipMT3Do4yrefpT1XbDoUwzC9LOATjmTYUXMQWtGY8cCv-bndYxx/exec';

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

let currentUser = null;
let inventario=[], recetas=[], productos=[], tareas=[], pedidos=[];

let invEnEdicion = null;
let recetaEnEdicion = null; 
let proEnEdicion = null;
let sortByDate = false; 

const ESTADOS = ['Agendado','Realizando','Listo para entrega','Entregado'];
const ESTADOS_TAR = ['Pendiente','En progreso','Completado'];

function getNextId(arr) {
  if (!arr || arr.length === 0) return 1;
  return Math.max(...arr.map(item => Number(item.id) || 0)) + 1;
}

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

function parseHistorial(str, cant) {
  if(!str) return [];
  try {
    const parsed = JSON.parse(str);
    if(Array.isArray(parsed)) return parsed;
    return [{fecha: str, cantidad: cant}]; 
  } catch(e) { return [{fecha: str, cantidad: cant}]; }
}

function cargarDatos(email) {
  apiCall('getAll', { email }).then(data => {
    if (data.error) { auth.signOut(); return; }
    currentUser = { email, rol: data.rol };
    
    inventario = (data.inventario||[]).map(x=>({...x, id:Number(x.id), cantidad:Number(x.cantidad), historial: parseHistorial(x.fecha_compra, x.cantidad)}));
    // RECETAS AHORA INCLUYE EL ENCARGADO
    recetas = (data.recetas||[]).map(x=>({...x, id:Number(x.id), rendimiento:Number(x.rendimiento)||1, encargado:x.encargado||'General', ingredientes:JSON.parse(x.ingredientes||'[]').map(i=>({...i, id_materia:Number(i.id_materia), cantidad:Number(i.cantidad)}))}));
    productos = (data.productos||[]).map(x=>({...x, id:Number(x.id), precio_venta:Number(x.precio_venta), recetas:JSON.parse(x.recetas||'[]').map(r=>({...r, id_receta:Number(r.id_receta), cantidad:Number(r.cantidad)}))}));
    
    // TAREAS AHORA FUNCIONAN POR RECETA_ID, NO POR PRODUCTO
    tareas = (data.tareas||[]).map(x=>({...x, id:Number(x.id), pedido_id:Number(x.pedido_id), receta_id:Number(x.receta_id), cantidad_producir:Number(x.cantidad_producir)}));
    pedidos = (data.pedidos||[]).map(x=>({...x, id:Number(x.id), items:JSON.parse(x.items||'[]').map(i=>({...i, productoId:Number(i.productoId), cantidad:Number(i.cantidad)})), adelanto:Number(x.adelanto), notas:x.notas||'', celular:x.celular||''}));

    document.getElementById('userName').textContent = email.split('@')[0];
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    setSyncing(false, 'Sincronizado ✓');
    renderTodo();
    document.getElementById('ordFechaPed').value = new Date().toISOString().split('T')[0];
    document.getElementById('ordFechaEnt').value = new Date().toISOString().split('T')[0];
    document.getElementById('invFechaCompra').value = new Date().toISOString().split('T')[0];
  });
}

function setSyncing(act, msg='') { document.getElementById('syncMsg').textContent = msg||(act?'Sincronizando...':'Sincronizado ✓'); }

const syncInv = async() => { setSyncing(true); const invToSave = inventario.map(x => ({...x, fecha_compra: JSON.stringify(x.historial)})); await apiCall('saveInventario',{data: invToSave}); setSyncing(false); };
const syncRct = async() => { setSyncing(true); await apiCall('saveRecetas',{data:recetas}); setSyncing(false); };
const syncPro = async() => { setSyncing(true); await apiCall('saveProductos',{data:productos}); setSyncing(false); };
const syncTar = async() => { setSyncing(true); await apiCall('saveTareas',{data:tareas}); setSyncing(false); };
const syncOrd = async() => { setSyncing(true); await apiCall('savePedidos',{data:pedidos}); setSyncing(false); };

function renderTodo() { renderInv(); renderRct(); renderPro(); renderTar(); renderOrd(); updateSelects(); checkAlertas(); updateFiltroCocina(); }

// ALERTAS 
function checkAlertas() {
  const snoozeUntil = localStorage.getItem('alertasSnoozeUntil');
  if (snoozeUntil && Date.now() < Number(snoozeUntil)) { document.getElementById('alertasGlobales').innerHTML = ''; return; }
  const alertas = [];
  inventario.forEach(m => { if(m.cantidad < 5) alertas.push(`Materia prima baja: ${m.nombre} (${m.cantidad.toFixed(2)} ${m.unidad})`); });
  if (alertas.length > 0) {
    document.getElementById('alertasGlobales').innerHTML = `<div class="alert-box"><button class="alert-close" onclick="dismissAlertas()" title="Ocultar por 3 horas">✕</button><strong style="color: #b33959;">⚠️ Alertas de Bodega:</strong><br>${alertas.join('<br>')}</div>`;
  } else { document.getElementById('alertasGlobales').innerHTML = ''; }
}
function dismissAlertas() { localStorage.setItem('alertasSnoozeUntil', Date.now() + (3 * 60 * 60 * 1000)); document.getElementById('alertasGlobales').innerHTML = ''; }

function getConversion(cant, uOrigen, uDestino) {
  if(!uOrigen || uOrigen === uDestino) return cant;
  if(uOrigen==='g' && uDestino==='kg') return cant/1000;
  if(uOrigen==='kg' && uDestino==='g') return cant*1000;
  if(uOrigen==='ml' && uDestino==='L') return cant/1000;
  if(uOrigen==='L' && uDestino==='ml') return cant*1000;
  return cant;
}
function getDisplayConversion(quantity, unit) {
  let otherUnit, factor;
  switch(unit) {
    case 'g': otherUnit = 'kg'; factor = 0.001; break;
    case 'kg': otherUnit = 'g'; factor = 1000; break;
    case 'ml': otherUnit = 'L'; factor = 0.001; break;
    case 'L': otherUnit = 'ml'; factor = 1000; break;
    default: return null; 
  }
  return { quantity: quantity * factor, unit: otherUnit };
}

// ==========================================
// 1. MATERIA PRIMA
// ==========================================
function addMateriaPrima() {
  const n=document.getElementById('invNombre').value.trim(), c=document.getElementById('invCategoria').value, u=document.getElementById('invUnidad').value, q=Number(document.getElementById('invCantidad').value), f=document.getElementById('invFechaCompra').value;
  if(!n || isNaN(q) || q <= 0 || !f) return alert('Ingresa un nombre, una fecha y una cantidad mayor a 0.');
  const nombreEstandar = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();

  if (invEnEdicion) {
    const mat = inventario.find(x => x.id === invEnEdicion);
    if(mat) { mat.nombre=nombreEstandar; mat.categoria=c; mat.unidad=u; mat.cantidad=q; } 
  } else {
    const matExistente = inventario.find(x => x.nombre.toLowerCase() === nombreEstandar.toLowerCase());
    if (matExistente) {
      matExistente.cantidad += getConversion(q, u, matExistente.unidad);
      matExistente.historial.push({fecha: f, cantidad: q, unidad_compra: u});
    } else {
      inventario.push({id: getNextId(inventario), nombre: nombreEstandar, categoria: c, unidad: u, cantidad: q, historial: [{fecha: f, cantidad: q, unidad_compra: u}]});
    }
  }
  syncInv(); renderTodo(); document.getElementById('invNombre').value=''; document.getElementById('invCantidad').value=''; invEnEdicion = null; document.getElementById('btnGuardarInv').textContent = "+ Añadir / Sumar";
}
function verHistorialMateria(id) {
  const mat = inventario.find(x=>x.id===id); if(!mat) return;
  document.getElementById('modalHistTitulo').textContent = 'Compras de ' + mat.nombre;
  const lista = document.getElementById('modalHistLista');
  lista.innerHTML = (!mat.historial || mat.historial.length === 0) ? '<li>Sin registros.</li>' : mat.historial.map(h => `<li>📅 <strong>${h.fecha}:</strong> Se ingresaron ${h.cantidad} ${h.unidad_compra || mat.unidad}</li>`).join('');
  document.getElementById('modalHistorial').style.display = 'flex';
}
function editarMateriaPrima(id) {
  id = Number(id); const m = inventario.find(x=>x.id===id); if(!m) return;
  invEnEdicion = id;
  document.getElementById('invNombre').value = m.nombre; document.getElementById('invCategoria').value = m.categoria; document.getElementById('invUnidad').value = m.unidad; document.getElementById('invCantidad').value = m.cantidad; document.getElementById('invFechaCompra').value = new Date().toISOString().split('T')[0]; document.getElementById('btnGuardarInv').textContent = "Ajustar Total";
}
function eliminarMateriaPrima(id) {
  if(!confirm("¿Eliminar ingrediente por completo de la base de datos?")) return;
  id = Number(id); inventario=inventario.filter(x=>x.id!==id); syncInv(); renderTodo();
}
function renderInv() {
  const tb = document.getElementById('tbodyInv');
  if(!inventario.length) { tb.innerHTML='<tr><td colspan="5" class="empty">Sin ingredientes</td></tr>'; return; }
  tb.innerHTML = inventario.map(m=> {
    const otherStock = getDisplayConversion(m.cantidad, m.unidad);
    const stockDisplay = `${m.cantidad.toFixed(2)} ${m.unidad}${otherStock ? ` / ${otherStock.quantity.toFixed(2)} ${otherStock.unit}` : ''}`;
    return `<tr><td><strong>${m.nombre}</strong></td><td><span class="badge badge-gray">${m.categoria}</span></td><td style="${m.cantidad<5?'color:var(--rose);font-weight:bold':''}">${stockDisplay}</td><td><button class="btn btn-outline btn-sm" onclick="verHistorialMateria(${m.id})">🛒 Ver Compras</button></td><td><button class="btn btn-outline btn-icon" style="margin-right:5px;" onclick="editarMateriaPrima(${m.id})">✏️</button><button class="btn btn-danger btn-icon" onclick="eliminarMateriaPrima(${m.id})">🗑️</button></td></tr>`;
  }).join('');
}

// ==========================================
// 2. RECETAS (AHORA INCLUYEN ENCARGADO)
// ==========================================
function addFilaIngrediente(ingData = null) {
  const div = document.createElement('div'); div.className='fila-ingrediente';
  const optionString = inventario.map(m=> {
    const otherStock = getDisplayConversion(m.cantidad, m.unidad);
    const bodegaDisplay = `Bodega: ${m.cantidad.toFixed(2)} ${m.unidad}${otherStock ? ` / ${otherStock.quantity.toFixed(2)} ${otherStock.unit}` : ''}`;
    return `<option value="${m.id}" ${ingData&&ingData.id_materia===m.id?'selected':''}>${m.nombre} (${bodegaDisplay})</option>`;
  }).join('');
  div.innerHTML=`<select class="rctMateria">${optionString}</select><input type="number" step="0.01" class="rctCant" placeholder="Cant." value="${ingData?ingData.cantidad:''}"><select class="rctUnidad"><option value="g" ${ingData&&ingData.unidad==='g'?'selected':''}>g</option><option value="kg" ${ingData&&ingData.unidad==='kg'?'selected':''}>kg</option><option value="ml" ${ingData&&ingData.unidad==='ml'?'selected':''}>ml</option><option value="L" ${ingData&&ingData.unidad==='L'?'selected':''}>L</option><option value="unidades" ${ingData&&ingData.unidad==='unidades'?'selected':''}>uds</option></select><button class="btn btn-outline btn-icon" onclick="this.parentElement.remove()">X</button>`;
  document.getElementById('listaIngredientesReceta').appendChild(div);
}
function guardarReceta() {
  const nom = document.getElementById('rctNombre').value, encargado = document.getElementById('rctEncargado').value || 'General', rend = Number(document.getElementById('rctRendimiento').value) || 1;
  const filas = [...document.querySelectorAll('.fila-ingrediente')];
  if(!nom || !filas.length) return alert('Falta nombre o ingredientes.');
  const ings = filas.map(f=>({ id_materia: Number(f.querySelector('.rctMateria').value), cantidad: Number(f.querySelector('.rctCant').value), unidad: f.querySelector('.rctUnidad').value }));
  
  if(recetaEnEdicion) recetas = recetas.filter(r=>r.id!==recetaEnEdicion);
  recetas.push({id: recetaEnEdicion || getNextId(recetas), nombre:nom, rendimiento:rend, encargado: encargado, ingredientes:ings});
  
  document.getElementById('rctNombre').value=''; document.getElementById('rctEncargado').value=''; document.getElementById('rctRendimiento').value='1'; document.getElementById('listaIngredientesReceta').innerHTML='';
  recetaEnEdicion = null; document.getElementById('btnGuardarReceta').textContent = "Guardar Receta";
  syncRct().then(renderTodo);
}
function editarReceta(id) {
  id = Number(id); const r = recetas.find(x=>x.id===id); if(!r) return;
  recetaEnEdicion = id; document.getElementById('rctNombre').value = r.nombre; document.getElementById('rctEncargado').value = r.encargado || ''; document.getElementById('rctRendimiento').value = r.rendimiento || 1;
  document.getElementById('listaIngredientesReceta').innerHTML = ''; r.ingredientes.forEach(ing => addFilaIngrediente(ing));
  document.getElementById('btnGuardarReceta').textContent = "Actualizar Receta";
}
function eliminarReceta(id) {
  if(!confirm("¿Eliminar receta?")) return;
  id = Number(id); recetas = recetas.filter(x=>x.id!==id); syncRct().then(renderTodo);
}
function renderRct() {
  const tb = document.getElementById('tbodyRct');
  if(!recetas.length) { tb.innerHTML='<tr><td colspan="4" class="empty">Sin recetas</td></tr>'; return; }
  tb.innerHTML = recetas.map(r=>{
    const txt = r.ingredientes.map(i=>{const m=inventario.find(x=>x.id===i.id_materia); return m?`${i.cantidad}${i.unidad||m.unidad} ${m.nombre}`:'?';}).join('<br>');
    return `<tr><td><strong>${r.nombre}</strong><br><span style="font-size:0.75rem; color:var(--caramel);">👨‍🍳 ${r.encargado}</span></td><td>Rinde: ${r.rendimiento || 1}</td><td style="font-size:.8rem">${txt}</td><td><button class="btn btn-outline btn-icon" style="margin-right:5px;" onclick="editarReceta(${r.id})">✏️</button><button class="btn btn-danger btn-icon" onclick="eliminarReceta(${r.id})">🗑️</button></td></tr>`;
  }).join('');
}

// ==========================================
// 3. PRODUCTOS / MENÚ
// ==========================================
function addFilaRecetaProducto(rItem = null) {
  const div = document.createElement('div'); div.className='fila-ingrediente';
  div.innerHTML=`<select class="proRecetaId">${recetas.map(r=>`<option value="${r.id}" ${rItem&&rItem.id_receta===r.id?'selected':''}>${r.nombre}</option>`).join('')}</select><input type="number" class="proRecetaCant" min="1" placeholder="Cant." value="${rItem?rItem.cantidad:1}"><button class="btn btn-outline btn-icon" onclick="this.parentElement.remove()">X</button>`;
  document.getElementById('listaRecetasProducto').appendChild(div);
}
function addProducto() {
  const n=document.getElementById('proNombre').value, c=document.getElementById('proCategoria').value, p=Number(document.getElementById('proPrecio').value);
  const filas = [...document.querySelectorAll('#listaRecetasProducto .fila-ingrediente')];
  if(!n || !filas.length) return alert('Falta nombre o recetas para el producto.');
  const rcts = filas.map(f=>({ id_receta: Number(f.querySelector('.proRecetaId').value), cantidad: Number(f.querySelector('.proRecetaCant').value) }));
  
  if (proEnEdicion) {
    const pr = productos.find(x=>x.id===proEnEdicion);
    if(pr) { pr.nombre=n; pr.categoria=c; pr.precio_venta=p; pr.recetas=rcts; }
  } else { productos.push({id: getNextId(productos), nombre:n, categoria:c, recetas:rcts, precio_venta:p}); }
  
  syncPro(); renderTodo(); 
  document.getElementById('proNombre').value=''; document.getElementById('proPrecio').value=''; document.getElementById('listaRecetasProducto').innerHTML='';
  proEnEdicion = null; document.getElementById('btnGuardarPro').textContent = "+ Añadir al Menú";
}
function editarProducto(id) {
  id = Number(id); const p = productos.find(x=>x.id===id); if(!p) return;
  proEnEdicion = id;
  document.getElementById('proNombre').value = p.nombre; document.getElementById('proCategoria').value = p.categoria; document.getElementById('proPrecio').value = p.precio_venta;
  document.getElementById('listaRecetasProducto').innerHTML = ''; if(p.recetas) p.recetas.forEach(rItem => addFilaRecetaProducto(rItem));
  document.getElementById('btnGuardarPro').textContent = "Actualizar Menú";
}
function eliminarProducto(id) {
  if(!confirm("¿Eliminar del menú?")) return;
  id = Number(id); productos = productos.filter(x=>x.id!==id); syncPro(); renderTodo();
}
function renderPro() {
  const tb = document.getElementById('tbodyPro');
  if(!productos.length) { tb.innerHTML='<tr><td colspan="4" class="empty">Menú vacío</td></tr>'; return; }
  tb.innerHTML = productos.map(p=>{
    const detalle = p.recetas ? p.recetas.map(rItem => { const r = recetas.find(x=>x.id===rItem.id_receta); return `${rItem.cantidad}x ${r?r.nombre:'?'}`; }).join('<br>') : '';
    return `<tr><td><strong>${p.nombre}</strong><br><span class="badge badge-gray">${p.categoria}</span></td><td style="font-size:0.8rem; color:#666;">Produce:<br>${detalle}</td><td><strong style="color:var(--sage)">$${p.precio_venta.toFixed(2)}</strong></td><td><button class="btn btn-outline btn-icon" style="margin-right:5px;" onclick="editarProducto(${p.id})">✏️</button><button class="btn btn-danger btn-icon" onclick="eliminarProducto(${p.id})">🗑️</button></td></tr>`;
  }).join('');
}

// ==========================================
// 4. VENTAS (NUEVO MOTOR DE DESGLOSE POR ESTACIÓN)
// ==========================================
function toggleAdelanto() { document.getElementById('divAdelanto').style.display = document.getElementById('ordEstadoPago').value==='Adelanto'?'flex':'none'; }
function addItemRow() {
  const div=document.createElement('div'); div.className='item-row';
  div.innerHTML=`<div class="fg"><label>Producto / Combo</label><select class="ordProd" style="padding:5px; margin-right:5px; border-radius:8px; border:1px solid var(--border);"></select></div><div class="fg"><label>Cant</label><input type="number" class="ordCant" min="1" placeholder="1" style="width:70px; padding:5px; margin-right:5px; border-radius:8px; border:1px solid var(--border);"></div><button class="btn btn-outline btn-sm btn-icon" style="align-self:flex-end" onclick="this.parentElement.remove()">✕</button>`;
  document.getElementById('ordenItems').appendChild(div);
  updateSelects();
}
function updateSelects() {
  document.querySelectorAll('.ordProd').forEach(s=>{ const v=s.value; s.innerHTML=productos.map(p=>`<option value="${p.id}" ${p.id==v?'selected':''}>${p.nombre} ($${p.precio_venta})</option>`).join(''); });
}

function agendarPedido() {
  const c=document.getElementById('ordCliente').value, cel=document.getElementById('ordCelular').value, fE=document.getElementById('ordFechaEnt').value, fP=document.getElementById('ordFechaPed').value, m=document.getElementById('ordMetodo').value, stP=document.getElementById('ordEstadoPago').value, notas=document.getElementById('ordNotas').value;
  const ad=stP==='Adelanto'?Number(document.getElementById('ordAdelanto').value):(stP==='Pagado'?-1:0);
  if(!c)return alert('Falta el nombre del cliente');
  
  const items = [...document.querySelectorAll('.item-row')].map(r=>({productoId: Number(r.querySelector('.ordProd').value), cantidad:Number(r.querySelector('.ordCant').value)}));
  if(!items.length || items.some(i=>i.cantidad<=0)) return alert('Añade productos con cantidad válida.');
  
  const pedidoId = getNextId(pedidos);
  pedidos.push({id:pedidoId, cliente:c, celular:cel, items, notas:notas, fecha_pedido:fP, fecha_entrega:fE, metodo_pago:m, estado_pago:stP, adelanto:ad, estado:ESTADOS[0]});
  
  // ¡MAGIA! Desarma los combos y genera 1 Tarea por cada RECETA
  items.forEach(it => { 
    const prod = productos.find(x => x.id === it.productoId);
    if(prod && prod.recetas) {
      prod.recetas.forEach(rItem => {
        // Multiplica la cantidad de combos por la cantidad de recetas que lleva ese combo
        const totalRecetasDeEsteTipo = it.cantidad * rItem.cantidad;
        tareas.push({
          id: getNextId(tareas), 
          pedido_id: pedidoId, 
          receta_id: rItem.id_receta, 
          cantidad_producir: totalRecetasDeEsteTipo, 
          fecha_limite: fE, 
          descripcion: `Para Combo/Prod: ${prod.nombre} | Cliente: ${c} ${notas?'| Notas: '+notas:''}`, 
          estado: 'Pendiente'
        });
      });
    }
  });

  Promise.all([syncOrd(), syncTar()]).then(()=>{ 
    document.getElementById('ordenItems').innerHTML=''; document.getElementById('ordCliente').value=''; document.getElementById('ordCelular').value=''; document.getElementById('ordNotas').value=''; document.getElementById('ordAdelanto').value='';
    renderTodo(); switchTab('historial', document.getElementById('btnTabHistorial'));
    alert('✅ Venta desglosada y enviada a las estaciones de cocina correspondientes.'); 
  });
}

function editarPedido(id) {
  id = Number(id); const ord = pedidos.find(x=>x.id===id); if(!ord) return;
  const nuevasNotas = prompt("Editar Notas del Pedido:", ord.notas);
  if(nuevasNotas !== null) {
    ord.notas = nuevasNotas;
    // Las tareas ya dicen "Para Combo... | Cliente...", no sobreescribiremos todo para no perder el contexto del combo. 
    // Por simplicidad, dejaremos que la actualización principal se quede en el Pedido.
    Promise.all([syncOrd()]).then(renderTodo);
  }
}
function eliminarPedido(id) {
  if(!confirm('¿Eliminar esta venta? Las tareas de cocina se borrarán.')) return;
  id = Number(id); tareas = tareas.filter(t => t.pedido_id !== id); pedidos = pedidos.filter(x => x.id !== id);
  Promise.all([syncOrd(), syncTar()]).then(renderTodo);
}

function checkStockFaltantePedido(orden) {
  if (orden.estado === 'Entregado' || orden.estado === 'Listo para entrega') return false;
  let reqAgregado = {};
  // Buscar todas las tareas pendientes de este pedido (que ahora son tareas directas de Recetas)
  let tareasPendientes = tareas.filter(t => t.pedido_id === orden.id && t.estado !== 'Completado');
  
  for(const t of tareasPendientes) {
    const rct = recetas.find(x=>x.id===t.receta_id); if(!rct) continue;
    rct.ingredientes.forEach(ing => {
      const mat = inventario.find(x=>x.id===ing.id_materia); if(!mat) return;
      const req = getConversion(ing.cantidad, ing.unidad||mat.unidad, mat.unidad) * (t.cantidad_producir / (rct.rendimiento || 1));
      reqAgregado[mat.id] = (reqAgregado[mat.id]||0) + req;
    });
  }
  for(const id in reqAgregado) { const mat = inventario.find(x=>x.id===Number(id)); if(mat && mat.cantidad < reqAgregado[id]) return true; }
  return false;
}

function toggleSortPedidos() {
  sortByDate = !sortByDate;
  const btn = document.getElementById('btnSortOrd');
  if(sortByDate) { btn.classList.remove('btn-outline'); btn.classList.add('btn-primary'); btn.innerHTML = '📅 Ordenado por Cercanía';
  } else { btn.classList.add('btn-outline'); btn.classList.remove('btn-primary'); btn.innerHTML = '📅 Ordenar por Fecha de Entrega'; }
  renderOrd();
}

function renderOrd() {
  const tb = document.getElementById('tbodyOrd');
  const kw = document.getElementById('filtroOrd') ? document.getElementById('filtroOrd').value.toLowerCase() : '';
  let list = pedidos.filter(o=>o.cliente.toLowerCase().includes(kw));
  if(!list.length) { tb.innerHTML='<tr><td colspan="7" class="empty">Sin registros</td></tr>'; return; }

  list.sort((a, b) => {
     if (a.estado === 'Entregado' && b.estado !== 'Entregado') return 1;
     if (a.estado !== 'Entregado' && b.estado === 'Entregado') return -1;
     if (sortByDate) return new Date(a.fecha_entrega) - new Date(b.fecha_entrega);
     return 0; 
  });

  const hoy = new Date().toISOString().split('T')[0];

  tb.innerHTML = list.map(o=>{
    let tot=0; const txt=o.items.map(it=>{const p=productos.find(x=>x.id===it.productoId); if(p)tot+=p.precio_venta*it.cantidad; return `${p?p.nombre:'?'} x${it.cantidad}`;}).join('<br>');
    const adReal = o.estado_pago==='Pagado'?tot:o.adelanto;
    const stSel = `<select style="font-family:var(--font-b); border-radius:6px; padding:4px;" onchange="const p=pedidos.find(x=>x.id===${o.id});if(p){p.estado=this.value;syncOrd();}">${ESTADOS.map(e=>`<option ${o.estado===e?'selected':''}>${e}</option>`).join('')}</select>`;
    const avisoStock = checkStockFaltantePedido(o) ? '<span style="color:var(--rose); font-weight:bold; font-size:0.75rem;">⚠️ Falta Comprar Ingredientes</span>' : '<span style="color:var(--sage); font-size:0.75rem;">✓ Ingredientes Listos</span>';
    
    let badgePrioridad = ''; if (o.estado !== 'Entregado' && o.fecha_entrega <= hoy) badgePrioridad = '<span class="badge badge-yellow" style="margin-bottom:6px;">🔥 Prioridad (Entrega)</span><br>';

    return `<tr style="${o.estado === 'Entregado' ? 'opacity: 0.6; background: #f9f9f9;' : ''}">
      <td>${badgePrioridad}<strong>${o.cliente}</strong><br><span style="font-size:0.75rem; color:#888;">${o.celular?'📱 '+o.celular+'<br>':''}${o.notas?'📝 '+o.notas:''}</span></td>
      <td style="font-size:.8rem">${txt}</td>
      <td style="font-size:.8rem">P: ${o.fecha_pedido}<br>E: <strong>${o.fecha_entrega}</strong></td>
      <td style="font-size:.8rem">Total: $${tot.toFixed(2)}<br>Falta: $${(tot-adReal).toFixed(2)}<br><span class="badge badge-gray" style="margin-top:4px; display:inline-block;">${o.estado_pago}</span><br><span style="font-size:0.75rem; color:#666;">💳 ${o.metodo_pago || 'Efectivo'}</span></td>
      <td>${stSel}</td>
      <td><button class="btn btn-outline btn-icon" style="margin-right:5px;" onclick="editarPedido(${o.id})">✏️</button><button class="btn btn-danger btn-icon" onclick="eliminarPedido(${o.id})">🗑️</button></td>
      <td>${avisoStock}</td>
    </tr>`;
  }).join('');
}

// ==========================================
// 5. COCINA (TAREAS DIRECTAS POR RECETA)
// ==========================================
function updateFiltroCocina() {
  const sel = document.getElementById('filtroCocinaEncargado');
  const valAct = sel.value;
  const encargados = [...new Set(recetas.map(r => r.encargado).filter(e => e))].sort();
  sel.innerHTML = `<option value="Todos">Todas las estaciones</option>` + encargados.map(e => `<option value="${e}" ${valAct===e?'selected':''}>${e}</option>`).join('');
}

function cambiarEstadoTar(id, st) { 
  id = Number(id); const t = tareas.find(x=>x.id===id); if(!t)return; 
  let promises = [];

  if(st === 'Completado' && t.estado !== 'Completado') {
    const rct = recetas.find(x=>x.id===t.receta_id);
    if(!rct) return alert('Error: Receta no encontrada.');

    let reqAgregado = {};
    rct.ingredientes.forEach(ing => {
      const mat = inventario.find(x=>x.id===ing.id_materia); if(!mat) return;
      const amt = getConversion(ing.cantidad, ing.unidad||mat.unidad, mat.unidad) * (t.cantidad_producir / (rct.rendimiento || 1));
      reqAgregado[mat.id] = (reqAgregado[mat.id]||0) + amt;
    });

    let falta = false; let msgFalta = [];
    for(const mId in reqAgregado) {
       const mat = inventario.find(x=>x.id===Number(mId));
       if(mat && mat.cantidad < reqAgregado[mId]) { falta=true; msgFalta.push(mat.nombre); }
    }

    if(falta) { renderTar(); return alert('❌ IMPOSIBLE COCINAR: Faltan ingredientes en bodega para esta estación:\n' + msgFalta.join(', ')); }

    for(const mId in reqAgregado) {
       const mat = inventario.find(x=>x.id===Number(mId));
       mat.cantidad -= reqAgregado[mId];
    }

    t.estado = 'Completado';
    promises.push(syncInv());

  } else {
    t.estado = st; 
  }

  // AUTOMATIZACIÓN DE LA VENTA
  if (st === 'En progreso' && t.pedido_id) {
    const ord = pedidos.find(o => o.id === t.pedido_id);
    if (ord && ord.estado !== 'Realizando' && ord.estado !== 'Entregado') {
      ord.estado = 'Realizando';
      promises.push(syncOrd());
    }
  }
  
  if (st === 'Completado' && t.pedido_id) {
    const parentOrder = pedidos.find(o => o.id === t.pedido_id);
    if (parentOrder && parentOrder.estado !== 'Entregado' && parentOrder.estado !== 'Listo para entrega') {
      const orderTasks = tareas.filter(x => x.pedido_id === t.pedido_id);
      const allCompleted = orderTasks.every(x => x.estado === 'Completado');
      if (allCompleted) {
        parentOrder.estado = 'Listo para entrega'; // Solo se marca listo si TODO el combo (todas sus recetas) se terminaron
        promises.push(syncOrd());
      }
    }
  }

  promises.push(syncTar());
  Promise.all(promises).then(renderTodo); 
}

function renderTar() {
  const filtroVal = document.getElementById('filtroCocinaEncargado').value;
  
  // Filtrar tareas por el Empleado/Encargado que las tiene que hacer
  let tareasFiltradas = tareas;
  if(filtroVal !== 'Todos') {
      tareasFiltradas = tareas.filter(t => {
          const r = recetas.find(x => x.id === t.receta_id);
          return r && r.encargado === filtroVal;
      });
  }

  const resumenContainer = document.getElementById('resumenCocina');
  const pendientes = tareasFiltradas.filter(t => t.estado === 'Pendiente');
  
  // EL RESUMEN ES AHORA DIRECTAMENTE POR RECETA_ID
  if(pendientes.length === 0) {
      resumenContainer.innerHTML = `<strong style="color:#9c7a60;">Resumen a preparar (${filtroVal}):</strong> <span style="color:#888;">Estación libre de tareas.</span>`;
  } else {
      const totalesRecetas = {};
      pendientes.forEach(t => {
          if(!totalesRecetas[t.receta_id]) totalesRecetas[t.receta_id] = 0;
          totalesRecetas[t.receta_id] += t.cantidad_producir;
      });
      const htmlItems = Object.keys(totalesRecetas).map(rId => {
          const rct = recetas.find(x => x.id === Number(rId));
          return `<div style="display:inline-block; background:white; border:1px solid var(--caramel); padding:6px 12px; border-radius:8px; margin:4px 8px 4px 0;"><strong style="color:var(--rose); font-size:1.1rem;">${totalesRecetas[rId]}x</strong> ${rct ? rct.nombre : '?'}</div>`;
      });
      resumenContainer.innerHTML = `<strong style="display:block; margin-bottom:10px; color:var(--brown);">Resumen Total de Estación (${filtroVal}):</strong>` + htmlItems.join('');
  }

  const tb = document.getElementById('tbodyTar');
  if(!tareasFiltradas.length) { tb.innerHTML='<tr><td colspan="4" class="empty">No hay tareas para mostrar en esta estación</td></tr>'; return; }
  
  const sorted = [...tareasFiltradas].sort((a,b)=> {
      if(a.estado === 'Completado' && b.estado !== 'Completado') return 1;
      if(a.estado !== 'Completado' && b.estado === 'Completado') return -1;
      return new Date(a.fecha_limite) - new Date(b.fecha_limite);
  });
  
  tb.innerHTML = sorted.map(t=>{
    const rct = recetas.find(x=>x.id===t.receta_id);
    
    let alertasHtml = '';
    if (t.estado !== 'Completado') {
      if(!rct) { alertasHtml = '<br><span style="color:red;font-size:.75rem;">⚠️ Receta borrada</span>'; } 
      else {
        let reqAgregado = {};
        rct.ingredientes.forEach(ing => {
          const mat = inventario.find(x=>x.id===ing.id_materia); if(!mat) return;
          const amt = getConversion(ing.cantidad, ing.unidad||mat.unidad, mat.unidad) * (t.cantidad_producir / (rct.rendimiento || 1));
          reqAgregado[mat.id] = (reqAgregado[mat.id]||0) + amt;
        });

        let faltantes = [];
        for(const mId in reqAgregado) {
           const mat = inventario.find(x=>x.id===Number(mId));
           if(mat && mat.cantidad < reqAgregado[mId]) faltantes.push(`${mat.nombre} (Falta ${(reqAgregado[mId] - mat.cantidad).toFixed(2)}${mat.unidad})`);
        }

        if (faltantes.length > 0) {
          alertasHtml = `<br><div style="background:#ffebeb; color:var(--rose); padding:6px; border-radius:6px; font-size:.75rem; margin-top:5px;"><strong>Falta comprar:</strong><br>- ${faltantes.join('<br>- ')}</div>`;
        } else {
          alertasHtml = `<br><div style="background:#e6f4ea; color:#1e8e3e; padding:6px; border-radius:6px; font-size:.75rem; margin-top:5px;"><strong>🟢 Stock Listo</strong></div>`;
        }
      }
    } else {
      alertasHtml = `<br><span style="color:gray;font-size:.75rem;">✓ Ingredientes descontados</span>`;
    }

    const sel = `<select style="font-family:var(--font-b); border-radius:6px; padding:4px;" onchange="cambiarEstadoTar(${t.id},this.value)" ${t.estado==='Completado'?'disabled':''}>${ESTADOS_TAR.map(e=>`<option ${t.estado===e?'selected':''}>${e}</option>`).join('')}</select>`;
    
    return `<tr style="${t.estado === 'Completado' ? 'opacity: 0.5; background: #f9f9f9;' : ''}">
      <td style="vertical-align:top; width: 35%;">
        <strong style="font-size: 1.4rem; color: var(--rose); margin-right: 5px;">${t.cantidad_producir}x</strong><strong style="font-size: 1.1rem;">${rct?rct.nombre:'?'}</strong>
        ${alertasHtml}
      </td>
      <td style="vertical-align:top;">${t.fecha_limite}<br><span style="font-size:0.75rem; color:#666;">${t.descripcion}</span></td>
      <td style="vertical-align:top;">👨‍🍳 ${rct?rct.encargado:'?'}</td>
      <td style="vertical-align:top;">${sel}</td>
    </tr>`;
  }).join('');
}

function switchTab(name,btn){
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active'); btn.classList.add('active');
}
