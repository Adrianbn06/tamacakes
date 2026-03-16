// ==========================================
// ⚙️ CONFIGURACIÓN GLOBAL Y CREDENCIALES
// ==========================================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbznwikMctSh4afbtipMT3Do4yrefpT1XbDoUwzC9LOATjmTYUXMQWtGY8cCv-bndYxx/exec';

// 🔒 TOKEN DE SEGURIDAD (Debe ser idéntico al de Código.gs)
const APP_SECRET_TOKEN = "TamaCakes_Seguridad_Ultra_2026_XYZ";

const firebaseConfig = {
  apiKey: "AIzaSyBxuYMmrJUfv28ao2hopmvp08ZRVuLnFcw",
  authDomain: "tamacakes-auth.firebaseapp.com",
  projectId: "tamacakes-auth",
  storageBucket: "tamacakes-auth.firebasestorage.app",
  messagingSenderId: "861917887492",
  appId: "1:861917887492:web:975b2f4971a4ed17954951"
};

// ==========================================
// 🧠 ESTADO DE LA APLICACIÓN (MEMORIA)
// ==========================================
let currentUser = null;
let inventario = [], recetas = [], productos = [], tareas = [], pedidos = [];

let invEnEdicion = null;
let recetaEnEdicion = null; 
let proEnEdicion = null;
let sortByDate = false; 

const ESTADOS = ['Agendado','Realizando','Listo para entrega','Entregado'];
const ESTADOS_TAR = ['Pendiente','En progreso','Completado'];