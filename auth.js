//Todo lo relacionado con Firebase y el inicio de sesión.
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

auth.onAuthStateChanged((user) => {
  if (user) {
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginMsg').textContent = '⏳ Restaurando sesión...';
    cargarDatos(user.email); // Llama a la API
  } else {
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginMsg').textContent = '';
  }
});

function iniciarSesion() {
  const e = document.getElementById('loginEmail').value;
  const p = document.getElementById('loginPass').value;
  if(!e || !p){ document.getElementById('loginMsg').textContent = '⚠️ Faltan datos.'; return;}
  
  document.getElementById('loginMsg').textContent = '⏳ Verificando...';
  auth.signInWithEmailAndPassword(e, p).catch(err => {
      document.getElementById('loginMsg').textContent = '⛔ Credenciales incorrectas.';
  });
}

function logout() { auth.signOut(); }