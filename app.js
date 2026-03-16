// ============================================================================
// 🧠 CAPA 1: LÓGICA DE NEGOCIO (EL CEREBRO / MODELO)
// Solo manipula arrays, hace matemáticas y llama a la base de datos. Cero HTML.
// ============================================================================
const BusinessLogic = {
  
  Inventario: {
      guardar: async (idEdicion, n, c, u, q, f) => {
          const nombreEstandar = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
          let targetItem = null;
          let action = '';

          if (idEdicion) {
              targetItem = inventario.find(x => x.id === idEdicion);
              if(targetItem) { targetItem.nombre=nombreEstandar; targetItem.categoria=c; targetItem.unidad=u; targetItem.cantidad=q; } 
              action = 'updated';
          } else {
              targetItem = inventario.find(x => x.nombre.toLowerCase() === nombreEstandar.toLowerCase());
              if (targetItem) {
                  targetItem.cantidad += getConversion(q, u, targetItem.unidad);
                  targetItem.historial.push({fecha: f, cantidad: q, unidad_compra: u});
                  action = 'added_stock';
              } else {
                  targetItem = {id: getNextId(inventario), nombre: nombreEstandar, categoria: c, unidad: u, cantidad: q, historial: [{fecha: f, cantidad: q, unidad_compra: u}]};
                  inventario.push(targetItem);
                  action = 'created';
              }
          }
          await dbUpsert('Inventario', targetItem);
          return action;
      },
      eliminar: async (id) => {
          inventario = inventario.filter(x=>x.id !== id);
          await dbDelete('Inventario', id);
      }
  },

  Recetas: {
      guardar: async (idEdicion, nom, encargado, rend, ings) => {
          let targetReceta = {id: idEdicion || getNextId(recetas), nombre:nom, rendimiento:rend, encargado: encargado, ingredientes:ings};
          if(idEdicion) recetas = recetas.filter(r=>r.id!==idEdicion);
          recetas.push(targetReceta);
          await dbUpsert('Recetas', targetReceta);
          return idEdicion ? 'updated' : 'created';
      },
      eliminar: async (id) => {
          recetas = recetas.filter(x=>x.id !== id);
          await dbDelete('Recetas', id);
      }
  },

  Productos: {
      guardar: async (idEdicion, n, c, p, rcts) => {
          let targetProduct = null;
          if (idEdicion) {
              targetProduct = productos.find(x=>x.id===idEdicion);
              if(targetProduct) { targetProduct.nombre=n; targetProduct.categoria=c; targetProduct.precio_venta=p; targetProduct.recetas=rcts; }
          } else { 
              targetProduct = {id: getNextId(productos), nombre:n, categoria:c, recetas:rcts, precio_venta:p};
              productos.push(targetProduct); 
          }
          await dbUpsert('Productos', targetProduct);
          return idEdicion ? 'updated' : 'created';
      },
      eliminar: async (id) => {
          productos = productos.filter(x=>x.id !== id);
          await dbDelete('Productos', id);
      }
  },

  Ventas: {
      agendar: async (c, cel, fE, fP, m, stP, notas, ad, items) => {
          const pedidoId = getNextId(pedidos);
          const nuevoPedido = {id:pedidoId, cliente:c, celular:cel, items, notas:notas, fecha_pedido:fP, fecha_entrega:fE, metodo_pago:m, estado_pago:stP, adelanto:ad, estado:ESTADOS[0]};
          pedidos.push(nuevoPedido);
          
          let nuevasTareas = [];
          items.forEach(it => { 
              const prod = productos.find(x => x.id === it.productoId);
              if(prod && prod.recetas) {
                  prod.recetas.forEach(rItem => {
                      const totalRecetas = it.cantidad * rItem.cantidad;
                      const nTarea = { id: getNextId(tareas) + nuevasTareas.length, pedido_id: pedidoId, receta_id: rItem.id_receta, cantidad_producir: totalRecetas, fecha_limite: fE, descripcion: `Para: ${prod.nombre} | Cliente: ${c} ${notas?'| Notas: '+notas:''}`, estado: 'Pendiente' };
                      nuevasTareas.push(nTarea);
                      tareas.push(nTarea);
                  });
              }
          });
          await Promise.all([ dbUpsert('Pedidos', nuevoPedido), dbUpsert('Tareas', nuevasTareas) ]);
      },
      actualizarNotas: async (id, nuevasNotas) => {
          const ord = pedidos.find(x=>x.id===id);
          if(ord) { ord.notas = nuevasNotas; await dbUpsert('Pedidos', ord); }
      },
      eliminar: async (id) => {
          const tasksToDelete = tareas.filter(t => t.pedido_id === id);
          tareas = tareas.filter(t => t.pedido_id !== id); 
          pedidos = pedidos.filter(x => x.id !== id);
          
          let deletePromises = [dbDelete('Pedidos', id)];
          tasksToDelete.forEach(t => deletePromises.push(dbDelete('Tareas', t.id)));
          await Promise.all(deletePromises);
      }
  },

  Cocina: {
      cambiarEstado: async (id, st) => {
          const t = tareas.find(x=>x.id===id); if(!t) throw new Error('Tarea no encontrada');
          let promises = [];
          let ordenCompletada = false;

          if(st === 'Completado' && t.estado !== 'Completado') {
              const rct = recetas.find(x=>x.id===t.receta_id);
              if(!rct) throw new Error('La receta vinculada fue eliminada del sistema.');

              let reqAgregado = {};
              rct.ingredientes.forEach(ing => {
                  const mat = inventario.find(x=>x.id===ing.id_materia); if(!mat) return;
                  const amt = getConversion(ing.cantidad, ing.unidad||mat.unidad, mat.unidad) * (t.cantidad_producir / (rct.rendimiento || 1));
                  reqAgregado[mat.id] = (reqAgregado[mat.id]||0) + amt;
              });

              let msgFalta = [];
              for(const mId in reqAgregado) {
                 const mat = inventario.find(x=>x.id===Number(mId));
                 if(!mat || mat.cantidad < reqAgregado[mId]) { msgFalta.push(mat ? mat.nombre : 'Ingrediente borrado'); }
              }
              if(msgFalta.length > 0) throw new Error(`Faltan ingredientes en bodega:\n${msgFalta.join(', ')}`);

              let updatedMats = [];
              for(const mId in reqAgregado) {
                 const mat = inventario.find(x=>x.id===Number(mId));
                 if(mat) { mat.cantidad -= reqAgregado[mId]; updatedMats.push(mat); }
              }

              t.estado = 'Completado';
              if(updatedMats.length > 0) promises.push(dbUpsert('Inventario', updatedMats));
          } else {
              t.estado = st; 
          }

          promises.push(dbUpsert('Tareas', t));

          if (st === 'En progreso' && t.pedido_id) {
              const ord = pedidos.find(o => o.id === t.pedido_id);
              if (ord && ord.estado !== 'Realizando' && ord.estado !== 'Entregado') { ord.estado = 'Realizando'; promises.push(dbUpsert('Pedidos', ord)); }
          }
          
          if (st === 'Completado' && t.pedido_id) {
              const parentOrder = pedidos.find(o => o.id === t.pedido_id);
              if (parentOrder && parentOrder.estado !== 'Entregado' && parentOrder.estado !== 'Listo para entrega') {
                  const orderTasks = tareas.filter(x => x.pedido_id === t.pedido_id);
                  if (orderTasks.every(x => x.estado === 'Completado')) { 
                      parentOrder.estado = 'Listo para entrega'; 
                      promises.push(dbUpsert('Pedidos', parentOrder)); 
                      ordenCompletada = true;
                  }
              }
          }
          await Promise.all(promises);
          return { isOrderComplete: ordenCompletada };
      }
  }
};

// ============================================================================
// 🎨 CAPA 2: CONTROLADORES DE INTERFAZ (VISTA)
// Lee los inputs de la pantalla, valida y envía la orden al Cerebro.
// ============================================================================

function renderTodo() { renderInv(); renderRct(); renderPro(); renderTar(); renderOrd(); updateSelects(); checkAlertas(); updateFiltroCocina(); }

// ==========================================
// 🔒 SISTEMA DE ROLES Y PERMISOS
// ==========================================
function aplicarRoles() {
    const rol = currentUser?.rol ? String(currentUser.rol).toLowerCase() : 'empleado';
    const esAdmin = (rol === 'admin');

    // Ocultar pestañas gerenciales si no es Admin
    document.getElementById('tabBtnInv').style.display = esAdmin ? 'inline-block' : 'none';
    document.getElementById('tabBtnRct').style.display = esAdmin ? 'inline-block' : 'none';
    document.getElementById('tabBtnPro').style.display = esAdmin ? 'inline-block' : 'none';
    document.getElementById('tabBtnVen').style.display = esAdmin ? 'inline-block' : 'none';
    document.getElementById('tabBtnHis').style.display = esAdmin ? 'inline-block' : 'none';

    // Bloqueos de seguridad para Empleados de Cocina
    if(!esAdmin) {
        // Forzamos al empleado a ver únicamente la cocina
        switchTab('tar', document.getElementById('tabBtnTar'));
        
        const selFiltro = document.getElementById('filtroCocinaEncargado');
        if(selFiltro) {
            // Si su rol no es un "empleado" genérico, asumimos que es su nombre de estación (Ej: Ana)
            if(rol !== 'empleado') {
                // Capitalizamos la primera letra (ana -> Ana)
                const nombreEstacion = rol.charAt(0).toUpperCase() + rol.slice(1);
                selFiltro.innerHTML = `<option value="${nombreEstacion}">${nombreEstacion}</option>`;
                selFiltro.value = nombreEstacion;
                selFiltro.disabled = true; // No puede espiar las tareas de los demás
            }
        }
    }
}

// Sobrescribimos renderTodo para que ejecute la seguridad en cada refresco
const originalRenderTodo = renderTodo;
renderTodo = function() {
    originalRenderTodo();
    aplicarRoles();
}

// ==========================================
// 🛒 CONTROLADOR DE LISTA DE COMPRAS
// ==========================================
function mostrarListaCompras() {
    const lista = calcularListaCompras();
    const tb = document.getElementById('tbodyCompras');
    
    if (lista.length === 0) {
        tb.innerHTML = '<tr><td colspan="2" class="empty">🟢 Tienes stock suficiente para todos los pedidos actuales.</td></tr>';
    } else {
        tb.innerHTML = lista.map(item => `
            <tr>
                <td><strong>${item.nombre}</strong></td>
                <td style="color: var(--rose); font-weight: bold;">${item.falta}</td>
            </tr>
        `).join('');
    }
    
    document.getElementById('modalCompras').style.display = 'flex';
}

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
function switchTab(name,btn){ document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); document.getElementById('tab-'+name).classList.add('active'); btn.classList.add('active'); }

// --- CONTROLADORES INVENTARIO ---
async function addMateriaPrima() {
  const nRaw = document.getElementById('invNombre').value, c = document.getElementById('invCategoria').value, u = document.getElementById('invUnidad').value, qRaw = document.getElementById('invCantidad').value, fRaw = document.getElementById('invFechaCompra').value;

  if(Validators.isEmpty(nRaw)) return UI.showToast('El nombre del ingrediente no puede estar vacío.', 'error');
  if(!Validators.isPositiveNumber(qRaw)) return UI.showToast('La cantidad debe ser mayor a 0.', 'error');
  if(!Validators.isValidDate(fRaw)) return UI.showToast('Selecciona una fecha de compra válida.', 'error');

  const n = Validators.sanitizeString(nRaw), q = Number(qRaw), f = fRaw;

  try {
      const action = await BusinessLogic.Inventario.guardar(invEnEdicion, n, c, u, q, f);
      renderTodo(); 
      document.getElementById('invNombre').value=''; document.getElementById('invCantidad').value=''; 
      invEnEdicion = null; document.getElementById('btnGuardarInv').textContent = "+ Añadir / Sumar";
      
      if(action === 'updated') UI.showToast('Ingrediente actualizado', 'success');
      else if(action === 'added_stock') UI.showToast('Stock sumado correctamente', 'success');
      else UI.showToast('Nuevo ingrediente registrado', 'success');
  } catch(e) { UI.showToast('Error al guardar en base de datos', 'error'); }
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
  UI.confirm("¿Eliminar ingrediente por completo de la base de datos?", async () => {
      try { await BusinessLogic.Inventario.eliminar(Number(id)); renderTodo(); UI.showToast('Ingrediente eliminado', 'success'); } 
      catch(e) { UI.showToast('Error al eliminar', 'error'); }
  });
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

// --- CONTROLADORES RECETAS ---
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
async function guardarReceta() {
  const nomRaw = document.getElementById('rctNombre').value, encargadoRaw = document.getElementById('rctEncargado').value, rendRaw = document.getElementById('rctRendimiento').value;
  const filas = [...document.querySelectorAll('.fila-ingrediente')];
  if(Validators.isEmpty(nomRaw)) return UI.showToast('La receta necesita un nombre.', 'error');
  if(!Validators.isPositiveNumber(rendRaw)) return UI.showToast('El rendimiento debe ser mayor a 0.', 'error');
  if(filas.length === 0) return UI.showToast('Debes añadir al menos un ingrediente a la fórmula.', 'error');

  let ings = [];
  for (let f of filas) {
    const cantRaw = f.querySelector('.rctCant').value;
    if(!Validators.isPositiveNumber(cantRaw)) return UI.showToast('Revisa las cantidades de los ingredientes.', 'error');
    ings.push({ id_materia: Number(f.querySelector('.rctMateria').value), cantidad: Number(cantRaw), unidad: f.querySelector('.rctUnidad').value });
  }

  const nom = Validators.sanitizeString(nomRaw), encargado = Validators.isEmpty(encargadoRaw) ? 'General' : Validators.sanitizeString(encargadoRaw), rend = Number(rendRaw);
  
  try {
      const action = await BusinessLogic.Recetas.guardar(recetaEnEdicion, nom, encargado, rend, ings);
      renderTodo();
      document.getElementById('rctNombre').value=''; document.getElementById('rctEncargado').value=''; document.getElementById('rctRendimiento').value='1'; document.getElementById('listaIngredientesReceta').innerHTML='';
      recetaEnEdicion = null; document.getElementById('btnGuardarReceta').textContent = "Guardar Receta";
      UI.showToast(action === 'updated' ? 'Receta actualizada' : 'Receta guardada', 'success');
  } catch(e) { UI.showToast('Error al guardar receta', 'error'); }
}
function editarReceta(id) {
  id = Number(id); const r = recetas.find(x=>x.id===id); if(!r) return;
  recetaEnEdicion = id; document.getElementById('rctNombre').value = r.nombre; document.getElementById('rctEncargado').value = r.encargado || ''; document.getElementById('rctRendimiento').value = r.rendimiento || 1;
  document.getElementById('listaIngredientesReceta').innerHTML = ''; r.ingredientes.forEach(ing => addFilaIngrediente(ing));
  document.getElementById('btnGuardarReceta').textContent = "Actualizar Receta";
}
function eliminarReceta(id) {
  UI.confirm("¿Eliminar receta?", async () => {
      try { await BusinessLogic.Recetas.eliminar(Number(id)); renderTodo(); UI.showToast('Receta eliminada', 'success'); }
      catch(e) { UI.showToast('Error al eliminar', 'error'); }
  });
}
function renderRct() {
  const tb = document.getElementById('tbodyRct');
  if(!recetas.length) { tb.innerHTML='<tr><td colspan="4" class="empty">Sin recetas</td></tr>'; return; }
  tb.innerHTML = recetas.map(r=>{
    const txt = r.ingredientes.map(i=>{const m=inventario.find(x=>x.id===i.id_materia); return m?`${i.cantidad}${i.unidad||m.unidad} ${m.nombre}`:'?';}).join('<br>');
    return `<tr><td><strong>${r.nombre}</strong><br><span style="font-size:0.75rem; color:var(--caramel);">👨‍🍳 ${r.encargado}</span></td><td>Rinde: ${r.rendimiento || 1}</td><td style="font-size:.8rem">${txt}</td><td><button class="btn btn-outline btn-icon" style="margin-right:5px;" onclick="editarReceta(${r.id})">✏️</button><button class="btn btn-danger btn-icon" onclick="eliminarReceta(${r.id})">🗑️</button></td></tr>`;
  }).join('');
}

// --- CONTROLADORES MENÚ/PRODUCTOS ---
function addFilaRecetaProducto(rItem = null) {
  const div = document.createElement('div'); div.className='fila-ingrediente';
  div.innerHTML=`<select class="proRecetaId">${recetas.map(r=>`<option value="${r.id}" ${rItem&&rItem.id_receta===r.id?'selected':''}>${r.nombre}</option>`).join('')}</select><input type="number" class="proRecetaCant" min="1" placeholder="Cant." value="${rItem?rItem.cantidad:1}"><button class="btn btn-outline btn-icon" onclick="this.parentElement.remove()">X</button>`;
  document.getElementById('listaRecetasProducto').appendChild(div);
}
async function addProducto() {
  const nRaw = document.getElementById('proNombre').value, cRaw = document.getElementById('proCategoria').value, pRaw = document.getElementById('proPrecio').value;
  const filas = [...document.querySelectorAll('#listaRecetasProducto .fila-ingrediente')];
  if(Validators.isEmpty(nRaw)) return UI.showToast('Falta el nombre del producto o combo.', 'error');
  if(!Validators.isNonNegativeNumber(pRaw)) return UI.showToast('El precio debe ser un número válido.', 'error');
  if(filas.length === 0) return UI.showToast('Debes añadir al menos una receta a este producto.', 'error');

  let rcts = [];
  for(let f of filas) {
     const cantRaw = f.querySelector('.proRecetaCant').value;
     if(!Validators.isPositiveNumber(cantRaw)) return UI.showToast('Las cantidades de las recetas deben ser mayores a 0.', 'error');
     rcts.push({ id_receta: Number(f.querySelector('.proRecetaId').value), cantidad: Number(cantRaw) });
  }

  const n = Validators.sanitizeString(nRaw), c = Validators.sanitizeString(cRaw), p = Number(pRaw);
  
  try {
      const action = await BusinessLogic.Productos.guardar(proEnEdicion, n, c, p, rcts);
      renderTodo(); 
      document.getElementById('proNombre').value=''; document.getElementById('proPrecio').value=''; document.getElementById('listaRecetasProducto').innerHTML='';
      proEnEdicion = null; document.getElementById('btnGuardarPro').textContent = "+ Añadir al Menú";
      UI.showToast(action === 'updated' ? 'Menú actualizado' : 'Producto añadido al Menú', 'success');
  } catch(e) { UI.showToast('Error al guardar producto', 'error'); }
}
function editarProducto(id) {
  id = Number(id); const p = productos.find(x=>x.id===id); if(!p) return;
  proEnEdicion = id; document.getElementById('proNombre').value = p.nombre; document.getElementById('proCategoria').value = p.categoria; document.getElementById('proPrecio').value = p.precio_venta;
  document.getElementById('listaRecetasProducto').innerHTML = ''; if(p.recetas) p.recetas.forEach(rItem => addFilaRecetaProducto(rItem));
  document.getElementById('btnGuardarPro').textContent = "Actualizar Menú";
}
function eliminarProducto(id) {
  UI.confirm("¿Eliminar del menú?", async () => {
      try { await BusinessLogic.Productos.eliminar(Number(id)); renderTodo(); UI.showToast('Producto eliminado', 'success'); }
      catch(e) { UI.showToast('Error al eliminar', 'error'); }
  });
}
function renderPro() {
  const tb = document.getElementById('tbodyPro');
  if(!productos.length) { tb.innerHTML='<tr><td colspan="4" class="empty">Menú vacío</td></tr>'; return; }
  tb.innerHTML = productos.map(p=>{
    const detalle = p.recetas ? p.recetas.map(rItem => { const r = recetas.find(x=>x.id===rItem.id_receta); return `${rItem.cantidad}x ${r?r.nombre:'?'}`; }).join('<br>') : '';
    return `<tr><td><strong>${p.nombre}</strong><br><span class="badge badge-gray">${p.categoria}</span></td><td style="font-size:0.8rem; color:#666;">Produce:<br>${detalle}</td><td><strong style="color:var(--sage)">$${p.precio_venta.toFixed(2)}</strong></td><td><button class="btn btn-outline btn-icon" style="margin-right:5px;" onclick="editarProducto(${p.id})">✏️</button><button class="btn btn-danger btn-icon" onclick="eliminarProducto(${p.id})">🗑️</button></td></tr>`;
  }).join('');
}

// --- CONTROLADORES VENTAS ---
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

async function agendarPedido() {
  const cRaw = document.getElementById('ordCliente').value, cel = document.getElementById('ordCelular').value, fE = document.getElementById('ordFechaEnt').value, fP = document.getElementById('ordFechaPed').value, m = document.getElementById('ordMetodo').value, stP = document.getElementById('ordEstadoPago').value, notas = document.getElementById('ordNotas').value, adRaw = document.getElementById('ordAdelanto').value;
  const itemsHTML = [...document.querySelectorAll('.item-row')];

  if(Validators.isEmpty(cRaw)) return UI.showToast('Falta el nombre del cliente.', 'error');
  if(!Validators.isValidDate(fE) || !Validators.isValidDate(fP)) return UI.showToast('Debes seleccionar fechas válidas.', 'error');
  if(stP === 'Adelanto' && !Validators.isPositiveNumber(adRaw)) return UI.showToast('Ingresa un monto válido para el adelanto.', 'error');
  if(itemsHTML.length === 0) return UI.showToast('El pedido debe tener al menos un producto.', 'error');

  let items = [];
  for(let r of itemsHTML) {
      const cantRaw = r.querySelector('.ordCant').value;
      if(!Validators.isPositiveNumber(cantRaw)) return UI.showToast('Las cantidades de los productos deben ser mayores a 0.', 'error');
      items.push({ productoId: Number(r.querySelector('.ordProd').value), cantidad: Number(cantRaw) });
  }

  const c = Validators.sanitizeString(cRaw);
  const ad = stP === 'Adelanto' ? Number(adRaw) : (stP === 'Pagado' ? -1 : 0);
  
  try {
      await BusinessLogic.Ventas.agendar(c, cel, fE, fP, m, stP, notas, ad, items);
      document.getElementById('ordenItems').innerHTML=''; document.getElementById('ordCliente').value=''; document.getElementById('ordCelular').value=''; document.getElementById('ordNotas').value=''; document.getElementById('ordAdelanto').value='';
      renderTodo(); switchTab('historial', document.getElementById('btnTabHistorial'));
      UI.showToast('Venta guardada y desglosada a cocina', 'success'); 
  } catch(e) { UI.showToast('Error al guardar el pedido', 'error'); }
}

function editarPedido(id) {
  id = Number(id); const ord = pedidos.find(x=>x.id===id); if(!ord) return;
  UI.prompt("Editar Notas del Pedido:", ord.notas, async (nuevasNotas) => {
    if(nuevasNotas !== null) {
      try { await BusinessLogic.Ventas.actualizarNotas(id, nuevasNotas); renderTodo(); UI.showToast('Notas actualizadas', 'success'); }
      catch(e) { UI.showToast('Error al actualizar notas', 'error'); }
    }
  });
}

function eliminarPedido(id) {
  UI.confirm('¿Eliminar esta venta? Las tareas de cocina se borrarán.', async () => {
    try { await BusinessLogic.Ventas.eliminar(Number(id)); renderTodo(); UI.showToast('Venta eliminada', 'success'); }
    catch(e) { UI.showToast('Error al eliminar venta', 'error'); }
  });
}

function imprimirRecibo(id) {
  const ord = pedidos.find(x => x.id === id);
  if(!ord) return;

  // 1. Llenar los datos de cabecera
  document.getElementById('ticketFecha').textContent = new Date().toLocaleDateString();
  document.getElementById('ticketCliente').textContent = ord.cliente;
  document.getElementById('ticketEntrega').textContent = ord.fecha_entrega;
  document.getElementById('ticketId').textContent = "TC-" + ord.id.toString().padStart(4, '0');

  // 2. Llenar la tabla de productos
  let itemsHtml = `<tr><th style="text-align:left;">Cant</th><th style="text-align:left;">Producto</th><th style="text-align:right;">Sub</th></tr>`;
  let total = 0;

  ord.items.forEach(it => {
    const p = productos.find(x => x.id === it.productoId);
    const sub = (p ? p.precio_venta : 0) * it.cantidad;
    total += sub;
    itemsHtml += `<tr>
      <td>${it.cantidad}x</td>
      <td>${p ? p.nombre : 'Producto borrado'}</td>
      <td style="text-align:right;">$${sub.toFixed(2)}</td>
    </tr>`;
  });
  document.getElementById('ticketItems').innerHTML = itemsHtml;

  // 3. Cálculos finales
  document.getElementById('ticketTotal').textContent = total.toFixed(2);
  const adelanto = ord.estado_pago === 'Pagado' ? total : ord.adelanto;
  document.getElementById('ticketAdelanto').textContent = adelanto.toFixed(2);
  document.getElementById('ticketPendiente').textContent = Math.max(0, total - adelanto).toFixed(2);

  // 4. Lanzar la ventana de impresión del sistema
  window.print();
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
    const stSel = `<select style="font-family:var(--font-b); border-radius:6px; padding:4px;" onchange="const p=pedidos.find(x=>x.id===${o.id});if(p){p.estado=this.value; dbUpsert('Pedidos', p).then(renderTodo);}">${ESTADOS.map(e=>`<option ${o.estado===e?'selected':''}>${e}</option>`).join('')}</select>`;
    const avisoStock = checkStockFaltantePedido(o) ? '<span style="color:var(--rose); font-weight:bold; font-size:0.75rem;">⚠️ Falta Comprar Ingredientes</span>' : '<span style="color:var(--sage); font-size:0.75rem;">✓ Ingredientes Listos</span>';
    
    let badgePrioridad = ''; if (o.estado !== 'Entregado' && o.fecha_entrega <= hoy) badgePrioridad = '<span class="badge badge-yellow" style="margin-bottom:6px;">🔥 Prioridad (Entrega)</span><br>';

    return `<tr style="${o.estado === 'Entregado' ? 'opacity: 0.6; background: #f9f9f9;' : ''}">
      <td>${badgePrioridad}<strong>${o.cliente}</strong><br><span style="font-size:0.75rem; color:#888;">${o.celular?'📱 '+o.celular+'<br>':''}${o.notas?'📝 '+o.notas:''}</span></td>
      <td style="font-size:.8rem">${txt}</td>
      <td style="font-size:.8rem">P: ${o.fecha_pedido}<br>E: <strong>${o.fecha_entrega}</strong></td>
      <td style="font-size:.8rem">Total: $${tot.toFixed(2)}<br>Falta: $${(tot-adReal).toFixed(2)}<br><span class="badge badge-gray" style="margin-top:4px; display:inline-block;">${o.estado_pago}</span><br><span style="font-size:0.75rem; color:#666;">💳 ${o.metodo_pago || 'Efectivo'}</span></td>
      <td>${stSel}</td>
      <td>
        <button class="btn btn-outline btn-icon" style="margin-right:5px;" title="Imprimir Ticket" onclick="imprimirRecibo(${o.id})">🖨️</button>
        <button class="btn btn-outline btn-icon" style="margin-right:5px;" title="Editar Notas" onclick="editarPedido(${o.id})">✏️</button>
        <button class="btn btn-danger btn-icon" title="Eliminar Venta" onclick="eliminarPedido(${o.id})">🗑️</button>
      </td>      <td>${avisoStock}</td>
    </tr>`;
  }).join('');
}

// --- CONTROLADORES COCINA ---
function updateFiltroCocina() {
  const sel = document.getElementById('filtroCocinaEncargado');
  if(!sel) return;
  const valAct = sel.value;
  const encargados = [...new Set(recetas.map(r => r.encargado).filter(e => e))].sort();
  sel.innerHTML = `<option value="Todos">Todas las estaciones</option>` + encargados.map(e => `<option value="${e}" ${valAct===e?'selected':''}>${e}</option>`).join('');
}

async function cambiarEstadoTar(id, st) { 
  try {
      const resp = await BusinessLogic.Cocina.cambiarEstado(Number(id), st);
      renderTodo();
      if(st === 'Completado') UI.showToast('Tarea completada e ingredientes descontados.', 'success');
      if(resp.isOrderComplete) setTimeout(() => UI.showToast('¡Todas las tareas listas! Combo completado.', 'success'), 500);
  } catch (error) {
      renderTar(); // Revierte visualmente el selector si hubo error
      UI.showToast(error.message, 'error');
  }
}

function renderTar() {
  const sel = document.getElementById('filtroCocinaEncargado');
  const filtroVal = sel ? sel.value : 'Todos';
  
  let tareasFiltradas = tareas;
  if(filtroVal !== 'Todos') { tareasFiltradas = tareas.filter(t => { const r = recetas.find(x => x.id === t.receta_id); return r && r.encargado === filtroVal; }); }

  const resumenContainer = document.getElementById('resumenCocina');
  const pendientes = tareasFiltradas.filter(t => t.estado === 'Pendiente');
  
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
           if(!mat || mat.cantidad < reqAgregado[mId]) faltantes.push(`${mat?mat.nombre:'?'} (Falta ${(reqAgregado[mId] - (mat?mat.cantidad:0)).toFixed(2)}${mat?mat.unidad:''})`);
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
      <td style="vertical-align:top;">👨‍🍳 ${rct?rct.encargado:'General'}</td>
      <td style="vertical-align:top;">${sel}</td>
    </tr>`;
  }).join('');
}