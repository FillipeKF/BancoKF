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
const SUPABASE_URL = "https://csujcbotccgylynbxdhu.supabase.co"; // coloque seu URL
const SUPABASE_KEY = "<eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzdWpjYm90Y2NneWx5bmJ4ZGh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDQwOTUzNiwiZXhwIjoyMDg1OTg1NTM2fQ.m172BDCFK3Hb2AxBOXnYo2Ev49LfEdRujsInQ0xINeI>"; // service key recomendada para uploads
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =======================
// UPLOAD EM MEMÓRIA
// =======================
const storage = multer.memoryStorage(); // nada salvo localmente
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

  console.log("Postgres conectado e tabelas ok");
}

initDB();

// =======================
// ROTAS
// =======================

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
  const { ci, servico, local, equipe, inicio } = req.body;

  try {
    const r = await pool.query(`
      INSERT INTO atividades_ativas(ci,servico,local,equipe,inicio)
      VALUES($1,$2,$3,$4,$5) RETURNING id
    `, [ci, servico, local, equipe.join(","), inicio]);

    res.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao registrar atividade." });
  }
});

app.post("/atividades/finalizar", upload.array("fotos"), async (req, res) => {

  try {

    const idAtiva = Number(req.body.idAtiva);
const { ci, servico, local, equipe, inicio, relato, fim } = req.body;

    let fotosURLs = [];

    if (req.files && req.files.length > 0) {

      for (const file of req.files) {

        const fileName = `${Date.now()}-${file.originalname}`;

        const { error } = await supabase.storage
          .from("uploads")
          .upload(fileName, file.buffer, {
            contentType: file.mimetype
          });

        if (error) throw error;

        const { data } = supabase
          .storage
          .from("uploads")
          .getPublicUrl(fileName);

        fotosURLs.push(data.publicUrl);
      }
    }

    // INSERT CONCLUÍDA
    await pool.query(`
      INSERT INTO atividades(ci,servico,local,equipe,inicio,relato,fotos,fim)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      ci,
      servico,
      local,
      equipe,
      inicio,
      relato || "-",
      JSON.stringify(fotosURLs),
      fim
    ]);


console.log("DELETANDO ATIVA ID:", idAtiva);
    // REMOVE DAS ATIVAS
  await pool.query(
  "DELETE FROM atividades_ativas WHERE id = $1",
  [idAtiva]
);

    res.json({
      ok: true,
      fotos: fotosURLs
    });

  } catch (err) {

    console.error("FINALIZAR ERRO:", err);

    res.status(500).json({
      error: "Falha ao finalizar atividade"
    });

  }

});

// =======================
// INICIAR SERVIDOR
// =======================
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
