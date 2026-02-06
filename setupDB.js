const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Cria a pasta db se não existir
if (!fs.existsSync('./db')) fs.mkdirSync('./db');

// Cria ou abre o banco
const db = new sqlite3.Database('./db/database.sqlite', (err) => {
    if (err) return console.error(err.message);
    console.log('Banco SQLite criado ou aberto com sucesso!');
});

// Cria as tabelas
db.serialize(() => {
    // Tabela de atividades
    db.run(`CREATE TABLE IF NOT EXISTS atividades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ci TEXT,
        servico TEXT,
        local TEXT,
        equipe TEXT,
        inicio TEXT,
        relato TEXT,
        fotos TEXT,
        fim TEXT
    )`, () => console.log('Tabela "atividades" pronta.'));

    // Tabela do almoxarifado
    db.run(`CREATE TABLE IF NOT EXISTS almoxarifado (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        quantidade INTEGER,
        setor TEXT
    )`, () => console.log('Tabela "almoxarifado" pronta.'));

    // Inserir itens de exemplo no almoxarifado
    const stmt = db.prepare(`INSERT INTO almoxarifado (nome, quantidade, setor) VALUES (?, ?, ?)`);

    const itensExemplo = [
        { nome: 'Tinta Vermelha', quantidade: 10, setor: 'Pintura' },
        { nome: 'Fios Elétricos', quantidade: 20, setor: 'Elétrica' },
        { nome: 'Canos PVC', quantidade: 15, setor: 'Hidráulica' },
        { nome: 'Cimento', quantidade: 50, setor: 'Civil' }
    ];

    itensExemplo.forEach(i => stmt.run(i.nome, i.quantidade, i.setor));
    stmt.finalize(() => console.log('Itens de exemplo adicionados ao almoxarifado.'));
});

db.close(() => console.log('Configuração do banco finalizada!'));
