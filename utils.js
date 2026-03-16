// ==========================================
// 🛡️ VALIDACIONES ESTRICTAS DE DATOS
// ==========================================
const Validators = {
  isEmpty: (val) => val === undefined || val === null || String(val).trim() === '',
  isPositiveNumber: (val) => val !== '' && !isNaN(val) && Number(val) > 0,
  isNonNegativeNumber: (val) => val !== '' && !isNaN(val) && Number(val) >= 0,
  isValidDate: (val) => {
      if (!val) return false;
      const d = new Date(val);
      return d instanceof Date && !isNaN(d);
  },
  sanitizeString: (val) => String(val).trim().replace(/[<>]/g, '') 
};

// ==========================================
// 🎨 MOTOR DE INTERFAZ GRÁFICA (UI)
// ==========================================
const UI = {
  showToast: (message, type = 'success') => {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '✅';
    if(type === 'error') icon = '❌';
    if(type === 'warning') icon = '⚠️';
    
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  },
  
  confirm: (message, onConfirmCallback) => {
    const modal = document.getElementById('customActionModal');
    document.getElementById('customActionMessage').textContent = message;
    document.getElementById('customActionInput').style.display = 'none';
    
    const btnConfirm = document.getElementById('customActionBtnConfirm');
    const btnCancel = document.getElementById('customActionBtnCancel');
    
    const newConfirm = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newConfirm, btnConfirm);
    const newCancel = btnCancel.cloneNode(true);
    btnCancel.parentNode.replaceChild(newCancel, btnCancel);
    
    newConfirm.onclick = () => {
      modal.style.display = 'none';
      if(onConfirmCallback) onConfirmCallback();
    };
    newCancel.onclick = () => { modal.style.display = 'none'; };
    
    modal.style.display = 'flex';
  },

  prompt: (message, defaultValue, onConfirmCallback) => {
    const modal = document.getElementById('customActionModal');
    document.getElementById('customActionMessage').textContent = message;
    
    const input = document.getElementById('customActionInput');
    input.style.display = 'block';
    input.value = defaultValue || '';
    
    const btnConfirm = document.getElementById('customActionBtnConfirm');
    const btnCancel = document.getElementById('customActionBtnCancel');
    
    const newConfirm = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newConfirm, btnConfirm);
    const newCancel = btnCancel.cloneNode(true);
    btnCancel.parentNode.replaceChild(newCancel, btnCancel);
    
    newConfirm.onclick = () => {
      modal.style.display = 'none';
      if(onConfirmCallback) onConfirmCallback(input.value);
    };
    newCancel.onclick = () => { modal.style.display = 'none'; };
    
    modal.style.display = 'flex';
    input.focus();
  }
};

// ==========================================
// ⚖️ MOTOR UNIVERSAL DE CONVERSIONES
// ==========================================
/* Diccionario Escalar: 
  'tipo' evita que sumes Litros con Gramos por error.
  'aBase' es cuánto equivale esa unidad en su tipo base (1kg = 1000g).
  'parVisual' es la unidad secundaria que se muestra en pantalla.
*/
const UNIDADES = {
  // Familia de Masas (Base: gramos)
  'g':  { tipo: 'masa', aBase: 1,    parVisual: 'kg' },
  'kg': { tipo: 'masa', aBase: 1000, parVisual: 'g' },
  // Familia de Volúmenes (Base: mililitros)
  'ml': { tipo: 'volumen', aBase: 1,    parVisual: 'L' },
  'L':  { tipo: 'volumen', aBase: 1000, parVisual: 'ml' },
  // Familia de Unidades Sueltas
  'unidades': { tipo: 'conteo', aBase: 1, parVisual: null }
};

// Fórmula matemática maestra de conversión
function getConversion(cant, uOrigen, uDestino) {
  if (!uOrigen || !uDestino || uOrigen === uDestino) return cant;
  
  const orig = UNIDADES[uOrigen];
  const dest = UNIDADES[uDestino];
  
  // Si la unidad no existe en el diccionario o intentas cruzar masa con volumen, devuelve la cantidad original para no romper el sistema
  if (!orig || !dest || orig.tipo !== dest.tipo) return cant; 
  
  // Magia pura: Convierte de Origen a Destino usando sus multiplicadores base
  return cant * (orig.aBase / dest.aBase);
}

// Genera la vista doble (Ej: de 1500g crea 1.5kg) para la pantalla
function getDisplayConversion(quantity, unit) {
  const meta = UNIDADES[unit];
  if (!meta || !meta.parVisual) return null;
  
  const destUnit = meta.parVisual;
  const otherQuantity = getConversion(quantity, unit, destUnit);
  
  return { quantity: otherQuantity, unit: destUnit };
}

// ==========================================
// FUNCIONES AUXILIARES 
// ==========================================
function getNextId(arr) {
  if (!arr || arr.length === 0) return 1;
  return Math.max(...arr.map(item => Number(item.id) || 0)) + 1;
}

function parseHistorial(str, cant) {
  if(!str) return [];
  try {
    const parsed = JSON.parse(str);
    if(Array.isArray(parsed)) return parsed;
    return [{fecha: str, cantidad: cant}]; 
  } catch(e) { return [{fecha: str, cantidad: cant}]; }
}

function checkStockFaltantePedido(orden) {
  if (orden.estado === 'Entregado' || orden.estado === 'Listo para entrega') return false;
  let reqAgregado = {};
  let tareasPendientes = tareas.filter(t => t.pedido_id === orden.id && t.estado !== 'Completado');
  
  for(const t of tareasPendientes) {
    const rct = recetas.find(x=>x.id===t.receta_id); if(!rct) continue;
    rct.ingredientes.forEach(ing => {
      const mat = inventario.find(x=>x.id===ing.id_materia); if(!mat) return;
      
      // Aquí usa el nuevo y super potente motor de conversión
      const req = getConversion(ing.cantidad, ing.unidad||mat.unidad, mat.unidad) * (t.cantidad_producir / (rct.rendimiento || 1));
      reqAgregado[mat.id] = (reqAgregado[mat.id]||0) + req;
    });
  }
  for(const id in reqAgregado) { const mat = inventario.find(x=>x.id===Number(id)); if(mat && mat.cantidad < reqAgregado[id]) return true; }
  return false;
}

// ==========================================
// 🛒 PREDICCIÓN INTELIGENTE DE COMPRAS
// ==========================================
function calcularListaCompras() {
  let reqAgregado = {};
  
  // 1. Sumar todo el stock necesario para las tareas que aún NO se han completado
  const tareasPendientes = tareas.filter(t => t.estado !== 'Completado');
  for(const t of tareasPendientes) {
    const rct = recetas.find(x=>x.id===t.receta_id);
    if(!rct) continue;
    
    rct.ingredientes.forEach(ing => {
      const mat = inventario.find(x=>x.id===ing.id_materia);
      if(!mat) return;
      const req = getConversion(ing.cantidad, ing.unidad||mat.unidad, mat.unidad) * (t.cantidad_producir / (rct.rendimiento || 1));
      reqAgregado[mat.id] = (reqAgregado[mat.id] || 0) + req;
    });
  }

  // 2. Comparar la necesidad total contra el stock real que hay en bodega
  let listaCompras = [];
  for(const id in reqAgregado) {
    const mat = inventario.find(x=>x.id===Number(id));
    if(mat && mat.cantidad < reqAgregado[id]) {
      const faltaReal = reqAgregado[id] - mat.cantidad;
      // Usamos el display conversion para que se lea bonito (ej: 1.5 kg en vez de 1500 g)
      const stockBonito = getDisplayConversion(faltaReal, mat.unidad);
      const textoFalta = stockBonito ? `${faltaReal.toFixed(2)} ${mat.unidad} / ${stockBonito.quantity.toFixed(2)} ${stockBonito.unit}` : `${faltaReal.toFixed(2)} ${mat.unidad}`;
      
      listaCompras.push({ nombre: mat.nombre, falta: textoFalta });
    }
  }
  return listaCompras;
}