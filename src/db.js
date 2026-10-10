const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PROFILE_COLUMNS = ['name', 'preferred_tone', 'flirt_level', 'reply_length', 'memory_summary', 'summarized_upto'];
const TONES = new Set(['playful', 'warm', 'cold', 'dominant']);
const LENGTHS = new Set(['short', 'medium', 'long']);

function assertProfileField(key, value) {
  if (!PROFILE_COLUMNS.includes(key)) throw new Error(`Unknown profile field: ${key}`);
  if (key === 'preferred_tone' && !TONES.has(value)) throw new Error('Invalid tone');
  if (key === 'reply_length' && !LENGTHS.has(value)) throw new Error('Invalid reply length');
  if (key === 'flirt_level' && (!Number.isInteger(value) || value < 1 || value > 5)) {
    throw new Error('Invalid flirt level');
  }
}

function openDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      preferred_tone TEXT NOT NULL DEFAULT 'playful',
      flirt_level INTEGER NOT NULL DEFAULT 3 CHECK (flirt_level BETWEEN 1 AND 5),
      reply_length TEXT NOT NULL DEFAULT 'short',
      memory_summary TEXT NOT NULL DEFAULT '',
      summarized_upto INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, id);
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, kind, content)
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, message_id)
    );
  `);

  const q = {
    getUser: db.prepare('SELECT * FROM users WHERE id = ?'),
    insertUser: db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    insertMessage: db.prepare('INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)'),
    recent: db.prepare('SELECT id, role, content FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?'),
    history: db.prepare(`
      SELECT m.id, m.role, m.content, f.rating
      FROM messages m
      LEFT JOIN feedback f ON f.message_id = m.id AND f.user_id = m.user_id
      WHERE m.user_id = ?
      ORDER BY m.id DESC
      LIMIT ?
    `),
    countMessages: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE user_id = ?'),
    oldMessages: db.prepare('SELECT id, role, content FROM messages WHERE user_id = ? AND id > ? AND id < ? ORDER BY id'),
    cutoff: db.prepare('SELECT id FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?'),
    insertMemory: db.prepare('INSERT OR IGNORE INTO memories (user_id, kind, content) VALUES (?, ?, ?)'),
    deleteFeedbackMemory: db.prepare('DELETE FROM memories WHERE user_id = ? AND content LIKE ?'),
    memories: db.prepare('SELECT id, kind, content FROM memories WHERE user_id = ? ORDER BY id DESC LIMIT 200'),
    getMessage: db.prepare('SELECT id, user_id, role, content FROM messages WHERE id = ?'),
    getFeedback: db.prepare('SELECT rating, comment FROM feedback WHERE user_id = ? AND message_id = ?'),
    upsertFeedback: db.prepare(`
      INSERT INTO feedback (user_id, message_id, rating, comment)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, message_id) DO UPDATE SET
        rating = excluded.rating,
        comment = excluded.comment,
        created_at = CURRENT_TIMESTAMP
    `)
  };

  return {
    raw: db,
    close() {
      db.close();
    },
    ensureUser(id) {
      q.insertUser.run(id);
      return q.getUser.get(id);
    },
    getUser(id) {
      return q.getUser.get(id);
    },
    deleteUser(id) {
      return q.deleteUser.run(id).changes > 0;
    },
    updateProfile(id, fields) {
      for (const [key, value] of Object.entries(fields)) {
        assertProfileField(key, value);
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
    history(userId, limit) {
      return q.history.all(userId, limit).reverse();
    },
    countMessages(userId) {
      return Number(q.countMessages.get(userId).n);
    },
    messagesToSummarize(userId, keepRecent, afterId) {
      const boundary = q.cutoff.get(userId, Math.max(0, keepRecent - 1));
      if (!boundary || boundary.id <= afterId) return { messages: [], upto: afterId };
      return {
        messages: q.oldMessages.all(userId, afterId, boundary.id),
        upto: boundary.id - 1
      };
    },
    addMemory(userId, kind, content) {
      return q.insertMemory.run(userId, kind, content).changes > 0;
    },
    replaceFeedbackMemory(userId, messageId, kind, content) {
      q.deleteFeedbackMemory.run(userId, `fb:${messageId}|%`);
      return q.insertMemory.run(userId, kind, content).changes > 0;
    },
    listMemories(userId) {
      return q.memories.all(userId);
    },
    getMessage(id) {
      return q.getMessage.get(id);
    },
    getFeedback(userId, messageId) {
      return q.getFeedback.get(userId, messageId);
    },
    upsertFeedback(userId, messageId, rating, comment) {
      q.upsertFeedback.run(userId, messageId, rating, comment || null);
    }
  };
}

module.exports = { openDb };
