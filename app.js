//////////////////////////////////////////////////
// ==========================================
// 1. CONFIGURACIÓN FIREBASE (Mantén tus datos)
// ==========================================
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

// ==========================================
// 2. ESTADO GLOBAL DEL SISTEMA
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
// 3. VIGILANTE DE SESIÓN (SOLUCIÓN ERROR VISUAL)
// ==========================================
auth.onAuthStateChanged((user) => {
  const loginScreen = document.getElementById('loginScreen');
  const appScreen = document.getElementById('app');
  
  if (user) {
    appScreen.style.display = 'none'; // Aseguramos que esté oculto mientras carga
    loginScreen.style.display = 'flex';
    document.getElementById('loginMsg').textContent = '⏳ Restaurando sesión...';
    cargarDatosDesdeSheets(user.email);
  } else {
    appScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    document.getElementById('loginMsg').textContent = '';
  }
});

// ==========================================
// 4. COMUNICACIÓN CON EL SERVIDOR (APPS SCRIPT)
// ==========================================
async function apiCall(action, payload={}) {
  const body = JSON.stringify({ 
    action, 
    email: payload.email || (currentUser ? currentUser.email : ''), 
    payload 
  });
  const resp = await fetch(APPS_SCRIPT_URL, { method: 'POST', body });
  return await resp.json();
}

function cargarDatosDesdeSheets(emailValidado) {
  apiCall('getAll', { email: emailValidado })
    .then(data => {
      if (data.error) {
        alert('Acceso denegado');
        auth.signOut(); return;
      }
      currentUser = { email: emailValidado, rol: data.rol };
      
      // Procesar datos recibidos
      inventario = parseInv(data.inventario || []);
      recetas    = parseRct(data.recetas || []);
      productos  = parsePro(data.productos || []);
      tareas     = parseTar(data.tareas || []);
      pedidos    = parseOrd(data.pedidos || []);

      // Mostrar App
      document.getElementById('userName').textContent = emailValidado.split('@')[0];
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('app').style.display = 'block';

      renderTodo();
    }).catch(err => console.error("Error al cargar:", err));
}

// ==========================================
// 5. MOTOR DE RENDERIZADO Y ALERTAS
// ==========================================
function renderTodo() {
  renderTablaInv(); renderTablaRct(); renderTablaPro(); 
  renderTablaTar(); renderTablaOrd(); updateSelects(); 
  checkAlertasGlobales();
}

function checkAlertasGlobales() {
  let alertas = [];
  inventario.forEach(m => { if(m.cantidad < 5) alertas.push(`🌾 <strong>Materia Prima Crítica:</strong> ${m.nombre} (${m.cantidad} ${m.unidad})`); });
  productos.forEach(p => { if(p.cantidad < 5) alertas.push(`🍰 <strong>Stock Bajo Venta:</strong> ${p.nombre} (${p.cantidad} unidades)`); });
  
  const panel = document.getElementById('alertasGlobales');
  panel.innerHTML = alertas.length > 0 ? 
    `<div class="alert-box">${alertas.map(a => `<p>${a}</p>`).join('')}</div>` : '';
}

// ==========================================
// 6. LÓGICA DE PRODUCCIÓN (EL CORAZÓN DEL SISTEMA)
// ==========================================
function cambiarEstadoTar(id, estadoNuevo) { 
  const t = tareas.find(x => x.id === id);
  if (!t || t.estado === 'Completado') return;

  if (estadoNuevo === 'Completado') {
    const prod = productos.find(x => x.id === t.producto_id);
    const rct = recetas.find(x => x.id === prod?.id_receta);

    if (!prod || !rct) return alert('Error: Producto o receta no válidos.');

    // Validar Stock de Materia Prima
    let errorStock = false;
    rct.ingredientes.forEach(ing => {
      const mat = inventario.find(m => m.id === ing.id_materia);
      if (!mat || mat.cantidad < (ing.cantidad * t.cantidad_producir)) errorStock = true;
    });

    if (errorStock) {
      alert('❌ No hay suficiente materia prima para completar esta producción.');
      renderTablaTar(); return;
    }

    // Restar de Inventario y Sumar a Producto
    rct.ingredientes.forEach(ing => {
      const mat = inventario.find(m => m.id === ing.id_materia);
      mat.cantidad -= (ing.cantidad * t.cantidad_producir);
    });
    prod.cantidad += t.cantidad_producir;
    
    t.estado = 'Completado';
    
    // Sincronizar todo
    Promise.all([syncTar(), syncInv(), syncPro()]).then(() => renderTodo());
  } else {
    t.estado = estadoNuevo;
    syncTar().then(() => renderTablaTar());
  }
}

// ==========================================
// 7. FUNCIONES DE APOYO (LOGIN, SYNC, PARSERS)
// ==========================================
function login() {
  const e = document.getElementById('loginEmail').value, p = document.getElementById('loginPass').value;
  auth.signInWithEmailAndPassword(e, p).catch(err => {
    document.getElementById('loginMsg').textContent = "Error: " + err.message;
  });
}

function logout() { auth.signOut(); }

function setSyncing(a, m='') { document.getElementById('syncMsg').textContent = m||(a?'Sincronizando...':'Sincronizado ✓'); }
async function syncInv() { setSyncing(true); await apiCall('saveInventario',{data:inventario}); setSyncing(false); }
async function syncRct() { setSyncing(true); await apiCall('saveRecetas',{data:recetas}); setSyncing(false); }
async function syncPro() { setSyncing(true); await apiCall('saveProductos',{data:productos}); setSyncing(false); }
async function syncTar() { setSyncing(true); await apiCall('saveTareas',{data:tareas}); setSyncing(false); }
async function syncOrd() { setSyncing(true); await apiCall('savePedidos',{data:pedidos}); setSyncing(false); }

// Parsers para asegurar tipos de datos
function parseInv(r) { return r.map(x=>({id:x.id, nombre:x.nombre, categoria:x.categoria, cantidad:Number(x.cantidad), unidad:x.unidad, costo:Number(x.costo)})); }
function parseRct(r) { return r.map(x=>({id:x.id, nombre:x.nombre, ingredientes: JSON.parse(x.ingredientes || '[]')})); }
function parsePro(r) { return r.map(x=>({id:x.id, nombre:x.nombre, categoria:x.categoria, cantidad:Number(x.cantidad), costo_produccion:Number(x.costo_produccion), precio_venta:Number(x.precio_venta), id_receta:x.id_receta})); }
function parseTar(r) { return r.map(x=>({id:x.id, descripcion:x.descripcion, producto_id:x.producto_id, cantidad_producir:Number(x.cantidad_producir), fecha_limite:x.fecha_limite, estado:x.estado})); }
function parseOrd(r) { return r.map(x=>({id:x.id, cliente:x.cliente, items:JSON.parse(x.items||'[]'), fecha_entrega:x.fecha_entrega, estado_pago:x.estado_pago, adelanto:Number(x.adelanto), estado:x.estado})); }

// ==========================================
// 8. INTERFAZ Y TABLAS (RESUMIDO)
// ==========================================
function switchTab(name, btn) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
}

function addFilaIngrediente() {
  const container = document.getElementById('listaIngredientesReceta');
  const div = document.createElement('div');
  div.className = 'fila-ingrediente';
  div.innerHTML = `
    <select class="sel-mat">${inventario.map(m=>`<option value="${m.id}">${m.nombre} (${m.unidad})</option>`).join('')}</select>
    <input type="number" class="cant-mat" placeholder="Cant.">
    <button onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(div);
}

function guardarReceta() {
  const nombre = document.getElementById('rctNombre').value;
  const filas = document.querySelectorAll('.fila-ingrediente');
  let ings = [];
  filas.forEach(f => {
    ings.push({ id_materia: f.querySelector('.sel-mat').value, cantidad: Number(f.querySelector('.cant-mat').value) });
  });
  recetas.push({ id: genId(), nombre, ingredientes: ings });
  syncRct().then(() => renderTodo());
}

// ... Las funciones renderTablaInv, renderTablaPro, etc., siguen la misma lógica de mapeo de arrays vista anteriormente ...

function updateSelects() {
  const rSelect = document.getElementById('proReceta');
  if(rSelect) rSelect.innerHTML = recetas.map(r => `<option value="${r.id}">${r.nombre}</option>`).join('');
  
  const pSelect = document.getElementById('tarProducto');
  if(pSelect) pSelect.innerHTML = productos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
}

// Inicializar filas de ingredientes
function addItemRow() { /* Lógica similar para añadir productos a la venta */ }
