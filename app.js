/* =====================================
CONFIGURACIÓN
===================================== */

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

const APPS_SCRIPT_URL =
"https://script.google.com/macros/s/AKfycbznwikMctSh4afbtipMT3Do4yrefpT1XbDoUwzC9LOATjmTYUXMQWtGY8cCv-bndYxx/exec";


/* =====================================
ESTADO GLOBAL
===================================== */

let currentUser = null;

let inventario = [];
let recetas = [];
let productos = [];
let tareas = [];
let pedidos = [];


/* =====================================
CONTROL DE SESIÓN
===================================== */

auth.onAuthStateChanged(user => {

  if (user) {

    document.getElementById("loginMsg").textContent =
    "Restaurando sesión...";

    cargarDatos(user.email);

  } else {

    document.getElementById("app").style.display = "none";
    document.getElementById("loginScreen").style.display = "flex";

  }

});


/* =====================================
API GOOGLE APPS SCRIPT
===================================== */

async function api(action, payload = {}) {

  const body = JSON.stringify({
    action,
    email: currentUser?.email || payload.email,
    payload
  });

  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    body
  });

  return await res.json();

}


/* =====================================
CARGAR DATOS
===================================== */

function cargarDatos(email) {

  api("getAll", { email }).then(data => {

    currentUser = {
      email,
      rol: data.rol
    };

    inventario = data.inventario.map(x => ({
      ...x,
      cantidad: Number(x.cantidad),
      costo: Number(x.costo)
    }));

    recetas = data.recetas.map(x => ({
      ...x,
      ingredientes: JSON.parse(x.ingredientes || "[]")
    }));

    productos = data.productos.map(x => ({
      ...x,
      cantidad: Number(x.cantidad),
      precio_venta: Number(x.precio_venta)
    }));

    tareas = data.tareas.map(x => ({
      ...x,
      cantidad_producir: Number(x.cantidad_producir)
    }));

    pedidos = data.pedidos.map(x => ({
      ...x,
      items: JSON.parse(x.items || "[]")
    }));


    document.getElementById("userName").textContent =
    email.split("@")[0];

    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("app").style.display = "block";

    renderTodo();

  });

}


/* =====================================
RENDER GENERAL
===================================== */

function renderTodo(){

  renderInventario();
  renderRecetas();
  renderProductos();
  renderTareas();
  renderPedidos();

  actualizarSelects();
  verificarAlertas();

}


/* =====================================
ALERTAS DE STOCK
===================================== */

function verificarAlertas(){

  const alertas = inventario
  .filter(m => m.cantidad < 5)
  .map(m => `⚠ Poco stock de ${m.nombre} (${m.cantidad} ${m.unidad})`);

  document.getElementById("alertasGlobales").innerHTML =
  alertas.length
  ? `<div class="alert-box">${alertas.join("<br>")}</div>`
  : "";

}


/* =====================================
MATERIA PRIMA
===================================== */

function addMateriaPrima(){

  const m = {

    id: Date.now().toString(36),

    nombre:
    document.getElementById("invNombre").value,

    categoria:
    document.getElementById("invCategoria").value,

    unidad:
    document.getElementById("invUnidad").value,

    cantidad:
    Number(document.getElementById("invCantidad").value),

    costo:
    Number(document.getElementById("invCosto").value)

  };

  inventario.push(m);

  api("saveInventario", { data: inventario })
  .then(renderTodo);

}


function renderInventario(){

  const tbody = document.getElementById("tbodyInv");

  tbody.innerHTML = inventario.map(m => `

  <tr>

  <td>${m.nombre}</td>

  <td>${m.categoria}</td>

  <td>${m.cantidad} ${m.unidad}</td>

  <td>$${m.costo}</td>

  <td>

  <button onclick="eliminarInventario('${m.id}')">🗑</button>

  </td>

  </tr>

  `).join("");

}


function eliminarInventario(id){

  inventario = inventario.filter(m => m.id !== id);

  api("saveInventario",{data:inventario})
  .then(renderTodo);

}


/* =====================================
RECETAS
===================================== */

function addFilaIngrediente(){

  const div = document.createElement("div");

  div.className = "fila-ingrediente";

  div.innerHTML = `

  <select class="sel-mat">

  ${inventario.map(m =>
  `<option value="${m.id}">${m.nombre}</option>`).join("")}

  </select>

  <input type="number" class="cant-mat" placeholder="Cantidad">

  <button onclick="this.parentElement.remove()">✕</button>

  `;

  document
  .getElementById("listaIngredientesReceta")
  .appendChild(div);

}


function guardarReceta(){

  const nombre =
  document.getElementById("rctNombre").value;

  const filas =
  document.querySelectorAll(".fila-ingrediente");

  let ingredientes = [];

  filas.forEach(f => {

    ingredientes.push({

      id_materia:
      f.querySelector(".sel-mat").value,

      cantidad:
      Number(f.querySelector(".cant-mat").value)

    });

  });

  recetas.push({

    id: Date.now().toString(36),
    nombre,
    ingredientes

  });

  api("saveRecetas",{data:recetas})
  .then(renderTodo);

}


function renderRecetas(){

  const tbody = document.getElementById("tbodyRct");

  tbody.innerHTML = recetas.map(r => {

    const ingredientesTexto = r.ingredientes.map(i => {

      const m = inventario.find(x => x.id === i.id_materia);

      return m
      ? `${i.cantidad} ${m.unidad} ${m.nombre}`
      : "?";

    }).join(", ");

    return `

    <tr>

    <td>${r.nombre}</td>

    <td>${ingredientesTexto}</td>

    <td>-</td>

    <td>🗑</td>

    </tr>

    `;

  }).join("");

}


/* =====================================
PRODUCCIÓN
===================================== */

function cambiarEstadoTarea(id,nuevoEstado){

  const t = tareas.find(x => x.id === id);

  if(nuevoEstado === "Completado" && t.estado !== "Completado"){

    const prod =
    productos.find(p => p.id === t.producto_id);

    const receta =
    recetas.find(r => r.id === prod?.id_receta);


    receta.ingredientes.forEach(ing => {

      const mat =
      inventario.find(m => m.id === ing.id_materia);

      if(mat){

        mat.cantidad -=
        (ing.cantidad * t.cantidad_producir);

      }

    });


    if(prod){

      prod.cantidad += t.cantidad_producir;

    }

    t.estado = "Completado";

    Promise.all([

      api("saveInventario",{data:inventario}),
      api("saveProductos",{data:productos}),
      api("saveTareas",{data:tareas})

    ]).then(renderTodo);

  }

}


/* =====================================
AUXILIARES
===================================== */

function login(){

  const email =
  document.getElementById("loginEmail").value;

  const pass =
  document.getElementById("loginPass").value;

  auth.signInWithEmailAndPassword(email,pass)

  .catch(err => {

    document.getElementById("loginMsg").textContent =
    err.message;

  });

}


function logout(){

  auth.signOut();

}


function switchTab(tab,btn){

  document
  .querySelectorAll(".tab-pane")
  .forEach(p => p.classList.remove("active"));

  document
  .querySelectorAll(".tab-btn")
  .forEach(b => b.classList.remove("active"));

  document
  .getElementById("tab-"+tab)
  .classList.add("active");

  btn.classList.add("active");

}


function actualizarSelects(){

  const selectProd =
  document.getElementById("tarProducto");

  if(selectProd){

    selectProd.innerHTML = productos.map(p =>

    `<option value="${p.id}">${p.nombre}</option>`

    ).join("");

  }

}
