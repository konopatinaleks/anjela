const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function openDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      preferred_tone TEXT NOT NULL DEFAULT 'playful',
      flirt_level INTEGER NOT NULL DEFAULT 3,
      reply_length TEXT NOT NULL DEFAULT 'short',
      memory_summary TEXT NOT NULL DEFAULT '',
      summarized_upto INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, id);
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, kind, content)
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      message_id INTEGER NOT NULL REFERENCES messages(id),
      rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const q = {
    getUser: db.prepare('SELECT * FROM users WHERE id = ?'),
    insertUser: db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)'),
    insertMessage: db.prepare('INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)'),
    recent: db.prepare('SELECT id, role, content FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?'),
    countMessages: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE user_id = ?'),
    oldMessages: db.prepare('SELECT id, role, content FROM messages WHERE user_id = ? AND id > ? AND id <= ? ORDER BY id'),
    maxIdBefore: db.prepare('SELECT id FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?'),
    insertMemory: db.prepare('INSERT OR IGNORE INTO memories (user_id, kind, content) VALUES (?, ?, ?)'),
    memories: db.prepare('SELECT id, kind, content FROM memories WHERE user_id = ? ORDER BY id DESC LIMIT 200'),
    getMessage: db.prepare('SELECT id, user_id, role, content FROM messages WHERE id = ?'),
    insertFeedback: db.prepare('INSERT INTO feedback (user_id, message_id, rating, comment) VALUES (?, ?, ?, ?)')
  };

  const profileColumns = ['name', 'preferred_tone', 'flirt_level', 'reply_length', 'memory_summary', 'summarized_upto'];

  return {
    raw: db,
    ensureUser(id) {
      q.insertUser.run(id);
      return q.getUser.get(id);
    },
    updateProfile(id, fields) {
      for (const [key, value] of Object.entries(fields)) {
        if (!profileColumns.includes(key)) throw new Error(`Unknown profile field: ${key}`);
        db.prepare(`UPDATE users SET ${key} = ? WHERE id = ?`).run(value, id);
      }
      return q.getUser.get(id);
    },
    addMessage(userId, role, content) {
      return Number(q.insertMessage.run(userId, role, content).lastInsertRowid);
    },
    recentMessages(userId, limit) {
      return q.recent.all(userId, limit).reverse();
    },
    countMessages(userId) {
      return q.countMessages.get(userId).n;
    },
    messagesToSummarize(userId, keepRecent, afterId) {
      const cutoff = q.maxIdBefore.get(userId, keepRecent - 1);
      if (!cutoff) return { messages: [], upto: afterId };
      return { messages: q.oldMessages.all(userId, afterId, cutoff.id - 1), upto: cutoff.id - 1 };
    },
    addMemory(userId, kind, content) {
      return q.insertMemory.run(userId, kind, content).changes > 0;
    },
    listMemories(userId) {
      return q.memories.all(userId);
    },
    getMessage(id) {
      return q.getMessage.get(id);
    },
    addFeedback(userId, messageId, rating, comment) {
      return Number(q.insertFeedback.run(userId, messageId, rating, comment || null).lastInsertRowid);
    }
  };
}

module.exports = { openDb };
