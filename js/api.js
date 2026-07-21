
const GOOGLE_MAPS_API_KEY = "AIzaSyBplJ3lx8udSW940DPr-DLyNmBCDewaqRk";

// ── BASE URL ──────────────────────────────────────────────

function getApiUrl() {
  //  Utiliser l'URL de production ou localStorage
  const stored = localStorage.getItem("api_url");
  if (stored) return stored.replace(/\/$/, "");
  
  // En production, utiliser Railway
  if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return "https://nymphe-production.up.railway.app";
  }
  
  // En développement local
  return `http://${window.location.hostname}:9000`;
}

const API_URL = getApiUrl();
console.log("API_URL =", API_URL);

// ── TOKEN ─────────────────────────────────────────────────
function getToken()  { return localStorage.getItem("admin_token"); }
function getUser()   { try { return JSON.parse(localStorage.getItem("admin_user") || "{}"); } catch { return {}; } }
function isLogged()  { return !!getToken(); }

function checkAuth() {
if (!isLogged()) window.location.href = "index.html";
}

// ── REQUÊTES ──────────────────────────────────────────────
async function apiRequest(method, path, body = null) {
const headers = {
"Content-Type": "application/json",
};

const token = getToken();
if (token) headers["Authorization"] = `Bearer ${token}`;

const opts = { method, headers };
if (body) opts.body = JSON.stringify(body);

let res;

try {
res = await fetch(`${API_URL}${path}`, opts);
} catch (e) {
throw new Error(`❌ Impossible de joindre le serveur (${API_URL})`);
}

// ── TOKEN EXPIRE ──
if (res.status === 401) {
localStorage.removeItem("admin_token");
localStorage.removeItem("admin_user");
window.location.href = "index.html";
return;
}

let data = {};
try {
data = await res.json();
} catch (_) {}

if (!res.ok) {
throw new Error(data.detail || data.message || `Erreur ${res.status}`);
}

return data;
}

// ── METHODS ───────────────────────────────────────────────
const apiGet    = (path)       => apiRequest("GET", path);
const apiPost   = (path, body) => apiRequest("POST", path, body);
const apiPut    = (path, body) => apiRequest("PUT", path, body);
const apiDelete = (path)       => apiRequest("DELETE", path);

// ── TOAST ─────────────────────────────────────────────────
function toast(message, type = "success") {
let container = document.getElementById("toast-container");

if (!container) {
container = document.createElement("div");
container.id = "toast-container";
container.style.cssText = `       position:fixed;
      bottom:24px;
      right:24px;
      z-index:9999;
      display:flex;
      flex-direction:column;
      gap:10px;
    `;
document.body.appendChild(container);
}

const t = document.createElement("div");

const colors = {
success: "#80CBC4",
error: "#EF9A9A",
info: "#4FC3F7"
};

const icons = {
success: "✅",
error: "❌",
info: "ℹ️"
};

t.style.cssText = `     padding:14px 18px;
    border-radius:14px;
    font-size:13px;
    font-weight:600;
    background:rgba(13,18,53,0.97);
    color:${colors[type] || colors.info};
    border:1px solid ${(colors[type] || colors.info)}40;
    box-shadow:0 8px 24px rgba(0,0,0,0.4);
    min-width:240px;
  `;

t.textContent = `${icons[type] || ""} ${message}`;

container.appendChild(t);
setTimeout(() => t.remove(), 4000);
}

// ── HELPERS ───────────────────────────────────────────────
function loading(el, show = true) {
if (show) {
el.innerHTML = `       <div style="display:flex;align-items:center;justify-content:center;padding:40px;color:rgba(255,255,255,0.3);gap:10px">         <span style="font-size:20px;animation:spin 1s linear infinite">⟳</span>
        Chargement...       </div>`;
}
}

function formatDate(str) {
if (!str) return "—";
try {
return new Date(str).toLocaleDateString("fr-FR", {
day:"2-digit", month:"short", year:"numeric"
});
} catch {
return str;
}
}

function formatDateTime(str) {
if (!str) return "—";
try {
return new Date(str).toLocaleString("fr-FR", {
day:"2-digit", month:"short",
hour:"2-digit", minute:"2-digit"
});
} catch {
return str;
}
}

function formatFCFA(n) {
return Number(n || 0).toLocaleString("fr-FR") + " FCFA";
}

async function markConversationRead(convId) {
  return await apiPut(`/admin/messagerie/${convId}/read`);
}

// Récupérer les nouveaux messages (polling)
async function getNewMessages(convId, lastId = 0) {
  return await apiGet(`/admin/messagerie/${convId}/poll?last_id=${lastId}`);
}

// Obtenir le nombre de messages non lus total
async function getTotalUnreadMessages() {
  const data = await apiGet("/admin/messagerie/unread-count");
  return data.count || 0;
}
// ── INIT USER UI ──────────────────────────────────────────
function initUserInfo() {
const user = getUser();

const n = document.getElementById("sidebar-user-name");
const r = document.getElementById("sidebar-user-role");
const a = document.getElementById("sidebar-user-avatar");

if (n) n.textContent = user.name || "Admin";
if (r) r.textContent = user.role === "super_admin" ? "Super Admin" : "Admin";
if (a) a.textContent = (user.name || "A").substring(0, 2).toUpperCase();
}
