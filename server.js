process.env.NODE_OPTIONS = "--dns-result-order=ipv4first";

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =======================
// UPLOAD
// =======================

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (_, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

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
// ATIVIDADES
// =======================

app.get("/atividades/ativas", async (_, res) => {
  const r = await pool.query("SELECT * FROM atividades_ativas");
  res.json(r.rows.map(a => ({ ...a, equipe: a.equipe.split(",") })));
});

app.get("/atividades", async (_, res) => {
  const r = await pool.query("SELECT * FROM atividades");
  res.json(r.rows.map(a => ({
    ...a,
    equipe: a.equipe.split(","),
    fotos: a.fotos ? JSON.parse(a.fotos) : []
  })));
});

app.post("/atividades/inicio", async (req, res) => {
  const { ci, servico, local, equipe, inicio } = req.body;

  const r = await pool.query(`
    INSERT INTO atividades_ativas(ci,servico,local,equipe,inicio)
    VALUES($1,$2,$3,$4,$5) RETURNING id
  `, [ci, servico, local, equipe.join(","), inicio]);

  res.json({ ok: true, id: r.rows[0].id });
});

// =======================
// FINALIZAR (COM FOTO)
// =======================

app.post("/atividades/finalizar", upload.array("fotos"), async (req, res) => {

  const { idAtiva, ci, servico, local, equipe, inicio, relato, fim } = req.body;

  const fotos = req.files.map(f => `/uploads/${f.filename}`);

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
    JSON.stringify(fotos),
    fim
  ]);

  await pool.query("DELETE FROM atividades_ativas WHERE id=$1", [idAtiva]);

  res.json({ ok: true, fotos });
});

// =======================

app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});