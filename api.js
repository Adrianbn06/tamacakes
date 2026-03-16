const HeadersDB = {
    'Inventario': ['id','nombre','categoria','unidad','cantidad','fecha_compra'],
    'Recetas': ['id','nombre','rendimiento','encargado','ingredientes'],
    'Productos': ['id','nombre','categoria','recetas','precio_venta'],
    'Tareas': ['id','pedido_id','receta_id','cantidad_producir','fecha_limite','descripcion','estado'],
    'Pedidos': ['id','cliente','celular','items','notas','fecha_pedido','fecha_entrega','metodo_pago','estado_pago','adelanto','estado']
};

// ==========================================
// 🔔 MOTOR EN TIEMPO REAL (FIREBASE TIMBRE)
// ==========================================
let lastSyncTime = 0;
let isTimbreActivado = false;

function activarTimbreFirebase() {
    if(isTimbreActivado) return;
    isTimbreActivado = true;
    
    // Escuchamos los cambios en Firebase
    firebase.database().ref('timbre_actualizacion').on('value', (snapshot) => {
        const timestamp = snapshot.val();
        
        // Si el timbre suena, y es más nuevo que nuestro último envío, alguien más actualizó algo.
        if (timestamp && timestamp > lastSyncTime) {
            lastSyncTime = timestamp;
            
            // Le damos 1.5 segundos a Google Sheets para que asimile los datos antes de descargarlos
            setTimeout(() => {
                if(currentUser && currentUser.email) {
                    cargarDatos(currentUser.email, true); // Modo silencioso
                }
            }, 1500);
        }
    });
}

function tocarTimbre() {
    lastSyncTime = Date.now();
    firebase.database().ref('timbre_actualizacion').set(lastSyncTime);
}

// ==========================================
// 📡 EL MENSAJERO A GOOGLE SHEETS
// ==========================================
async function apiCall(action, payload={}) {
  const req = JSON.stringify({ 
      token: APP_SECRET_TOKEN, 
      action: action, 
      email: currentUser?.email || payload.email, 
      payload: payload 
  });
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); 

  try {
    const res = await fetch(APPS_SCRIPT_URL, { 
        method: 'POST', 
        body: req, 
        headers: {'Content-Type': 'text/plain'},
        signal: controller.signal 
    });
    
    clearTimeout(timeoutId); 
    
    if (!res.ok) throw new Error('Servidor_Rechazado');
    
    const data = await res.json();
    if(data.error === 'unauthorized_token') throw new Error('Token de seguridad inválido');
    
    return data;

  } catch (error) {
    clearTimeout(timeoutId); 
    setSyncing(false, 'Error de conexión'); 
    
    if (error.name === 'AbortError') {
        UI.showToast('⏳ Tiempo de espera agotado. Revisa tu conexión a internet.', 'error');
    } else if (error.message === 'Token de seguridad inválido') {
        UI.showToast('🔒 Error de Seguridad: Acceso Denegado por el Servidor.', 'error');
    } else {
        UI.showToast('🔌 Error de conexión con la base de datos.', 'error');
    }
    
    throw error; 
  }
}

function setSyncing(act, msg='') { 
    const dot = document.getElementById('syncDot');
    const txt = document.getElementById('syncMsg');
    if(!dot || !txt) return;

    if(act) {
        dot.classList.add('syncing');
        txt.textContent = msg || 'Sincronizando...';
    } else {
        dot.classList.remove('syncing');
        txt.textContent = msg || 'Sincronizado ✓';
    }
}

// "silencioso = true" actualiza los datos por detrás sin borrar los inputs de la pantalla
function cargarDatos(email, silencioso = false) {
  if(!silencioso) setSyncing(true, 'Cargando base de datos...');
  else setSyncing(true, 'Sincronizando cambios en vivo...');
  
  apiCall('getAll', { email }).then(data => {
    if (data.error) { 
        if(data.error !== 'unauthorized_token' && !silencioso) auth.signOut(); 
        return; 
    }
    
    currentUser = { email, rol: data.rol };
    
    inventario = (data.inventario||[]).map(x=>({...x, id:Number(x.id), cantidad:Number(x.cantidad), historial: parseHistorial(x.fecha_compra, x.cantidad)}));
    recetas = (data.recetas||[]).map(x=>({...x, id:Number(x.id), rendimiento:Number(x.rendimiento)||1, encargado:x.encargado||'General', ingredientes:JSON.parse(x.ingredientes||'[]').map(i=>({...i, id_materia:Number(i.id_materia), cantidad:Number(i.cantidad)}))}));
    productos = (data.productos||[]).map(x=>({...x, id:Number(x.id), precio_venta:Number(x.precio_venta), recetas:JSON.parse(x.recetas||'[]').map(r=>({...r, id_receta:Number(r.id_receta), cantidad:Number(r.cantidad)}))}));
    tareas = (data.tareas||[]).map(x=>({...x, id:Number(x.id), receta_id:Number(x.receta_id), pedido_id:Number(x.pedido_id), cantidad_producir:Number(x.cantidad_producir)}));
    pedidos = (data.pedidos||[]).map(x=>({...x, id:Number(x.id), items:JSON.parse(x.items||'[]').map(i=>({...i, productoId:Number(i.productoId), cantidad:Number(i.cantidad)})), adelanto:Number(x.adelanto), notas:x.notas||'', celular:x.celular||''}));

    if(!silencioso) {
        document.getElementById('userName').textContent = email.split('@')[0];
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('app').style.display = 'block';

        document.getElementById('ordFechaPed').value = new Date().toISOString().split('T')[0];
        document.getElementById('ordFechaEnt').value = new Date().toISOString().split('T')[0];
        document.getElementById('invFechaCompra').value = new Date().toISOString().split('T')[0];
        
        // Activamos la escucha en vivo solo la primera vez que inicia sesión
        activarTimbreFirebase();
    }

    setSyncing(false, 'Sincronizado ✓');
    renderTodo();
    
    if(silencioso) UI.showToast('Pantalla actualizada (Cambios recientes detectados)', 'warning');
    
  }).catch(err => {
     if(!silencioso) document.getElementById('loginMsg').textContent = '⚠️ Error al cargar datos.';
  });
}

async function dbUpsert(sheetName, records) {
    if(!records) return;
    if(!Array.isArray(records)) records = [records];
    if(records.length === 0) return;

    setSyncing(true);
    
    const formattedRecords = records.map(record => {
       let fRecord = { ...record };
       if(sheetName === 'Inventario' && Array.isArray(fRecord.historial)) fRecord.fecha_compra = JSON.stringify(fRecord.historial);
       if(sheetName === 'Recetas' && Array.isArray(fRecord.ingredientes)) fRecord.ingredientes = JSON.stringify(fRecord.ingredientes);
       if(sheetName === 'Productos' && Array.isArray(fRecord.recetas)) fRecord.recetas = JSON.stringify(fRecord.recetas);
       if(sheetName === 'Pedidos' && Array.isArray(fRecord.items)) fRecord.items = JSON.stringify(fRecord.items);
       return fRecord;
    });

    try {
        await apiCall('upsert', { sheetName: sheetName, headers: HeadersDB[sheetName], records: formattedRecords });
        tocarTimbre(); // 🔔 Avisamos a todos los demás celulares que recarguen
        setSyncing(false);
    } catch (e) {
        setSyncing(false, 'Error al guardar');
        throw e;
    }
}

async function dbDelete(sheetName, id) {
    setSyncing(true);
    try {
        await apiCall('delete', { sheetName: sheetName, id: id });
        tocarTimbre(); // 🔔 Avisamos a todos los demás celulares
        setSyncing(false);
    } catch(e) {
        setSyncing(false, 'Error al borrar');
        throw e;
    }
}