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

  // Forzamos la persistencia local de la sesión
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
      return auth.signInWithEmailAndPassword(email, pass);
    })
    .then((userCredential) => {
      msgDiv.textContent = '✅ Acceso concedido. Cargando base de datos...';
      // Nota: No llamamos a cargarDatosDesdeSheets aquí porque el onAuthStateChanged (arriba) lo hará automáticamente al detectar el inicio de sesión.
    })
    .catch((error) => {
      console.error(error);
      msgDiv.style.color = 'var(--rose)';
      msgDiv.textContent = '⛔ Correo o contraseña incorrectos.';
    });
}

function apiCall(action, payload={}) {
  const requestBody = JSON.stringify({ 
    action: action, 
    email: payload.email || (currentUser ? currentUser.email : ''), 
    payload: payload 
  });
  
  return fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: requestBody
  }).then(r => r.json());
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

      document.getElementById('userName').textContent = emailValidado.split('@')[0];
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('app').style.display = 'block';

      setSyncing(false, 'Sincronizado con Google Sheets ✓');
      applyRol(); renderTablaInv(); renderTablaOrd();
      document.getElementById('ordenFecha').value = new Date().toISOString().split('T')[0];
    })
    .catch((err) => {
      console.error(err);
      document.getElementById('loginMsg').textContent = '⚠️ Error conectando a la base de datos.';
      document.getElementById('loginMsg').style.color = 'var(--rose)';
    });
}

function logout() {
  auth.signOut().then(() => {
    currentUser = null;
    inventario = [];
    pedidos = [];
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginMsg').textContent = '';
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
  setSyncing(true,'Guardando inventario…');
  return apiCall('saveInventario',{data:inventario})
    .then(d=>setSyncing(false,d.ok?'Guardado ✓':'Error al guardar',!d.ok))
    .catch(()=>setSyncing(false,'Error de conexión',true));
}
function syncOrd() {
  setSyncing(true,'Guardando pedidos…');
  return apiCall('savePedidos',{data:pedidos})
    .then(d=>setSyncing(false,d.ok?'Guardado ✓':'Error al guardar',!d.ok))
    .catch(()=>setSyncing(false,'Error de conexión',true));
}
function applyRol() {
  const isAdmin = currentUser?.rol === 'admin';
  document.getElementById('formCardInv').style.display = isAdmin ? '' : 'none';
  document.getElementById('thDel').style.display       = isAdmin ? '' : 'none';
  document.getElementById('rolBannerInv').innerHTML    = isAdmin
    ? '<div class="alert alert-info">👑 Modo administrador — puedes agregar y eliminar productos.</div>'
    : '<div class="alert alert-warning">👁️ Modo empleado — vista de solo lectura en inventario. Puedes agendar pedidos y cambiar estados.</div>';
}
function parseInv(rows) { return rows.map(r=>({id:String(r.id||genId()),nombre:String(r.nombre||''),categoria:String(r.categoria||''),cantidad:Number(r.cantidad||0),costo:Number(r.costo||0),precio:Number(r.precio||0)})); }
function parseOrd(rows) { return rows.map(r=>{ let items=[]; try{items=typeof r.items==='string'?JSON.parse(r.items):(r.items||[]);}catch{} return{id:String(r.id||genId()),items,fecha:String(r.fecha||''),estado:String(r.estado||ESTADOS[0]),timestamp:String(r.timestamp||'')}; }); }

function addProducto() {
  if (currentUser?.rol!=='admin'){alert('Solo administrador.');return;}
  const n=document.getElementById('invNombre').value.trim(), c=document.getElementById('invCategoria').value.trim(), q=Number(document.getElementById('invCantidad').value), cost=Number(document.getElementById('invCosto').value), price=Number(document.getElementById('invPrecio').value);
  if(!n||!c||isNaN(q)||q<0||isNaN(cost)||cost<0||isNaN(price)||price<0){alert('Completa los campos.');return;}
  inventario.push({id:genId(),nombre:n,categoria:c,cantidad:q,costo:cost,precio:price});
  ['invNombre','invCategoria','invCantidad','invCosto','invPrecio'].forEach(id=>document.getElementById(id).value='');
  syncInv(); renderTablaInv();
}
function deleteProducto(id) {
  if(currentUser?.rol!=='admin')return; if(!confirm('¿Eliminar producto?'))return;
  inventario=inventario.filter(p=>p.id!==id); syncInv(); renderTablaInv();
}

function renderTablaInv() {
  const kw=document.getElementById('filtroInv').value.toLowerCase(), list=inventario.filter(p=>(p.nombre+p.categoria).toLowerCase().includes(kw)), isAdmin=currentUser?.rol==='admin', tb=document.getElementById('tbodyInv');
  if(!list.length){ tb.innerHTML=`<tr><td colspan="8"><div class="empty"><div class="empty-icon">📦</div>Sin productos</div></td></tr>`; document.getElementById('totalInv').textContent='$0.00';return; }
  let tot=0; tb.innerHTML=list.map((p,i)=>{ const t=p.costo*p.cantidad;tot+=t;const low=p.cantidad<=2; return`<tr><td>${i+1}</td><td><strong>${p.nombre}</strong></td><td><span class="badge badge-gray">${p.categoria}</span></td><td>${low?`<span class="badge badge-yellow">${p.cantidad} ⚠️</span>`:p.cantidad}</td><td>$${p.costo.toFixed(2)}</td><td>$${p.precio.toFixed(2)}</td><td>$${t.toFixed(2)}</td><td>${isAdmin?`<button class="btn btn-danger btn-sm btn-icon" onclick="deleteProducto('${p.id}')">🗑️</button>`:'—'}</td></tr>`; }).join('');
  document.getElementById('totalInv').textContent=`$${tot.toFixed(2)}`; updateSelects();
}

function addItemRow() {
  const div=document.createElement('div'); div.className='item-row';
  div.innerHTML=`<div class="fg"><label>Producto</label><select class="ordenProducto">${inventario.map(p=>`<option value="${p.id}">${p.nombre} (Disp: ${p.cantidad})</option>`).join('')}</select></div><div class="fg"><label>Cantidad</label><input type="number" class="ordenCantidad" min="1" placeholder="1"></div><button class="btn btn-outline btn-sm btn-icon" style="align-self:flex-end" onclick="this.closest('.item-row').remove()">✕</button>`;
  document.getElementById('ordenItems').appendChild(div);
}
function updateSelects() { document.querySelectorAll('.ordenProducto').forEach(sel=>{ const v=sel.value; sel.innerHTML=inventario.map(p=>`<option value="${p.id}" ${p.id===v?'selected':''}>${p.nombre} (Disp: ${p.cantidad})</option>`).join(''); }); }
function agendarPedido() {
  const fecha=document.getElementById('ordenFecha').value; if(!fecha){alert('Selecciona fecha.');return;}
  const rows=[...document.querySelectorAll('.item-row')]; if(!rows.length){alert('Agrega productos.');return;}
  const items=rows.map(r=>({productoId:r.querySelector('.ordenProducto').value,cantidad:Number(r.querySelector('.ordenCantidad').value)||0}));
  for(const it of items){ const p=inventario.find(x=>x.id===it.productoId); if(!p||it.cantidad>p.cantidad){alert(`Stock insuficiente para ${p?p.nombre:'producto'}.`);return;} }
  items.forEach(it=>{const p=inventario.find(x=>x.id===it.productoId);if(p)p.cantidad-=it.cantidad;});
  pedidos.push({id:genId(),items,fecha,estado:ESTADOS[0],timestamp:new Date().toISOString()});
  Promise.all([syncInv(),syncOrd()]); document.getElementById('ordenItems').innerHTML=''; addItemRow(); renderTablaInv(); renderTablaOrd();
}

function ingresoPedido(o){return o.items.reduce((s,it)=>{const p=inventario.find(x=>x.id===it.productoId);return s+(p?p.precio*it.cantidad:0);},0);}

function renderTablaOrd() {
  const kw=document.getElementById('filtroOrd').value.toLowerCase(), list=pedidos.filter(o=>{ const prods=o.items.map(it=>{const p=inventario.find(x=>x.id===it.productoId);return p?p.nombre:'';}).join(' '); return(prods+o.estado+o.fecha).toLowerCase().includes(kw); }), tb=document.getElementById('tbodyOrd'); let total=0;
  if(!list.length){ tb.innerHTML=`<tr><td colspan="5"><div class="empty"><div class="empty-icon">🎂</div>Sin pedidos</div></td></tr>`; document.getElementById('totalOrd').textContent='$0.00';return; }
  tb.innerHTML=list.map((o,i)=>{ const txt=o.items.map(it=>{const p=inventario.find(x=>x.id===it.productoId);return`${p?p.nombre:'(Eliminado)'} x${it.cantidad}`;}).join(', '); const ing=ingresoPedido(o);total+=ing; const opts=ESTADOS.map(e=>`<option value="${e}" ${e===o.estado?'selected':''}>${e}</option>`).join(''); return`<tr><td>${i+1}</td><td style="max-width:260px;white-space:normal">${txt}</td><td>${o.fecha}</td><td>$${ing.toFixed(2)}</td><td><select style="font-family:var(--font-b);font-size:.78rem;border:1.5px solid var(--border);border-radius:8px;padding:.3rem .6rem;background:var(--light);color:var(--brown);outline:none;" onchange="cambiarEstado('${o.id}',this.value)">${opts}</select></td></tr>`; }).join('');
  document.getElementById('totalOrd').textContent=`$${total.toFixed(2)}`;
}
function cambiarEstado(id,estado){const o=pedidos.find(p=>p.id===id);if(o){o.estado=estado;syncOrd();}}
function switchTab(name,btn){ document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); document.getElementById('tab-'+name).classList.add('active'); btn.classList.add('active'); }
