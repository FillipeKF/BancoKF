process.env.NODE_OPTIONS = "--dns-result-order=ipv4first";

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// =======================
// CONFIGURAÇÃO
// =======================
const PORT = process.env.PORT || 3000;

// =======================
// CORS
// =======================
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "10mb" }));

// =======================
// SUPABASE
// =======================
const SUPABASE_URL = "https://csujcbotccgylynbxdhu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzdWpjYm90Y2NneWx5bmJ4ZGh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDQwOTUzNiwiZXhwIjoyMDg1OTg1NTM2fQ.m172BDCFK3Hb2AxBOXnYo2Ev49LfEdRujsInQ0xINeI";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =======================
// UPLOAD EM MEMÓRIA
// =======================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// =======================
// POSTGRES (NEON)
// =======================
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_5xEZNaQXO8ye@ep-rapid-pine-acre78eh-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=verify-full",
  ssl: true
});

// =======================
// INIT DB
// =======================
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atividades_ativas(
      id SERIAL PRIMARY KEY,
      ci TEXT,
      servico TEXT,
      local TEXT,
      equipe TEXT,
      inicio TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS atividades(
      id SERIAL PRIMARY KEY,
      ci TEXT,
      servico TEXT,
      local TEXT,
      equipe TEXT,
      inicio TEXT,
      relato TEXT,
      fotos TEXT,
      fim TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios(
      id SERIAL PRIMARY KEY,
      usuario TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      ativo BOOLEAN DEFAULT TRUE,
      permissao TEXT DEFAULT 'user'
    );
  `);

  await pool.query(`
    INSERT INTO usuarios(usuario, senha, ativo, permissao)
    VALUES('Fabio', 'KF123', true, 'almoxarifado')
    ON CONFLICT(usuario) DO NOTHING;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS itens(
      id SERIAL PRIMARY KEY,
      nome TEXT,
      quantidade INTEGER,
      setor TEXT
    );
  `);

  console.log("Postgres conectado e tabelas ok");
}

initDB();

// =======================
// MIDDLEWARE - Verifica permissão almoxarifado
// Espera { usuario } no body e consulta o banco
// =======================
async function checkAlmoxarifado(req, res, next) {
  const { usuario } = req.body;
  if (!usuario) return res.status(400).json({ ok: false, error: "Usuário não informado" });

  try {
    const r = await pool.query(
      "SELECT permissao FROM usuarios WHERE UPPER(usuario)=$1 AND ativo=true",
      [usuario.trim().toUpperCase()]
    );
    if (!r.rows[0] || r.rows[0].permissao !== "almoxarifado") {
      return res.status(403).json({ ok: false, error: "Acesso negado" });
    }
    next();
  } catch (err) {
    console.error("checkAlmoxarifado ERRO:", err);
    res.status(500).json({ ok: false, error: "Erro ao verificar permissão" });
  }
}

// =======================
// ROTAS
// =======================

// Login
app.post("/login", async (req, res) => {
  try {
    let { usuario, senha } = req.body;
    if (!usuario || !senha)
      return res.status(400).json({ ok: false, error: "Usuário e senha obrigatórios" });

    // Converte para maiúsculas
    usuario = usuario.trim().toUpperCase();
    senha = senha.trim().toUpperCase();

    const r = await pool.query(
      "SELECT * FROM usuarios WHERE UPPER(usuario)=$1 AND UPPER(senha)=$2 AND ativo=true",
      [usuario, senha]
    );

    if (!r.rows[0]) {
      return res.status(401).json({ ok: false, error: "Usuário ou senha inválidos" });
    }

    res.json({
      ok: true,
      usuario: r.rows[0].usuario,
      permissao: r.rows[0].permissao
    });
  } catch (err) {
    console.error("LOGIN ERRO:", err);
    res.status(500).json({ ok: false, error: "Erro no servidor" });
  }
});

// Listar atividades ativas
app.get("/atividades/ativas", async (_, res) => {
  try {
    const r = await pool.query("SELECT * FROM atividades_ativas");
    res.json(r.rows.map(a => ({ ...a, equipe: a.equipe.split(",") })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar atividades ativas." });
  }
});

// Listar atividades concluídas
app.get("/atividades", async (_, res) => {
  try {
    const r = await pool.query("SELECT * FROM atividades");
    res.json(r.rows.map(a => ({
      ...a,
      equipe: a.equipe.split(","),
      fotos: a.fotos ? JSON.parse(a.fotos) : []
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar atividades." });
  }
});

// Iniciar atividade
app.post("/atividades/inicio", async (req, res) => {
  try {
    const { ci, servico, local, equipe, inicio } = req.body;

    const existe = await pool.query(`
      SELECT 1 FROM atividades_ativas WHERE ci = $1
      UNION
      SELECT 1 FROM atividades WHERE ci = $1
      LIMIT 1
    `, [ci]);

    if (existe.rowCount > 0) {
      return res.status(409).json({ error: "CI já registrada" });
    }

    const r = await pool.query(`
      INSERT INTO atividades_ativas(ci, servico, local, equipe, inicio)
      VALUES($1,$2,$3,$4,$5)
      RETURNING id
    `, [ci, servico, local, equipe, inicio]);

    res.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    console.error("INICIO ERRO REAL:", err);
    res.status(500).json({ error: "Erro ao registrar atividade", detalhe: String(err) });
  }
});

// Finalizar atividade
app.post("/atividades/finalizar", upload.array("fotos"), async (req, res) => {
  try {
    const idAtiva = Number(req.body.idAtiva);
    if (!idAtiva) throw "ID ATIVA NÃO RECEBIDO";

    const { ci, servico, local, equipe, inicio, relato, fim } = req.body;

    let fotosURLs = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const fileName = `${Date.now()}-${file.originalname}`;
        const { error } = await supabase.storage.from("uploads").upload(fileName, file.buffer, { contentType: file.mimetype });
        if (error) throw error;

        const { data } = supabase.storage.from("uploads").getPublicUrl(fileName);
        fotosURLs.push(data.publicUrl);
      }
    }

    await pool.query(`
      INSERT INTO atividades(ci, servico, local, equipe, inicio, relato, fotos, fim)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    `, [ci, servico, local, equipe, inicio, relato || "-", JSON.stringify(fotosURLs), fim]);

    await pool.query("DELETE FROM atividades_ativas WHERE id = $1", [idAtiva]);

    res.json({ ok: true, fotos: fotosURLs });
  } catch (err) {
    console.error("FINALIZAR ERRO REAL:", err);
    res.status(500).json({ error: "Falha ao finalizar atividade", detalhe: String(err) });
  }
});

// Listar itens
app.get("/itens", async (_, res) => {
  try {
    const r = await pool.query("SELECT * FROM itens ORDER BY id DESC");
    res.json(r.rows);
  } catch (err) {
    console.error("GET ITENS:", err);
    res.status(500).json({ error: "Erro ao buscar itens" });
  }
});

// Criar item (somente almoxarifado)
app.post("/itens", checkAlmoxarifado, async (req, res) => {
  try {
    const { nome, quantidade, setor } = req.body;
    await pool.query("INSERT INTO itens(nome, quantidade, setor) VALUES($1,$2,$3)", [nome, quantidade, setor]);
    res.json({ ok: true });
  } catch (err) {
    console.error("POST ITEM:", err);
    res.status(500).json({ error: "Erro ao salvar item", detalhe: String(err) });
  }
});

// Editar item (somente almoxarifado)
app.put("/itens/:id", checkAlmoxarifado, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, quantidade, setor } = req.body;
    if (!nome || !quantidade || !setor)
      return res.status(400).json({ ok: false, error: "Todos os campos são obrigatórios" });

    await pool.query(
      "UPDATE itens SET nome=$1, quantidade=$2, setor=$3 WHERE id=$4",
      [nome, quantidade, setor, id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("EDIT ITEM:", err);
    res.status(500).json({ error: "Erro ao editar item", detalhe: String(err) });
  }
});

// Deletar item (somente almoxarifado)
app.delete("/itens/:id", checkAlmoxarifado, async (req, res) => {
  try {
    await pool.query("DELETE FROM itens WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE ITEM:", err);
    res.status(500).json({ error: "Erro ao excluir", detalhe: String(err) });
  }
});

// Backup de atividades por mês/ano
app.get("/atividades/backup", async (req, res) => {
  try {
    const { mes, ano } = req.query;
    const r = await pool.query("SELECT * FROM atividades");
    const filtered = r.rows.filter(a => {
      const d = new Date(a.inicio);
      return (d.getMonth() + 1 == Number(mes)) && (d.getFullYear() == Number(ano));
    });
    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar CIs" });
  }
});

// Apagar atividades por ids
app.post("/atividades/apagar", async (req, res) => {
  try {
    const { ids } = req.body;
    for (const id of ids) {
      const r = await pool.query("SELECT fotos FROM atividades WHERE id=$1", [id]);
      if (r.rows[0]?.fotos) {
        const fotos = JSON.parse(r.rows[0].fotos);
        for (const url of fotos) {
          const fileName = url.split("/").pop();
          await supabase.storage.from("uploads").remove([fileName]);
        }
      }
      await pool.query("DELETE FROM atividades WHERE id=$1", [id]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao apagar CIs" });
  }
});

// =======================
// INICIAR SERVIDOR
// =======================
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
