const { Pool } = require('pg');

// Conector do PostgreSQL usando a variável de ambiente DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Diagnóstico de Conexão DB
pool.on('connect', () => {
  console.log('[SUCCESS] PostgreSQL: Conexão estabelecida com o banco de dados.');
});

pool.on('error', (err) => {
  console.error('[CRITICAL] PostgreSQL: Erro inesperado no cliente do pool:', err.message);
});

/**
 * Inicializa a estrutura do banco de dados se necessário.
 */
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
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
    try {
      const query = 'INSERT INTO users (username, score) VALUES ($1, 0) ON CONFLICT (username) DO NOTHING';
      await pool.query(query, [username]);
    } catch (err) {
      console.error('[DB] Erro ao garantir usuário:', err.message);
    }
  },

  /**
   * Adiciona pontos ao usuário.
   */
  addScore: async (username, points) => {
    try {
      const query = 'UPDATE users SET score = score + $1 WHERE username = $2';
      await pool.query(query, [points, username]);
    } catch (err) {
      console.error('[DB] Erro ao adicionar pontuação:', err.message);
    }
  },

  /**
   * Retorna os 10 melhores jogadores.
   * SEMPRE retorna um array, mesmo em caso de erro ou tabela vazia.
   */
  getRanking: async () => {
    try {
      const query = 'SELECT username, score FROM users ORDER BY score DESC LIMIT 10';
      const res = await pool.query(query);
      return Array.isArray(res.rows) ? res.rows : [];
    } catch (err) {
      console.error('[DB] Erro ao buscar ranking:', err.message);
      return [];
    }
  }
};

module.exports = {
  pool,
  ...DatabaseOps
};
