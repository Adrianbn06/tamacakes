// ==========================================
// 1. CONFIGURACIÓN (REEMPLAZA CON TUS DATOS)
// ==========================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbznwikMctSh4afbtipMT3Do4yrefpT1XbDoUwzC9LOATjmTYUXMQWtGY8cCv-bndYxx/exec";;

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
let inventario  = [];
let pedidos     = [];
let tareas      = [];
const ESTADOS   = ['Agendado','Realizando','Listo para entrega','Entregado'];
const ESTADOS_TAR = ['Pendiente', 'En progreso', 'Completado'];
const genId     = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

// ==========================================
// VIGILANTE DE SESIÓN (Oculta la app mientras carga)
// ==========================================
auth.onAuthStateChanged((user) => {
  const appScreen = document.getElementById('app');
  const loginScreen = document.getElementById('loginScreen');
  
  if (user) {
    appScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    document.getElementById('loginMsg').textContent = '⏳ Restaurando sesión...';
    document.getElementById('loginMsg').style.color = '#9c7a60';
    cargarDatosDesdeSheets(user.email);
  } else {
    appScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
  }
});

// ==========================================
// CONEXIÓN Y DATOS
// ==========================================
function iniciarSesion() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const msgDiv = document.getElementById('loginMsg');
  if(!email || !pass) { msgDiv.textContent = '⚠️ Faltan datos.'; return; }
  
  msgDiv.textContent = '⏳ Verificando...';
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => auth.signInWithEmailAndPassword(email, pass))
    .catch((error) => { msgDiv.textContent = '⛔ Error de acceso.'; });
}

function apiCall(action, payload={}) {
  const requestBody = JSON.stringify({ action: action, email: payload.email || (currentUser ? currentUser.email : ''), payload: payload });
  return fetch(APPS_SCRIPT_URL, { method: 'POST', body: requestBody }).then(r => r.json());
}

function cargarDatosDesdeSheets(emailValidado) {
  apiCall('getAll', { email: emailValidado }).then(data => {
    if (data.error) { auth.signOut(); return; }
    
    currentUser = { email: emailValidado, rol: data.rol };
    inventario  = parseInv(data.inventario || []);
    pedidos     = parseOrd(data.pedidos || []);
    tareas      = parseTar(data.tareas || []);

    document.getElementById('userName').textContent = emailValidado.split('@')[0];
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    setSyncing(false, 'Sincronizado ✓');
    applyRol(); renderTablaInv(); renderTablaOrd(); renderTablaTar();
    
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('ordFechaPed').value = hoy;
    document.getElementById('ordFechaEnt').value = hoy;
    document.getElementById('tarFecha').value = hoy;
  }).catch(err => console.error(err));
}

function logout() { auth.signOut().then(() => { currentUser = null; inventario = []; pedidos = []; tareas = []; }); }

// ==========================================
// SINCRONIZACIÓN Y PARSERS
// ==========================================
function setSyncing(active, msg='') { document.getElementById('syncMsg').textContent = msg||(active?'Sincronizando…':'Sincronizado'); }
function syncInv() { setSyncing(true); return apiCall('saveInventario',{data:inventario}).then(()=>setSyncing(false)); }
function syncOrd() { setSyncing(true); return apiCall('savePedidos',{data:pedidos}).then(()=>setSyncing(false)); }
function syncTar() { setSyncing(true); return apiCall('saveTareas',{data:tareas}).then(()=>setSyncing(false)); }

function parseInv(rows) { return rows.map(r=>({id:String(r.id||genId()),nombre:String(r.nombre||''),categoria:String(r.categoria||''),cantidad:Number(r.cantidad||0),costo:Number(r.costo||0),precio:Number(r.precio||0)})); }
function parseTar(rows) { return rows.map(r=>({id:String(r.id||genId()),descripcion:String(r.descripcion||''),fecha_limite:String(r.fecha_limite||''),estado:String(r.estado||'Pendiente'),timestamp:String(r.timestamp||'')})); }
function parseOrd(rows) { return rows.map(r=>{ let items=[]; try{items=typeof r.items==='string'?JSON.parse(r.items):(r.items||[]);}catch{} return{id:String(r.id||genId()),cliente:String(r.cliente||''),items,fecha_pedido:String(r.fecha_pedido||''),fecha_entrega:String(r.fecha_entrega||''),metodo_pago:String(r.metodo_pago||''),estado_pago:String(r.estado_pago||''),adelanto:Number(r.adelanto||0),estado:String(r.estado||ESTADOS[0])}; }); }

function applyRol() {
  const isAdmin = currentUser?.rol === 'admin';
  document.getElementById('formCardInv').style.display = isAdmin ? '' : 'none';
  document.getElementById('thDel').style.display       = isAdmin ? '' : 'none';
}

// ==========================================
// LÓGICA DE LA INTERFAZ
// ==========================================
function addProducto() {
  const n=document.getElementById('invNombre').value.trim(), c=document.getElementById('invCategoria').value.trim(), q=Number(document.getElementById('invCantidad').value), cost=Number(document.getElementById('invCosto').value), price=Number(document.getElementById('invPrecio').value);
  if(!n||isNaN(q)||isNaN(cost)){return;}
  inventario.push({id:genId(),nombre:n,categoria:c,cantidad:q,costo:cost,precio:price});
  syncInv(); renderTablaInv();
}
function deleteProducto(id) { inventario=inventario.filter(p=>p.id!==id); syncInv(); renderTablaInv(); }

function renderTablaInv() {
  const kw=document.getElementById('filtroInv').value.toLowerCase(), list=inventario.filter(p=>(p.nombre+p.categoria).toLowerCase().includes(kw)), isAdmin=currentUser?.rol==='admin', tb=document.getElementById('tbodyInv');
  if(!list.length){ tb.innerHTML=`<tr><td colspan="7">Vacio</td></tr>`; return; }
  tb.innerHTML=list.map(p=>`<tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>${p.nombre}</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${p.categoria}</td><td style="padding:8px;border-bottom:1px solid #eee;">${p.cantidad}</td><td style="padding:8px;border-bottom:1px solid #eee;">$${p.costo.toFixed(2)}</td><td style="padding:8px;border-bottom:1px solid #eee;">$${p.precio.toFixed(2)}</td><td style="padding:8px;border-bottom:1px solid #eee;">$${(p.costo*p.cantidad).toFixed(2)}</td><td style="padding:8px;border-bottom:1px solid #eee;">${isAdmin?`<button onclick="deleteProducto('${p.id}')">🗑️</button>`:'—'}</td></tr>`).join('');
  updateSelects();
}

function addTarea() {
  const desc=document.getElementById('tarDesc').value.trim(), fecha=document.getElementById('tarFecha').value;
  if(!desc||!fecha)return;
  tareas.push({id:genId(),descripcion:desc,fecha_limite:fecha,estado:'Pendiente',timestamp:new Date().toISOString()});
  document.getElementById('tarDesc').value=''; syncTar(); renderTablaTar();
}
function deleteTarea(id) { tareas=tareas.filter(t=>t.id!==id); syncTar(); renderTablaTar(); }
function cambiarEstadoTar(id, estado) { const t=tareas.find(x=>x.id===id); if(t){t.estado=estado; syncTar(); renderTablaTar();} }
function renderTablaTar() {
  const tb=document.getElementById('tbodyTar');
  if(!tareas.length){ tb.innerHTML=`<tr><td colspan="4">Vacio</td></tr>`; return; }
  const list = [...tareas].sort((a,b) => new Date(a.fecha_limite) - new Date(b.fecha_limite));
  tb.innerHTML=list.map(t=>`<tr><td style="padding:8px;border-bottom:1px solid #eee;">${t.descripcion}</td><td style="padding:8px;border-bottom:1px solid #eee;">${t.fecha_limite}</td><td style="padding:8px;border-bottom:1px solid #eee;"><select onchange="cambiarEstadoTar('${t.id}',this.value)">${ESTADOS_TAR.map(e=>`<option value="${e}" ${e===t.estado?'selected':''}>${e}</option>`).join('')}</select></td><td style="padding:8px;border-bottom:1px solid #eee;"><button onclick="deleteTarea('${t.id}')">🗑️</button></td></tr>`).join('');
}

function toggleAdelanto() { document.getElementById('divAdelanto').style.display = (document.getElementById('ordEstadoPago').value === 'Adelanto') ? 'block' : 'none'; }
function addItemRow() {
  const div=document.createElement('div'); div.style.marginBottom='5px';
  div.innerHTML=`<select class="ordenProducto" style="padding:5px; margin-right:5px;">${inventario.map(p=>`<option value="${p.id}">${p.nombre} ($${p.precio})</option>`).join('')}</select><input type="number" class="ordenCantidad" min="1" placeholder="Cant" style="width:60px; padding:5px; margin-right:5px;"><button onclick="this.parentElement.remove()">✕</button>`;
  document.getElementById('ordenItems').appendChild(div);
}
function updateSelects() { document.querySelectorAll('.ordenProducto').forEach(sel=>{ const v=sel.value; sel.innerHTML=inventario.map(p=>`<option value="${p.id}" ${p.id===v?'selected':''}>${p.nombre} ($${p.precio})</option>`).join(''); }); }

function agendarPedido() {
  const cliente=document.getElementById('ordCliente').value, fP=document.getElementById('ordFechaPed').value, fE=document.getElementById('ordFechaEnt').value, metodo=document.getElementById('ordMetodo').value, estPago=document.getElementById('ordEstadoPago').value;
  const adelanto=estPago==='Adelanto'?Number(document.getElementById('ordAdelanto').value):(estPago==='Pagado'?-1:0);
  if(!cliente)return;
  const items=[...document.querySelectorAll('#ordenItems div')].map(r=>({productoId:r.querySelector('.ordenProducto').value,cantidad:Number(r.querySelector('.ordenCantidad').value)||0}));
  items.forEach(it=>{const p=inventario.find(x=>x.id===it.productoId);if(p)p.cantidad-=it.cantidad;});
  pedidos.push({id:genId(), cliente, items, fecha_pedido:fP, fecha_entrega:fE, metodo_pago:metodo, estado_pago:estPago, adelanto, estado:ESTADOS[0], timestamp:new Date().toISOString()});
  Promise.all([syncInv(),syncOrd()]).then(()=>{ document.getElementById('ordenItems').innerHTML=''; addItemRow(); renderTablaInv(); renderTablaOrd(); });
}

function renderTablaOrd() {
  const tb=document.getElementById('tbodyOrd');
  if(!pedidos.length){ tb.innerHTML=`<tr><td colspan="6">Vacio</td></tr>`; return; }
  tb.innerHTML=pedidos.map(o=>{ 
    let total=0; const txt=o.items.map(it=>{const p=inventario.find(x=>x.id===it.productoId); if(p) total+=(p.precio*it.cantidad); return`${p?p.nombre:'?'} x${it.cantidad}`;}).join('<br>'); 
    let adelantoReal = o.estado_pago === 'Pagado' ? total : o.adelanto;
    return`<tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>${o.cliente}</strong></td><td style="padding:8px;border-bottom:1px solid #eee;font-size:0.8rem">Ped: ${o.fecha_pedido}<br>Ent: ${o.fecha_entrega}</td><td style="padding:8px;border-bottom:1px solid #eee;font-size:0.8rem">${txt}</td><td style="padding:8px;border-bottom:1px solid #eee;font-size:0.8rem">Total: $${total.toFixed(2)}<br>Falta: $${(total-adelantoReal).toFixed(2)}</td><td style="padding:8px;border-bottom:1px solid #eee;font-size:0.8rem">${o.estado_pago}<br>${o.metodo_pago}</td><td style="padding:8px;border-bottom:1px solid #eee;"><select onchange="const p=pedidos.find(x=>x.id==='${o.id}');if(p){p.estado=this.value;syncOrd();}">${ESTADOS.map(e=>`<option value="${e}" ${e===o.estado?'selected':''}>${e}</option>`).join('')}</select></td></tr>`; 
  }).join('');
}

function switchTab(name,btn){ document.querySelectorAll('.tab-pane').forEach(p=>p.style.display='none'); document.querySelectorAll('.tab-btn').forEach(b=>{b.classList.remove('active'); b.style.background='white'; b.style.color='black';}); document.getElementById('tab-'+name).style.display='block'; btn.classList.add('active'); btn.style.background='var(--brown)'; btn.style.color='white'; }
