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

let currentUser = null;
let inventario  = [];
let pedidos     = [];
let tareas = [];
const ESTADOS_TAR = ['Pendiente', 'En progreso', 'Completado'];
const ESTADOS   = ['Agendado','Realizando','Listo para entrega','Entregado'];
const genId     = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

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
// 4. LÓGICA DE LOGIN Y CONEXIÓN
// ==========================================
function iniciarSesion() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const msgDiv = document.getElementById('loginMsg');
  
  if(!email || !pass) {
    msgDiv.textContent = '⚠️ Ingresa tu correo y contraseña.';
    msgDiv.style.color = 'var(--rose)';
    return;
  }
  msgDiv.textContent = '⏳ Verificando credenciales...';
  msgDiv.style.color = '#9c7a60';

  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => auth.signInWithEmailAndPassword(email, pass))
    .then((userCredential) => {
      msgDiv.textContent = '✅ Acceso concedido. Cargando base de datos...';
    })
    .catch((error) => {
      console.error(error);
      msgDiv.style.color = 'var(--rose)';
      msgDiv.textContent = '⛔ Correo o contraseña incorrectos.';
    });
}

function apiCall(action, payload={}) {
  const requestBody = JSON.stringify({ action: action, email: payload.email || (currentUser ? currentUser.email : ''), payload: payload });
  return fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: requestBody }).then(r => r.json());
}

function cargarDatosDesdeSheets(emailValidado) {
  apiCall('getAll', { email: emailValidado })
    .then(data => {
      if (data.error) {
        document.getElementById('loginMsg').textContent = '⛔ Tu usuario no tiene permisos en la base de datos.';
        document.getElementById('loginMsg').style.color = 'var(--rose)';
        auth.signOut();
        return;
      }
      
      currentUser = { email: emailValidado, rol: data.rol };
      inventario  = parseInv(data.inventario || []);
      pedidos     = parseOrd(data.pedidos || []);
      tareas      = parseTar(data.tareas || []); // Cargar Tareas

      document.getElementById('userName').textContent = emailValidado.split('@')[0];
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('app').style.display = 'block';

      setSyncing(false, 'Sincronizado con Google Sheets ✓');
      applyRol(); 
      renderTablaInv(); 
      renderTablaOrd(); 
      renderTablaTar();
      
      // Fechas por defecto hoy
      const hoy = new Date().toISOString().split('T')[0];
      document.getElementById('ordFechaPed').value = hoy;
      document.getElementById('ordFechaEnt').value = hoy;
      document.getElementById('tarFecha').value = hoy;
    })
    .catch((err) => {
      console.error(err);
      document.getElementById('loginMsg').textContent = '⚠️ Error conectando a la base de datos.';
      document.getElementById('loginMsg').style.color = 'var(--rose)';
    });
}

function logout() {
  auth.signOut().then(() => {
    currentUser = null; inventario = []; pedidos = []; tareas = [];
    document.getElementById('loginEmail').value = ''; document.getElementById('loginPass').value = ''; document.getElementById('loginMsg').textContent = '';
  });
}

// ==========================================
// 5. LÓGICA VISUAL Y DE CRUD
// ==========================================
function setSyncing(active, msg='', err=false) {
  document.getElementById('syncDot').className = 'sync-dot'+(active?' syncing':err?' error':'');
  document.getElementById('syncMsg').textContent = msg||(active?'Sincronizando…':'Sincronizado');
}
function syncInv() {
  setSyncing(true,'Guardando materia prima…');
  return apiCall('saveInventario',{data:inventario}).then(d=>setSyncing(false,d.ok?'Guardado ✓':'Error',!d.ok)).catch(()=>setSyncing(false,'Error',true));
}
function syncOrd() {
  setSyncing(true,'Guardando pedidos…');
  return apiCall('savePedidos',{data:pedidos}).then(d=>setSyncing(false,d.ok?'Guardado ✓':'Error',!d.ok)).catch(()=>setSyncing(false,'Error',true));
}
function syncTar() {
  setSyncing(true,'Guardando tareas…');
  return apiCall('saveTareas',{data:tareas}).then(d=>setSyncing(false,d.ok?'Guardado ✓':'Error',!d.ok)).catch(()=>setSyncing(false,'Error',true));
}

function applyRol() {
  const isAdmin = currentUser?.rol === 'admin';
  document.getElementById('formCardInv').style.display = isAdmin ? '' : 'none';
  document.getElementById('thDel').style.display       = isAdmin ? '' : 'none';
  document.getElementById('rolBannerInv').innerHTML    = isAdmin ? '' : '<div class="alert alert-warning">👁️ Modo empleado — vista de solo lectura en materia prima.</div>';
}

// PARSERS
function parseInv(rows) { return rows.map(r=>({id:String(r.id||genId()),nombre:String(r.nombre||''),categoria:String(r.categoria||''),cantidad:Number(r.cantidad||0),costo:Number(r.costo||0),precio:Number(r.precio||0)})); }
function parseTar(rows) { return rows.map(r=>({id:String(r.id||genId()),descripcion:String(r.descripcion||''),fecha_limite:String(r.fecha_limite||''),estado:String(r.estado||'Pendiente'),timestamp:String(r.timestamp||'')})); }
function parseOrd(rows) { 
  return rows.map(r=>{ 
    let items=[]; try{items=typeof r.items==='string'?JSON.parse(r.items):(r.items||[]);}catch{} 
    return{
      id:String(r.id||genId()), cliente:String(r.cliente||''), items, 
      fecha_pedido:String(r.fecha_pedido||''), fecha_entrega:String(r.fecha_entrega||''),
      metodo_pago:String(r.metodo_pago||''), estado_pago:String(r.estado_pago||''),
      adelanto:Number(r.adelanto||0), estado:String(r.estado||ESTADOS[0]), timestamp:String(r.timestamp||'')
    }; 
  }); 
}

// MATERIA PRIMA
function addProducto() {
  if (currentUser?.rol!=='admin'){alert('Solo administrador.');return;}
  const n=document.getElementById('invNombre').value.trim(), c=document.getElementById('invCategoria').value.trim(), q=Number(document.getElementById('invCantidad').value), cost=Number(document.getElementById('invCosto').value), price=Number(document.getElementById('invPrecio').value);
  if(!n||isNaN(q)||q<0||isNaN(cost)){alert('Completa los campos.');return;}
  inventario.push({id:genId(),nombre:n,categoria:c,cantidad:q,costo:cost,precio:price});
  ['invNombre','invCategoria','invCantidad','invCosto','invPrecio'].forEach(id=>document.getElementById(id).value='');
  syncInv(); renderTablaInv();
}
function deleteProducto(id) {
  if(currentUser?.rol!=='admin')return; if(!confirm('¿Eliminar registro?'))return;
  inventario=inventario.filter(p=>p.id!==id); syncInv(); renderTablaInv();
}
function renderTablaInv() {
  const kw=document.getElementById('filtroInv').value.toLowerCase(), list=inventario.filter(p=>(p.nombre+p.categoria).toLowerCase().includes(kw)), isAdmin=currentUser?.rol==='admin', tb=document.getElementById('tbodyInv');
  if(!list.length){ tb.innerHTML=`<tr><td colspan="8"><div class="empty">Sin registros</div></td></tr>`; document.getElementById('totalInv').textContent='$0.00';return; }
  let tot=0; tb.innerHTML=list.map((p,i)=>{ const t=p.costo*p.cantidad;tot+=t;const low=p.cantidad<=2; return`<tr><td>${i+1}</td><td><strong>${p.nombre}</strong></td><td><span class="badge badge-gray">${p.categoria}</span></td><td>${low?`<span class="badge badge-yellow">${p.cantidad} ⚠️</span>`:p.cantidad}</td><td>$${p.costo.toFixed(2)}</td><td>$${p.precio.toFixed(2)}</td><td>$${t.toFixed(2)}</td><td>${isAdmin?`<button class="btn btn-danger btn-sm btn-icon" onclick="deleteProducto('${p.id}')">🗑️</button>`:'—'}</td></tr>`; }).join('');
  document.getElementById('totalInv').textContent=`$${tot.toFixed(2)}`; updateSelects();
}

// TAREAS (TO-DO LIST)
function addTarea() {
  const desc=document.getElementById('tarDesc').value.trim(), fecha=document.getElementById('tarFecha').value;
  if(!desc||!fecha){alert('Completa la descripción y fecha.');return;}
  tareas.push({id:genId(),descripcion:desc,fecha_limite:fecha,estado:'Pendiente',timestamp:new Date().toISOString()});
  document.getElementById('tarDesc').value=''; syncTar(); renderTablaTar();
}
function deleteTarea(id) { if(!confirm('¿Borrar tarea?'))return; tareas=tareas.filter(t=>t.id!==id); syncTar(); renderTablaTar(); }
function cambiarEstadoTar(id, estado) { const t=tareas.find(x=>x.id===id); if(t){t.estado=estado; syncTar(); renderTablaTar();} }
function renderTablaTar() {
  const tb=document.getElementById('tbodyTar');
  if(!tareas.length){ tb.innerHTML=`<tr><td colspan="5"><div class="empty">¡Todo al día! Sin tareas pendientes</div></td></tr>`; return; }
  // Ordenar por fecha
  const list = [...tareas].sort((a,b) => new Date(a.fecha_limite) - new Date(b.fecha_limite));
  tb.innerHTML=list.map((t,i)=>{ 
    const isLate = new Date(t.fecha_limite) < new Date() && t.estado !== 'Completado';
    const opts = ESTADOS_TAR.map(e=>`<option value="${e}" ${e===t.estado?'selected':''}>${e}</option>`).join('');
    return`<tr><td>${i+1}</td><td><strong style="${t.estado==='Completado'?'text-decoration:line-through;color:#999':''}">${t.descripcion}</strong></td><td>${isLate?'⚠️ ':''}${t.fecha_limite}</td><td><select style="font-size:.8rem;padding:.2rem;border-radius:4px" onchange="cambiarEstadoTar('${t.id}',this.value)">${opts}</select></td><td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteTarea('${t.id}')">🗑️</button></td></tr>`; 
  }).join('');
}

// PEDIDOS Y FINANZAS
function toggleAdelanto() {
  const estado = document.getElementById('ordEstadoPago').value;
  document.getElementById('divAdelanto').style.display = (estado === 'Adelanto') ? 'flex' : 'none';
}
function addItemRow() {
  const div=document.createElement('div'); div.className='item-row';
  div.innerHTML=`<div class="fg"><label>Producto</label><select class="ordenProducto">${inventario.map(p=>`<option value="${p.id}">${p.nombre} ($${p.precio})</option>`).join('')}</select></div><div class="fg"><label>Cantidad</label><input type="number" class="ordenCantidad" min="1" placeholder="1"></div><button class="btn btn-outline btn-sm btn-icon" style="align-self:flex-end" onclick="this.closest('.item-row').remove()">✕</button>`;
  document.getElementById('ordenItems').appendChild(div);
}
function updateSelects() { document.querySelectorAll('.ordenProducto').forEach(sel=>{ const v=sel.value; sel.innerHTML=inventario.map(p=>`<option value="${p.id}" ${p.id===v?'selected':''}>${p.nombre} ($${p.precio})</option>`).join(''); }); }

function agendarPedido() {
  const cliente = document.getElementById('ordCliente').value.trim();
  const fPed = document.getElementById('ordFechaPed').value;
  const fEnt = document.getElementById('ordFechaEnt').value;
  const metodo = document.getElementById('ordMetodo').value;
  const estPago = document.getElementById('ordEstadoPago').value;
  const adelanto = estPago === 'Adelanto' ? Number(document.getElementById('ordAdelanto').value) : (estPago === 'Pagado' ? -1 : 0);

  if(!cliente||!fPed||!fEnt){alert('Completa los datos del cliente y fechas.');return;}
  
  const rows=[...document.querySelectorAll('.item-row')]; if(!rows.length){alert('Agrega productos a la lista.');return;}
  const items=rows.map(r=>({productoId:r.querySelector('.ordenProducto').value,cantidad:Number(r.querySelector('.ordenCantidad').value)||0}));
  
  // Validar y restar stock
  for(const it of items){ const p=inventario.find(x=>x.id===it.productoId); if(!p||it.cantidad>p.cantidad){alert(`Stock insuficiente para materia prima.`);return;} }
  items.forEach(it=>{const p=inventario.find(x=>x.id===it.productoId);if(p)p.cantidad-=it.cantidad;});
  
  pedidos.push({
    id:genId(), cliente, items, fecha_pedido: fPed, fecha_entrega: fEnt,
    metodo_pago: metodo, estado_pago: estPago, adelanto, estado:ESTADOS[0], timestamp:new Date().toISOString()
  });
  
  Promise.all([syncInv(),syncOrd()]); 
  document.getElementById('ordCliente').value=''; document.getElementById('ordAdelanto').value='';
  document.getElementById('ordenItems').innerHTML=''; addItemRow(); 
  renderTablaInv(); renderTablaOrd();
}

function renderTablaOrd() {
  const kw=document.getElementById('filtroOrd').value.toLowerCase(), list=pedidos.filter(o=>(o.cliente+o.estado).toLowerCase().includes(kw)), tb=document.getElementById('tbodyOrd');
  if(!list.length){ tb.innerHTML=`<tr><td colspan="7"><div class="empty">Sin pedidos</div></td></tr>`; return; }
  
  tb.innerHTML=list.map((o,i)=>{ 
    let total=0;
    const txt=o.items.map(it=>{const p=inventario.find(x=>x.id===it.productoId); if(p) total+=(p.precio*it.cantidad); return`${p?p.nombre:'(Eliminado)'} x${it.cantidad}`;}).join('<br>'); 
    
    // Matemáticas Finanzas
    let adelantoReal = o.estado_pago === 'Pagado' ? total : o.adelanto;
    let falta = total - adelantoReal;
    
    const badgePago = o.estado_pago==='Pagado'? 'badge-green' : (o.estado_pago==='Adelanto'?'badge-yellow':'badge-gray');
    const opts=ESTADOS.map(e=>`<option value="${e}" ${e===o.estado?'selected':''}>${e}</option>`).join(''); 
    
    return`<tr>
      <td>${i+1}</td>
      <td><strong>${o.cliente}</strong></td>
      <td style="font-size:.8rem">Ped: ${o.fecha_pedido}<br>Ent: <strong>${o.fecha_entrega}</strong></td>
      <td style="font-size:.85rem">${txt}</td>
      <td style="font-size:.85rem">Total: $${total.toFixed(2)}<br>Abonó: $${adelantoReal.toFixed(2)}<br><strong style="color:var(--rose)">Falta: $${falta.toFixed(2)}</strong></td>
      <td><span class="badge ${badgePago}">${o.estado_pago}</span><br><span style="font-size:.7rem;color:#777">${o.metodo_pago}</span></td>
      <td><select style="font-size:.8rem;padding:.2rem;border-radius:4px" onchange="cambiarEstado('${o.id}',this.value)">${opts}</select></td>
    </tr>`; 
  }).join('');
}
function cambiarEstado(id,estado){const o=pedidos.find(p=>p.id===id);if(o){o.estado=estado;syncOrd();}}
function switchTab(name,btn){ document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); document.getElementById('tab-'+name).classList.add('active'); btn.classList.add('active'); }