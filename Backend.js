const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Servir frontend
const FRONTEND = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND));

// Pasta de uploads
const UPLOADS = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS);
app.use('/uploads', express.static(UPLOADS));

// ============================================================
// MIDDLEWARE DE AUTENTICAÇÃO SIMPLES (via header)
// ============================================================
function auth(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ erro: 'Não autenticado' });
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ? AND ativo = 1').get(userId);
  if (!u) return res.status(401).json({ erro: 'Usuário inválido' });
  req.usuario = u;
  next();
}

// ============================================================
// LOGIN
// ============================================================
app.post('/api/login', (req, res) => {
  const { login, senha } = req.body;
  if (!login || !senha) return res.status(400).json({ erro: 'Informe login e senha' });

  const u = db.prepare('SELECT * FROM usuarios WHERE login = ? AND ativo = 1').get(login);
  if (!u) return res.status(401).json({ erro: 'Usuário ou senha inválidos' });

  if (!bcrypt.compareSync(senha, u.senha)) {
    return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
  }

  res.json({
    id: u.id, nome: u.nome, login: u.login, perfil: u.perfil
  });
});

// ============================================================
// USUÁRIOS
// ============================================================
app.get('/api/usuarios', auth, (req, res) => {
  if (!['admin','proprietario'].includes(req.usuario.perfil))
    return res.status(403).json({ erro: 'Sem permissão' });
  const lista = db.prepare('SELECT id, nome, login, perfil, ativo, criado_em FROM usuarios ORDER BY id').all();
  res.json(lista);
});

app.post('/api/usuarios', auth, (req, res) => {
  if (!['admin','proprietario'].includes(req.usuario.perfil))
    return res.status(403).json({ erro: 'Sem permissão' });
  const { nome, login, senha, perfil } = req.body;
  if (!nome || !login || !senha) return res.status(400).json({ erro: 'Preencha tudo' });
  const existe = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(login);
  if (existe) return res.status(400).json({ erro: 'Login já existe' });

  const hash = bcrypt.hashSync(senha, 10);
  const info = db.prepare('INSERT INTO usuarios (nome, login, senha, perfil) VALUES (?,?,?,?)')
    .run(nome, login, hash, perfil || 'funcionario');
  const u = db.prepare('SELECT id, nome, login, perfil, criado_em FROM usuarios WHERE id = ?').get(info.lastInsertRowid);
  res.json(u);
});

app.delete('/api/usuarios/:id', auth, (req, res) => {
  if (!['admin','proprietario'].includes(req.usuario.perfil))
    return res.status(403).json({ erro: 'Sem permissão' });
  const id = parseInt(req.params.id);
  if (id === req.usuario.id) return res.status(400).json({ erro: 'Não pode excluir a si mesmo' });
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ============================================================
// CLIENTES
// ============================================================
app.get('/api/clientes', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM clientes ORDER BY nome').all());
});

app.post('/api/clientes', auth, (req, res) => {
  const { nome, telefone, cpf_cnpj, email, endereco } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Informe o nome' });
  const info = db.prepare(`INSERT INTO clientes (nome, telefone, cpf_cnpj, email, endereco) VALUES (?,?,?,?,?)`)
    .run(nome, telefone || '', cpf_cnpj || '', email || '', endereco || '');
  res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/clientes/:id', auth, (req, res) => {
  const { nome, telefone, cpf_cnpj, email, endereco } = req.body;
  db.prepare(`UPDATE clientes SET nome=?, telefone=?, cpf_cnpj=?, email=?, endereco=? WHERE id=?`)
    .run(nome, telefone, cpf_cnpj, email, endereco, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/clientes/:id', auth, (req, res) => {
  db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// PRODUTOS
// ============================================================
app.get('/api/produtos', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM produtos ORDER BY nome').all());
});

app.post('/api/produtos', auth, (req, res) => {
  const { codigo, nome, custo, preco, estoque } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Informe o nome' });
  if (codigo) {
    const existe = db.prepare('SELECT id FROM produtos WHERE codigo = ?').get(codigo);
    if (existe) return res.status(400).json({ erro: 'Código já existe' });
  }
  const info = db.prepare(`INSERT INTO produtos (codigo, nome, custo, preco, estoque) VALUES (?,?,?,?,?)`)
    .run(codigo || null, nome, custo || 0, preco || 0, estoque || 0);

  if (estoque > 0) {
    db.prepare(`INSERT INTO movimentacoes (produto_id, produto_nome, tipo, quantidade, motivo, usuario) VALUES (?,?,?,?,?,?)`)
      .run(info.lastInsertRowid, nome, 'entrada', estoque, 'Cadastro inicial', req.usuario.nome);
  }
  res.json(db.prepare('SELECT * FROM produtos WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/produtos/:id', auth, (req, res) => {
  const { codigo, nome, custo, preco, estoque } = req.body;
  db.prepare(`UPDATE produtos SET codigo=?, nome=?, custo=?, preco=?, estoque=? WHERE id=?`)
    .run(codigo, nome, custo, preco, estoque, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/produtos/:id', auth, (req, res) => {
  db.prepare('DELETE FROM produtos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// MOVIMENTAÇÕES DE ESTOQUE
// ============================================================
app.get('/api/movimentacoes', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM movimentacoes ORDER BY id DESC LIMIT 100').all());
});

app.post('/api/movimentacoes', auth, (req, res) => {
  const { produto_id, tipo, quantidade, motivo } = req.body;
  if (!produto_id || !tipo || !quantidade) return res.status(400).json({ erro: 'Dados incompletos' });

  const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produto_id);
  if (!p) return res.status(404).json({ erro: 'Produto não encontrado' });

  let novoEstoque = p.estoque;
  if (tipo === 'entrada') novoEstoque += quantidade;
  else if (tipo === 'saida') {
    if (quantidade > p.estoque) return res.status(400).json({ erro: 'Estoque insuficiente' });
    novoEstoque -= quantidade;
  } else if (tipo === 'ajuste') novoEstoque = quantidade;

  db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(novoEstoque, produto_id);
  db.prepare(`INSERT INTO movimentacoes (produto_id, produto_nome, tipo, quantidade, motivo, usuario) VALUES (?,?,?,?,?,?)`)
    .run(produto_id, `${p.nome} (${p.codigo || '—'})`, tipo, quantidade, motivo || '—', req.usuario.nome);

  res.json({ ok: true, novo_estoque: novoEstoque });
});

// ============================================================
// ORÇAMENTOS
// ============================================================
app.get('/api/orcamentos', auth, (req, res) => {
  const lista = db.prepare('SELECT * FROM orcamentos ORDER BY id DESC').all();
  lista.forEach(o => {
    o.itens = db.prepare('SELECT * FROM orcamento_itens WHERE orcamento_id = ?').all(o.id);
  });
  res.json(lista);
});

app.post('/api/orcamentos', auth, (req, res) => {
  const { cliente_id, nome_avulso, veiculo, itens } = req.body;
  if (!itens || !itens.length) return res.status(400).json({ erro: 'Adicione itens' });

  const total = itens.reduce((s, it) => s + (parseFloat(it.valor) || 0), 0);
  const info = db.prepare(`INSERT INTO orcamentos (cliente_id, nome_avulso, veiculo, total, status, funcionario) VALUES (?,?,?,?,?,?)`)
    .run(cliente_id || null, nome_avulso || '', veiculo || '', total, 'Pendente', req.usuario.nome);

  const stmt = db.prepare(`INSERT INTO orcamento_itens (orcamento_id, descricao, valor) VALUES (?,?,?)`);
  itens.forEach(it => stmt.run(info.lastInsertRowid, it.desc || it.descricao, it.valor));

  const orc = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(info.lastInsertRowid);
  orc.itens = db.prepare('SELECT * FROM orcamento_itens WHERE orcamento_id = ?').all(orc.id);
  res.json(orc);
});

app.put('/api/orcamentos/:id/status', auth, (req, res) => {
  db.prepare('UPDATE orcamentos SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/orcamentos/:id', auth, (req, res) => {
  db.prepare('DELETE FROM orcamento_itens WHERE orcamento_id = ?').run(req.params.id);
  db.prepare('DELETE FROM orcamentos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// VENDAS
// ============================================================
app.get('/api/vendas', auth, (req, res) => {
  const lista = db.prepare('SELECT * FROM vendas ORDER BY id DESC').all();
  lista.forEach(v => {
    v.itens = db.prepare('SELECT * FROM venda_itens WHERE venda_id = ?').all(v.id);
  });
  res.json(lista);
});

app.post('/api/vendas', auth, (req, res) => {
  const { cliente_id, nome_avulso, itens, pagamento, orcamento_origem } = req.body;
  if (!itens || !itens.length) return res.status(400).json({ erro: 'Adicione itens' });

  let total = 0, totalCusto = 0;
  itens.forEach(it => {
    total += (it.preco || 0) * (it.qtd || 1);
    totalCusto += (it.custo || 0) * (it.qtd || 1);
  });
  const totalLucro = total - totalCusto;

  const transaction = db.transaction(() => {
    const info = db.prepare(`INSERT INTO vendas (cliente_id, nome_avulso, total, total_custo, total_lucro, pagamento, funcionario, orcamento_origem) VALUES (?,?,?,?,?,?,?,?)`)
      .run(cliente_id || null, nome_avulso || '', total, totalCusto, totalLucro, pagamento || 'Dinheiro', req.usuario.nome, orcamento_origem || null);

    const vendaId = info.lastInsertRowid;
    const stmtItem = db.prepare(`INSERT INTO venda_itens (venda_id, tipo, produto_id, nome, codigo, quantidade, preco, custo, subtotal) VALUES (?,?,?,?,?,?,?,?,?)`);
    const stmtMov = db.prepare(`INSERT INTO movimentacoes (produto_id, produto_nome, tipo, quantidade, motivo, usuario) VALUES (?,?,?,?,?,?)`);
    const stmtEst = db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?');

    itens.forEach(it => {
      const subtotal = (it.preco || 0) * (it.qtd || 1);
      stmtItem.run(vendaId, it.tipo, it.prodId || null, it.nome, it.cod || '', it.qtd || 1, it.preco || 0, it.custo || 0, subtotal);

      if (it.tipo === 'produto' && it.prodId) {
        stmtEst.run(it.qtd || 1, it.prodId);
        stmtMov.run(it.prodId, `${it.nome} (${it.cod || '—'})`, 'saida', it.qtd || 1, 'Venda balcão', req.usuario.nome);
      }
    });

    if (orcamento_origem) {
      db.prepare(`UPDATE orcamentos SET status = 'Concluído' WHERE id = ?`).run(orcamento_origem);
    }
    return vendaId;
  });

  const vendaId = transaction();
  const v = db.prepare('SELECT * FROM vendas WHERE id = ?').get(vendaId);
  v.itens = db.prepare('SELECT * FROM venda_itens WHERE venda_id = ?').all(vendaId);
  res.json(v);
});

app.delete('/api/vendas/:id', auth, (req, res) => {
  const id = req.params.id;
  const itens = db.prepare('SELECT * FROM venda_itens WHERE venda_id = ?').all(id);

  const transaction = db.transaction(() => {
    itens.forEach(it => {
      if (it.tipo === 'produto' && it.produto_id) {
        db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(it.quantidade, it.produto_id);
        db.prepare(`INSERT INTO movimentacoes (produto_id, produto_nome, tipo, quantidade, motivo, usuario) VALUES (?,?,?,?,?,?)`)
          .run(it.produto_id, it.nome, 'entrada', it.quantidade, 'Cancelamento de venda', req.usuario.nome);
      }
    });
    db.prepare('DELETE FROM venda_itens WHERE venda_id = ?').run(id);
    db.prepare('DELETE FROM vendas WHERE id = ?').run(id);
  });
  transaction();
  res.json({ ok: true });
});

// ============================================================
// SERVIÇOS
// ============================================================
app.get('/api/servicos', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM servicos ORDER BY id DESC').all());
});

app.post('/api/servicos', auth, (req, res) => {
  const { cliente_id, veiculo, descricao, valor, obs } = req.body;
  if (!cliente_id || !descricao) return res.status(400).json({ erro: 'Informe cliente e descrição' });
  const info = db.prepare(`INSERT INTO servicos (cliente_id, veiculo, descricao, valor, obs, funcionario) VALUES (?,?,?,?,?,?)`)
    .run(cliente_id, veiculo || '', descricao, valor || 0, obs || '', req.usuario.nome);
  res.json(db.prepare('SELECT * FROM servicos WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/servicos/:id/status', auth, (req, res) => {
  db.prepare('UPDATE servicos SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/servicos/:id', auth, (req, res) => {
  db.prepare('DELETE FROM servicos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// FISCAL
// ============================================================
app.get('/api/fiscal', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM fiscal ORDER BY id DESC').all());
});

app.post('/api/fiscal', auth, (req, res) => {
  const { tipo, numero, referencia, valor } = req.body;
  const info = db.prepare(`INSERT INTO fiscal (tipo, numero, referencia, valor) VALUES (?,?,?,?)`)
    .run(tipo, numero, referencia, valor || 0);
  res.json(db.prepare('SELECT * FROM fiscal WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/fiscal/:id', auth, (req, res) => {
  db.prepare('DELETE FROM fiscal WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// CONFIGURAÇÕES
// ============================================================
app.get('/api/config', auth, (req, res) => {
  const c = db.prepare('SELECT * FROM config WHERE id = 1').get();
  res.json(c || {});
});

app.put('/api/config', auth, (req, res) => {
  if (!['admin','proprietario'].includes(req.usuario.perfil))
    return res.status(403).json({ erro: 'Sem permissão' });

  const c = req.body;
  db.prepare(`UPDATE config SET razao=?, fantasia=?, cnpj=?, ie=?, im=?, telefone=?, whatsapp=?, email=?, endereco=?, regime=?, ambiente=?, serie_nfce=?, nfce_on=?, nfse_on=?, layout_padrao=?, rodape=?, logo=?, tema_id=?, cores=?, mensagem_padrao=? WHERE id=1`)
    .run(c.razao||'', c.fantasia||'', c.cnpj||'', c.ie||'', c.im||'', c.telefone||'', c.whatsapp||'', c.email||'', c.endereco||'', c.regime||'', c.ambiente||'homologacao', c.serie_nfce||'1', c.nfce_on?1:0, c.nfse_on?1:0, c.layout_padrao||'pdf', c.rodape||'', c.logo||null, c.tema_id||'azul-classico', c.cores||null, c.mensagem_padrao||'');
  res.json({ ok: true });
});

// ============================================================
// DASHBOARD / RELATÓRIOS
// ============================================================
app.get('/api/dashboard', auth, (req, res) => {
  const vendas = db.prepare('SELECT * FROM vendas').all();
  const orcamentos = db.prepare('SELECT * FROM orcamentos').all();
  const servicos = db.prepare('SELECT * FROM servicos').all();

  const fatVendas = vendas.reduce((s, v) => s + v.total, 0);
  const fatServ = servicos.reduce((s, x) => s + x.valor, 0);
  const custoVendas = vendas.reduce((s, v) => s + (v.total_custo || 0), 0);
  const lucroTotal = fatVendas - custoVendas + fatServ;

  res.json({
    totalOrcamentos: orcamentos.length,
    totalVendas: vendas.length,
    totalServicos: servicos.length,
    faturamento: fatVendas + fatServ,
    lucro: lucroTotal,
    margem: (fatVendas + fatServ) > 0 ? (lucroTotal / (fatVendas + fatServ)) * 100 : 0
  });
});

// ============================================================
// FALLBACK PARA SPA
// ============================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

// ============================================================
// INICIAR
// ============================================================
app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('🔧 SISTEMA DE OFICINA MECÂNICA');
  console.log('═══════════════════════════════════════════════════');
  console.log(`🌐 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`📱 No celular use: http://SEU-IP-LOCAL:${PORT}`);
  console.log('');
  console.log('👤 Login padrão: admin / admin');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
});