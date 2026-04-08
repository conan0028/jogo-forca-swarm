const { Pool } = require('pg');

// Conector do PostgreSQL usando a variável de ambiente DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Inicializa a estrutura do banco de dados se necessário.
 */
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        score INTEGER DEFAULT 0
      )
    `);
    console.log("PostgreSQL: Tabela 'users' pronta.");
  } catch (err) {
    console.error("Erro ao inicializar PostgreSQL:", err.message);
  }
}

initDb();

/**
 * Operações do Banco de Dados
 */
const DatabaseOps = {
  /**
   * Registra o usuário se não existir.
   */
  ensureUser: async (username) => {
    const query = 'INSERT INTO users (username, score) VALUES ($1, 0) ON CONFLICT (username) DO NOTHING';
    await pool.query(query, [username]);
  },

  /**
   * Adiciona pontos ao usuário.
   */
  addScore: async (username, points) => {
    const query = 'UPDATE users SET score = score + $1 WHERE username = $2';
    await pool.query(query, [points, username]);
  },

  /**
   * Retorna os 10 melhores jogadores.
   */
  getRanking: async () => {
    const query = 'SELECT username, score FROM users ORDER BY score DESC LIMIT 10';
    const res = await pool.query(query);
    return res.rows;
  }
};

module.exports = {
  pool,
  ...DatabaseOps
};
