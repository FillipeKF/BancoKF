process.env.NODE_OPTIONS = "--dns-result-order=ipv4first";

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// =======================
// CONFIGURAÇÃO
// =======================
const PORT = process.env.PORT || 3000;

// CORS
app.use(cors({
  origin: "*",
  methods: ["GET","POST","DELETE","PUT","OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "10mb" }));

// =======================
// SUPABASE
// =======================
const SUPABASE_URL = "https://<SEU-PROJETO>.supabase.co";
const SUPABASE_KEY = "<SUA-CHAVE-ANON-OU-SERVICE>";
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

// Ativas
app.get("/atividades/ativas", async (_, res) => {
  const r = await pool.query("SELECT * FROM atividades_ativas");
  res.json(r.rows.map(a => ({ ...a, equipe: a.equipe.split(",") })));
});

// Concluídas
app.get("/atividades", async (_, res) => {
  const r = await pool.query("SELECT * FROM atividades");
  res.json(r.rows.map(a => ({
    ...a,
    equipe: a.equipe.split(","),
    fotos: a.fotos ? JSON.parse(a.fotos) : []
  })));
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
    console.error("Erro ao registrar atividade:", err);
    res.status(500).json({ error: "Erro ao registrar atividade." });
  }
});

// Finalizar atividade com upload no Supabase
app.post("/atividades/finalizar", upload.array("fotos"), async (req, res) => {
  const { idAtiva, ci, servico, local, equipe, inicio, relato, fim } = req.body;

  try {
    const fotosURLs = [];

    for (let file of req.files) {
      const fileName = `${Date.now()}-${file.originalname}`;
      const { error } = await supabase.storage
        .from("uploads")
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: true
        });

      if (error) {
        console.error("Erro no upload Supabase:", error);
        return res.status(500).json({ error: "Erro ao enviar foto." });
      }

      const { publicUrl } = supabase.storage.from("uploads").getPublicUrl(fileName);
      fotosURLs.push(publicUrl);
    }

    await pool.query(`
      INSERT INTO atividades(ci,servico,local,equipe,inicio,relato,fotos,fim)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      ci,
      servico,
      local,
      equipe.join(","),
      inicio,
      relato || "-",
      JSON.stringify(fotosURLs),
      fim
    ]);

    await pool.query("DELETE FROM atividades_ativas WHERE id=$1", [idAtiva]);

    res.json({ ok: true, fotos: fotosURLs });
  } catch (err) {
    console.error("Erro ao finalizar atividade:", err);
    res.status(500).json({ error: "Erro ao finalizar atividade." });
  }
});

// =======================
// INICIAR SERVIDOR
// =======================
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
