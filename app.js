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
let recetaEnEdicion = null; 
const ESTADOS = ['Agendado','Realizando','Listo para entrega','Entregado'];
const ESTADOS_TAR = ['Pendiente','En progreso','Completado'];
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

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
    
    inventario = (data.inventario||[]).map(x=>({...x, cantidad:Number(x.cantidad)}));
    recetas = (data.recetas||[]).map(x=>({...x, rendimiento:Number(x.rendimiento)||1, ingredientes:JSON.parse(x.ingredientes||'[]')}));
    productos = (data.productos||[]).map(x=>({...x, precio_venta:Number(x.precio_venta)}));
    tareas = (data.tareas||[]).map(x=>({...x, cantidad_producir:Number(x.cantidad_producir)}));
    pedidos = (data.pedidos||[]).map(x=>({...x, items:JSON.parse(x.items||'[]'), adelanto:Number(x.adelanto), notas:x.notas||''}));

    document.getElementById('userName').textContent = email.split('@')[0];
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    setSyncing(false, 'Sincronizado ✓');
    renderTodo();
    document.getElementById('ordFechaPed').value = new Date().toISOString().split('T')[0];
    document.getElementById('ordFechaEnt').value = new Date().toISOString().split('T')[0];
  });
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
  inventario.forEach(m => { if(m.cantidad < 5) alertas.push(`Materia prima baja: ${m.nombre} (${m.cantidad.toFixed(2)} ${m.unidad})`); });
  document.getElementById('alertasGlobales').innerHTML = alertas.length ? `<div class="alert-box"><strong>⚠️ Alertas de Bodega:</strong><br>${alertas.join('<br>')}</div>` : '';
}

function getConversion(cant, uReceta, uInv) {
  if(!uReceta || uReceta === uInv) return cant;
  if(uReceta==='g' && uInv==='kg') return cant/1000;
  if(uReceta==='kg' && uInv==='g') return cant*1000;
  if(uReceta==='ml' && uInv==='L') return cant/1000;
  if(uReceta==='L' && uInv==='ml') return cant*1000;
  return cant;
}

// 1. MATERIA PRIMA
function addMateriaPrima() {
  const n=document.getElementById('invNombre').value, c=document.getElementById('invCategoria').value, u=document.getElementById('invUnidad').value, q=Number(document.getElementById('invCantidad').value);
  if(!n) return;
  inventario.push({id:genId(), nombre:n, categoria:c, unidad:u, cantidad:q});
  syncInv(); renderTodo();
}
function renderInv() {
  const tb = document.getElementById('tbodyInv');
  if(!inventario.length) { tb.innerHTML='<tr><td colspan="4" class="empty">Sin ingredientes</td></tr>'; return; }
  tb.innerHTML = inventario.map(m=>`<tr><td><strong>${m.nombre}</strong></td><td><span class="badge badge-gray">${m.categoria}</span></td><td style="${m.cantidad<5?'color:red;font-weight:bold':''}">${m.cantidad.toFixed(2)} ${m.unidad}</td><td><button class="btn btn-danger btn-icon" onclick="inventario=inventario.filter(x=>x.id!=='${m.id}');syncInv();renderTodo();">🗑️</button></td></tr>`).join('');
}

// 2. RECETAS
function addFilaIngrediente(ingData = null) {
  const div = document.createElement('div'); div.className='fila-ingrediente';
  div.innerHTML=`<select class="rctMateria">${inventario.map(m=>`<option value="${m.id}" ${ingData&&ingData.id_materia===m.id?'selected':''}>${m.nombre} (Bodega: ${m.cantidad.toFixed(2)}${m.unidad})</option>`).join('')}</select><input type="number" step="0.01" class="rctCant" placeholder="Cant." value="${ingData?ingData.cantidad:''}"><select class="rctUnidad"><option value="g" ${ingData&&ingData.unidad==='g'?'selected':''}>g</option><option value="kg" ${ingData&&ingData.unidad==='kg'?'selected':''}>kg</option><option value="ml" ${ingData&&ingData.unidad==='ml'?'selected':''}>ml</option><option value="L" ${ingData&&ingData.unidad==='L'?'selected':''}>L</option><option value="unidades" ${ingData&&ingData.unidad==='unidades'?'selected':''}>uds</option></select><button class="btn btn-outline btn-icon" onclick="this.parentElement.remove()">X</button>`;
  document.getElementById('listaIngredientesReceta').appendChild(div);
}

function guardarReceta() {
  const nom = document.getElementById('rctNombre').value, rend = Number(document.getElementById('rctRendimiento').value) || 1;
  const filas = [...document.querySelectorAll('.fila-ingrediente')];
  if(!nom || !filas.length) return alert('Falta nombre o ingredientes.');

  const ings = filas.map(f=>({ id_materia: f.querySelector('.rctMateria').value, cantidad: Number(f.querySelector('.rctCant').value), unidad: f.querySelector('.rctUnidad').value }));

  if(recetaEnEdicion) recetas = recetas.filter(r=>r.id!==recetaEnEdicion);
  recetas.push({id: recetaEnEdicion || genId(), nombre:nom, rendimiento:rend, ingredientes:ings});

  document.getElementById('rctNombre').value=''; document.getElementById('rctRendimiento').value='1'; document.getElementById('listaIngredientesReceta').innerHTML='';
  recetaEnEdicion = null; document.getElementById('btnGuardarReceta').textContent = "Guardar Receta";
  syncRct().then(renderTodo);
}

function editarReceta(id) {
  const r = recetas.find(x=>x.id===id); if(!r) return;
  recetaEnEdicion = id; document.getElementById('rctNombre').value = r.nombre; document.getElementById('rctRendimiento').value = r.rendimiento || 1;
  document.getElementById('listaIngredientesReceta').innerHTML = ''; r.ingredientes.forEach(ing => addFilaIngrediente(ing));
  document.getElementById('btnGuardarReceta').textContent = "Actualizar Receta";
}
function eliminarReceta(id) {
  if(!confirm("¿Eliminar receta de la base de datos?")) return;
  recetas = recetas.filter(x=>x.id!==id); syncRct().then(renderTodo);
}

function renderRct() {
  const tb = document.getElementById('tbodyRct');
  if(!recetas.length) { tb.innerHTML='<tr><td colspan="4" class="empty">Sin recetas</td></tr>'; return; }
  tb.innerHTML = recetas.map(r=>{
    const txt = r.ingredientes.map(i=>{const m=inventario.find(x=>x.id===i.id_materia); return m?`${i.cantidad}${i.unidad||m.unidad} ${m.nombre}`:'?';}).join('<br>');
    return `<tr><td><strong>${r.nombre}</strong></td><td>Rinde: ${r.rendimiento || 1} uds</td><td style="font-size:.8rem">${txt}</td><td><button class="btn btn-outline btn-icon" style="margin-right:5px;" onclick="editarReceta('${r.id}')">✏️</button><button class="btn btn-danger btn-icon" onclick="eliminarReceta('${r.id}')">🗑️</button></td></tr>`;
  }).join('');
}

// 3. PRODUCTOS (MENÚ)
function addProducto() {
  const n=document.getElementById('proNombre').value, c=document.getElementById('proCategoria').value, r=document.getElementById('proReceta').value, p=Number(document.getElementById('proPrecio').value);
  if(!n||!r)return;
  productos.push({id:genId(), nombre:n, categoria:c, id_receta:r, precio_venta:p});
  syncPro(); renderTodo();
}
function renderPro() {
  const tb = document.getElementById('tbodyPro');
  if(!productos.length) { tb.innerHTML='<tr><td colspan="4" class="empty">Menú vacío</td></tr>'; return; }
  tb.innerHTML = productos.map(p=>`<tr><td><strong>${p.nombre}</strong></td><td><span class="badge badge-gray">${p.categoria}</span></td><td><strong style="color:var(--sage)">$${p.precio_venta.toFixed(2)}</strong></td><td><button class="btn btn-danger btn-icon" onclick="productos=productos.filter(x=>x.id!=='${p.id}');syncPro();renderTodo();">🗑️</button></td></tr>`).join('');
}

// 4. VENTAS
function toggleAdelanto() { document.getElementById('divAdelanto').style.display = document.getElementById('ordEstadoPago').value==='Adelanto'?'block':'none'; }
function addItemRow() {
  const div=document.createElement('div'); div.className='item-row';
  div.innerHTML=`<select class="ordProd" style="padding:5px; margin-right:5px; border-radius:8px; border:1px solid var(--border);">${productos.map(p=>`<option value="${p.id}">${p.nombre} ($${p.precio_venta})</option>`).join('')}</select><input type="number" class="ordCant" min="1" placeholder="Cant" style="width:70px; padding:5px; margin-right:5px; border-radius:8px; border:1px solid var(--border);"><button class="btn btn-outline btn-icon" onclick="this.parentElement.remove()">X</button>`;
  document.getElementById('ordenItems').appendChild(div);
}
function updateSelects() {
  const rSel=document.getElementById('proReceta'); if(rSel) rSel.innerHTML=recetas.map(r=>`<option value="${r.id}">${r.nombre}</option>`).join('');
  document.querySelectorAll('.ordProd').forEach(s=>{ const v=s.value; s.innerHTML=productos.map(p=>`<option value="${p.id}" ${p.id===v?'selected':''}>${p.nombre}</option>`).join(''); });
}

function agendarPedido() {
  const c=document.getElementById('ordCliente').value, fE=document.getElementById('ordFechaEnt').value, fP=document.getElementById('ordFechaPed').value, m=document.getElementById('ordMetodo').value, stP=document.getElementById('ordEstadoPago').value, notas=document.getElementById('ordNotas').value;
  const ad=stP==='Adelanto'?Number(document.getElementById('ordAdelanto').value):(stP==='Pagado'?-1:0);
  if(!c)return alert('Falta el nombre del cliente');
  
  const items = [...document.querySelectorAll('.item-row')].map(r=>({productoId:r.querySelector('.ordProd').value, cantidad:Number(r.querySelector('.ordCant').value)}));
  if(!items.length || items.some(i=>i.cantidad<=0)) return alert('Ingresa cantidades válidas.');
  
  // YA NO DESCONTAMOS INVENTARIO AQUÍ. LO DEJAMOS PASAR DIRECTO A LA COCINA.
  const pedidoId = genId();
  pedidos.push({id:pedidoId, cliente:c, items, notas:notas, fecha_pedido:fP, fecha_entrega:fE, metodo_pago:m, estado_pago:stP, adelanto:ad, estado:ESTADOS[0]});
  
  items.forEach(it => { 
    tareas.push({id:genId(), producto_id:it.productoId, pedido_id:pedidoId, cantidad_producir:it.cantidad, fecha_limite:fE, descripcion:`Venta de: ${c}${notas?' | Notas: '+notas:''}`, estado:'Pendiente'}); 
  });

  Promise.all([syncOrd(), syncTar()]).then(()=>{ 
    document.getElementById('ordenItems').innerHTML=''; addItemRow(); document.getElementById('ordCliente').value=''; document.getElementById('ordNotas').value=''; document.getElementById('ordAdelanto').value='';
    renderTodo(); alert('✅ Venta guardada con éxito. Revisar alertas de stock en la pestaña de Cocina.'); 
  });
}

function editarPedido(id) {
  const ord = pedidos.find(x=>x.id===id); if(!ord) return;
  const nuevasNotas = prompt("Editar Notas del Pedido (Ej. Alergias, empaque especial):", ord.notas);
  if(nuevasNotas !== null) {
    ord.notas = nuevasNotas;
    tareas.forEach(t => { if(t.pedido_id === id) t.descripcion = `Venta de: ${ord.cliente}${ord.notas?' | Notas: '+ord.notas:''}`; });
    Promise.all([syncOrd(), syncTar()]).then(renderTodo);
  }
}

function eliminarPedido(id) {
  if(!confirm('¿Eliminar esta venta? Las órdenes de cocina que no estén completadas se borrarán.')) return;
  // Solo borramos las tareas asociadas a esta venta
  tareas = tareas.filter(t => t.pedido_id !== id);
  pedidos = pedidos.filter(x => x.id !== id);
  Promise.all([syncOrd(), syncTar()]).then(()=>{ renderTodo(); });
}

function renderOrd() {
  const tb = document.getElementById('tbodyOrd');
  if(!pedidos.length) { tb.innerHTML='<tr><td colspan="6" class="empty">Sin ventas registradas</td></tr>'; return; }
  tb.innerHTML = pedidos.map(o=>{
    let tot=0; const txt=o.items.map(it=>{const p=productos.find(x=>x.id===it.productoId); if(p)tot+=p.precio_venta*it.cantidad; return `${p?p.nombre:'?'} x${it.cantidad}`;}).join('<br>');
    const adReal = o.estado_pago==='Pagado'?tot:o.adelanto;
    const stSel = `<select style="font-family:var(--font-b); border-radius:6px; padding:4px;" onchange="const p=pedidos.find(x=>x.id==='${o.id}');if(p){p.estado=this.value;syncOrd();}">${ESTADOS.map(e=>`<option ${o.estado===e?'selected':''}>${e}</option>`).join('')}</select>`;
    return `<tr>
      <td><strong>${o.cliente}</strong><br><span style="font-size:0.75rem; color:#888;">${o.notas?'Notas: '+o.notas:''}</span></td>
      <td style="font-size:.8rem">${txt}</td>
      <td style="font-size:.8rem">P: ${o.fecha_pedido}<br>E: ${o.fecha_entrega}</td>
      <td style="font-size:.8rem">Total: $${tot.toFixed(2)}<br>Falta: $${(tot-adReal).toFixed(2)}<br><span class="badge badge-gray">${o.estado_pago}</span></td>
      <td>${stSel}</td>
      <td><button class="btn btn-outline btn-icon" style="margin-right:5px;" onclick="editarPedido('${o.id}')">✏️</button><button class="btn btn-danger btn-icon" onclick="eliminarPedido('${o.id}')">🗑️</button></td>
    </tr>`;
  }).join('');
}

// 5. COCINA Y ANÁLISIS DE STOCK
function cambiarEstadoTar(id, st) { 
  const t = tareas.find(x=>x.id===id); if(!t)return; 
  
  if(st === 'Completado' && t.estado !== 'Completado') {
    const p = productos.find(x=>x.id===t.producto_id);
    const rct = recetas.find(x=>x.id===p?.id_receta);
    if(!rct) return alert('No se puede completar: Producto sin receta.');

    // Verificar si hay stock real antes de dejarlo completar
    let falta = false; let msgFalta = [];
    rct.ingredientes.forEach(ing => {
      const mat = inventario.find(x=>x.id===ing.id_materia);
      if(!mat) {falta = true; return;}
      const req = getConversion(ing.cantidad, ing.unidad||mat.unidad, mat.unidad) * (t.cantidad_producir / (rct.rendimiento || 1));
      if(mat.cantidad < req) { falta = true; msgFalta.push(mat.nombre); }
    });

    if(falta) {
      renderTodo(); // Reinicia el select visualmente
      return alert('❌ IMPOSIBLE COCINAR: Te faltan ingredientes en bodega:\n' + msgFalta.join(', '));
    }

    // SI TIENE STOCK, se descuenta de verdad de la bodega
    rct.ingredientes.forEach(ing => {
      const mat = inventario.find(x=>x.id===ing.id_materia);
      const req = getConversion(ing.cantidad, ing.unidad||mat.unidad, mat.unidad) * (t.cantidad_producir / (rct.rendimiento || 1));
      mat.cantidad -= req;
    });

    t.estado = 'Completado';
    Promise.all([syncTar(), syncInv()]).then(renderTodo);

  } else {
    t.estado = st; 
    syncTar().then(renderTodo); 
  }
}

function renderTar() {
  const tb = document.getElementById('tbodyTar');
  if(!tareas.length) { tb.innerHTML='<tr><td colspan="4" class="empty">Cocina libre de tareas</td></tr>'; return; }
  const sorted = [...tareas].sort((a,b)=>new Date(a.fecha_limite) - new Date(b.fecha_limite));
  
  tb.innerHTML = sorted.map(t=>{
    const p=productos.find(x=>x.id===t.producto_id);
    const rct=recetas.find(x=>x.id===p?.id_receta);
    
    // ANÁLISIS DE STOCK EN TIEMPO REAL
    let alertasHtml = '';
    if (t.estado !== 'Completado') {
      if(!rct) {
        alertasHtml = '<br><span style="color:red;font-size:.75rem;">⚠️ Producto sin receta vinculada</span>';
      } else {
        let faltantes = [];
        rct.ingredientes.forEach(ing => {
          const mat = inventario.find(x=>x.id===ing.id_materia);
          if(!mat) { faltantes.push('Ingrediente borrado'); return; }
          const req = getConversion(ing.cantidad, ing.unidad||mat.unidad, mat.unidad) * (t.cantidad_producir / (rct.rendimiento || 1));
          if (mat.cantidad < req) { faltantes.push(`${mat.nombre} (Falta ${(req - mat.cantidad).toFixed(2)}${mat.unidad})`); }
        });
        
        if (faltantes.length > 0) {
          alertasHtml = `<br><div style="background:#ffebeb; color:var(--rose); padding:6px; border-radius:6px; font-size:.75rem; margin-top:5px; line-height: 1.4;"><strong>Falta comprar:</strong><br>- ${faltantes.join('<br>- ')}</div>`;
        } else {
          alertasHtml = `<br><div style="background:#e6f4ea; color:#1e8e3e; padding:6px; border-radius:6px; font-size:.75rem; margin-top:5px;"><strong>🟢 Stock Listo para cocinar</strong></div>`;
        }
      }
    } else {
      alertasHtml = `<br><span style="color:gray;font-size:.75rem;">✓ Ingredientes ya descontados</span>`;
    }

    const sel = `<select style="font-family:var(--font-b); border-radius:6px; padding:4px;" onchange="cambiarEstadoTar('${t.id}',this.value)" ${t.estado==='Completado'?'disabled':''}>${ESTADOS_TAR.map(e=>`<option ${t.estado===e?'selected':''}>${e}</option>`).join('')}</select>`;
    
    return `<tr>
      <td style="vertical-align:top; width: 35%;">
        <strong style="font-size: 1.4rem; color: var(--rose); margin-right: 5px;">${t.cantidad_producir}x</strong><strong style="font-size: 1.1rem;">${p?p.nombre:'?'}</strong>
        ${alertasHtml}
      </td>
      <td style="vertical-align:top;">${t.fecha_limite}</td>
      <td style="vertical-align:top; font-size:0.85rem;">${t.descripcion}</td>
      <td style="vertical-align:top;">${sel}</td>
    </tr>`;
  }).join('');
}

function switchTab(name,btn){
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active'); btn.classList.add('active');
}
