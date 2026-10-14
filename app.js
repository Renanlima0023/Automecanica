/* ============================================================
   API HELPER
   ============================================================ */
const API = '/api';
let usuarioAtual = null;

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (usuarioAtual) h['x-user-id'] = usuarioAtual.id;
  return h;
}

async function apiGet(path) {
  const r = await fetch(API + path, { headers: headers() });
  if (!r.ok) throw new Error((await r.json()).erro || 'Erro');
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(API + path, {
    method: 'POST', headers: headers(), body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error((await r.json()).erro || 'Erro');
  return r.json();
}
async function apiPut(path, body) {
  const r = await fetch(API + path, {
    method: 'PUT', headers: headers(), body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error((await r.json()).erro || 'Erro');
  return r.json();
}
async function apiDelete(path) {
  const r = await fetch(API + path, { method: 'DELETE', headers: headers() });
  if (!r.ok) throw new Error((await r.json()).erro || 'Erro');
  return r.json();
}

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
let db = {
  usuarios: [], clientes: [], produtos: [], orcamentos: [],
  vendas: [], servicos: [], fiscal: [], movimentacoes: [],
  config: {},
  dashboard: {}
};
let itensOrcTemp = [];
let itensVendaTemp = [];
let vendaParaImprimir = null;
let orcamentoCarregado = null;
let itemParaEnvio = null;
let filtroLucros = { dataIni: null, dataFim: null };
window._origemClienteRapido = 'venda';

/* ============================================================
   TEMAS
   ============================================================ */
const TEMAS = [
  { id: 'azul-classico', nome: 'Azul Clássico', primaria: '#1e3c72', secundaria: '#2a5298', acento: '#f39c12' },
  { id: 'verde-mecanica', nome: 'Verde Mecânica', primaria: '#1e8449', secundaria: '#27ae60', acento: '#f1c40f' },
  { id: 'vermelho-venda', nome: 'Vermelho Venda', primaria: '#922b21', secundaria: '#c0392b', acento: '#f39c12' },
  { id: 'roxo-premium', nome: 'Roxo Premium', primaria: '#4a148c', secundaria: '#6a1b9a', acento: '#ff6f00' },
  { id: 'cinza-industrial', nome: 'Cinza Industrial', primaria: '#2c3e50', secundaria: '#34495e', acento: '#e67e22' },
  { id: 'laranja-automotivo', nome: 'Laranja Automotivo', primaria: '#d35400', secundaria: '#e67e22', acento: '#2c3e50' },
  { id: 'preto-elegante', nome: 'Preto Elegante', primaria: '#212121', secundaria: '#424242', acento: '#ffc107' },
  { id: 'azul-turquesa', nome: 'Azul Turquesa', primaria: '#006064', secundaria: '#0097a7', acento: '#ff6f00' }
];
