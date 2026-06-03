'use strict';
const Database = require('better-sqlite3');
const path     = require('path');
const bcrypt   = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'quiz.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ──────────────────────────────────────────
//  SCHEMA
// ──────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'student',
    name          TEXT    NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS inference_rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    symbol      TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category    TEXT NOT NULL DEFAULT 'propositional'
  );

  CREATE TABLE IF NOT EXISTS questions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    type          TEXT    NOT NULL,
    title         TEXT    NOT NULL DEFAULT '',
    question_text TEXT    NOT NULL,
    metadata      TEXT    NOT NULL DEFAULT '{}',
    points        INTEGER NOT NULL DEFAULT 10,
    created_by    INTEGER,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS quiz_sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    time_limit   INTEGER NOT NULL DEFAULT 3600,
    question_ids TEXT    NOT NULL DEFAULT '[]',
    settings     TEXT    NOT NULL DEFAULT '{}',
    status       TEXT    NOT NULL DEFAULT 'pending',
    start_time   INTEGER,
    end_time     INTEGER,
    created_by   INTEGER,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id     INTEGER NOT NULL,
    student_id     INTEGER NOT NULL,
    answers        TEXT    NOT NULL DEFAULT '{}',
    graded_answers TEXT    NOT NULL DEFAULT '{}',
    total_score    REAL    NOT NULL DEFAULT 0,
    submitted_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (session_id)  REFERENCES quiz_sessions(id),
    FOREIGN KEY (student_id)  REFERENCES users(id),
    UNIQUE (session_id, student_id)
  );
`);

// ──────────────────────────────────────────
//  SEED DEFAULT ACCOUNTS
// ──────────────────────────────────────────
if (!db.prepare('SELECT id FROM users WHERE username = ?').get('instructor')) {
  db.prepare('INSERT INTO users (username, password_hash, role, name) VALUES (?,?,?,?)')
    .run('instructor', bcrypt.hashSync('logic2024', 10), 'instructor', 'Instructor');
  console.log('Default instructor created  →  username: instructor  |  password: logic2024');
}

// ──────────────────────────────────────────
//  PREPARED STATEMENTS
// ──────────────────────────────────────────
const stmt = {
  // Users
  getUserByUsername:  db.prepare('SELECT * FROM users WHERE username = ?'),
  getUserById:        db.prepare('SELECT * FROM users WHERE id = ?'),
  getAllStudents:      db.prepare("SELECT id, username, name, role FROM users WHERE role = 'student' ORDER BY name"),
  insertUser:         db.prepare('INSERT INTO users (username, password_hash, role, name) VALUES (?,?,?,?)'),
  updatePassword:     db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  deleteUser:         db.prepare("DELETE FROM users WHERE id = ? AND role = 'student'"),

  // Inference Rules
  getAllRules:   db.prepare('SELECT * FROM inference_rules ORDER BY category, name'),
  getRuleById:  db.prepare('SELECT * FROM inference_rules WHERE id = ?'),
  insertRule:   db.prepare('INSERT INTO inference_rules (name, symbol, description, category) VALUES (?,?,?,?)'),
  updateRule:   db.prepare('UPDATE inference_rules SET name=?, symbol=?, description=?, category=? WHERE id=?'),
  deleteRule:   db.prepare('DELETE FROM inference_rules WHERE id = ?'),

  // Questions
  getAllQuestions: db.prepare('SELECT * FROM questions ORDER BY created_at DESC'),
  getQuestion:    db.prepare('SELECT * FROM questions WHERE id = ?'),
  insertQuestion: db.prepare('INSERT INTO questions (type, title, question_text, metadata, points, created_by) VALUES (?,?,?,?,?,?)'),
  updateQuestion: db.prepare('UPDATE questions SET type=?, title=?, question_text=?, metadata=?, points=? WHERE id=?'),
  deleteQuestion: db.prepare('DELETE FROM questions WHERE id = ?'),

  // Sessions
  getAllSessions:    db.prepare('SELECT * FROM quiz_sessions ORDER BY created_at DESC'),
  getSession:       db.prepare('SELECT * FROM quiz_sessions WHERE id = ?'),
  getActiveSession: db.prepare("SELECT * FROM quiz_sessions WHERE status = 'active' LIMIT 1"),
  insertSession:    db.prepare('INSERT INTO quiz_sessions (name, time_limit, question_ids, settings, status, created_by) VALUES (?,?,?,?,?,?)'),
  updateSession:    db.prepare(`
    UPDATE quiz_sessions
    SET name         = COALESCE(?, name),
        time_limit   = COALESCE(?, time_limit),
        question_ids = COALESCE(?, question_ids),
        settings     = COALESCE(?, settings)
    WHERE id = ?
  `),
  startSession:     db.prepare('UPDATE quiz_sessions SET status=?, start_time=?, end_time=? WHERE id=?'),
  setSessionStatus: db.prepare("UPDATE quiz_sessions SET status = ? WHERE id = ?"),
  deleteSession:    db.prepare('DELETE FROM quiz_sessions WHERE id = ?'),

  // Submissions
  insertSubmission:          db.prepare('INSERT INTO submissions (session_id, student_id, answers, graded_answers, total_score, submitted_at) VALUES (?,?,?,?,?,?)'),
  getSubmissionByStudentSess:db.prepare('SELECT * FROM submissions WHERE student_id=? AND session_id=?'),
  getSubmissionById:         db.prepare('SELECT * FROM submissions WHERE id=?'),
  getSubmissionsBySession:   db.prepare(`
    SELECT s.*, u.name AS student_name, u.username
    FROM submissions s
    JOIN users u ON s.student_id = u.id
    WHERE s.session_id = ?
    ORDER BY s.submitted_at
  `),
  getAllSubmissions:          db.prepare(`
    SELECT s.*, u.name AS student_name, u.username, q.name AS session_name
    FROM submissions s
    JOIN users u ON s.student_id = u.id
    JOIN quiz_sessions q ON s.session_id = q.id
    ORDER BY s.submitted_at DESC
  `),
  getStudentSubmissions:     db.prepare(`
    SELECT s.*, q.name AS session_name
    FROM submissions s
    JOIN quiz_sessions q ON s.session_id = q.id
    WHERE s.student_id = ?
    ORDER BY s.submitted_at DESC
  `),
  updateSubmissionGrades:    db.prepare('UPDATE submissions SET graded_answers=?, total_score=? WHERE id=?'),
};

// ──────────────────────────────────────────
//  EXPORTS
// ──────────────────────────────────────────
module.exports = {
  // ── Users ──
  getUserByUsername: (u) => stmt.getUserByUsername.get(u),
  getUserById:       (id) => stmt.getUserById.get(id),
  getAllStudents:     () => stmt.getAllStudents.all(),
  createUser: ({ username, password_hash, role, name }) => {
    const r = stmt.insertUser.run(username, password_hash, role, name);
    return r.lastInsertRowid;
  },
  updateUserPassword: (id, hash) => stmt.updatePassword.run(hash, id),
  deleteUser: (id) => stmt.deleteUser.run(id),

  // ── Inference Rules ──
  getAllRules: () => stmt.getAllRules.all(),
  createRule: ({ name, symbol, description, category }) => {
    const r = stmt.insertRule.run(name, symbol, description, category);
    return r.lastInsertRowid;
  },
  updateRule: (id, data) => {
    const existing = stmt.getRuleById.get(id);
    if (!existing) return;
    stmt.updateRule.run(data.name ?? existing.name, data.symbol ?? existing.symbol,
      data.description ?? existing.description, data.category ?? existing.category, id);
  },
  deleteRule: (id) => stmt.deleteRule.run(id),

  // ── Questions ──
  getAllQuestions: () => stmt.getAllQuestions.all(),
  getQuestion: (id) => stmt.getQuestion.get(id),
  createQuestion: ({ type, title, question_text, metadata, points, created_by }) => {
    const r = stmt.insertQuestion.run(type, title, question_text, JSON.stringify(metadata || {}), points, created_by);
    return r.lastInsertRowid;
  },
  updateQuestion: (id, data) => {
    const existing = stmt.getQuestion.get(id);
    if (!existing) return;
    stmt.updateQuestion.run(
      data.type          ?? existing.type,
      data.title         ?? existing.title,
      data.question_text ?? existing.question_text,
      JSON.stringify(data.metadata ?? JSON.parse(existing.metadata || '{}')),
      data.points        ?? existing.points,
      id
    );
  },
  deleteQuestion: (id) => stmt.deleteQuestion.run(id),

  // ── Sessions ──
  getAllSessions: () => stmt.getAllSessions.all(),
  getSession: (id) => stmt.getSession.get(id),
  getActiveSession: () => stmt.getActiveSession.get(),
  createSession: ({ name, time_limit, question_ids, settings, created_by }) => {
    const r = stmt.insertSession.run(name, time_limit, question_ids, settings, 'pending', created_by);
    return r.lastInsertRowid;
  },
  updateSession: (id, data) => {
    stmt.updateSession.run(data.name || null, data.time_limit || null, data.question_ids || null, data.settings || null, id);
  },
  startSession: (id, startTime, endTime) => stmt.startSession.run('active', startTime, endTime, id),
  setSessionStatus: (id, status) => stmt.setSessionStatus.run(status, id),
  deleteSession: (id) => stmt.deleteSession.run(id),

  // ── Submissions ──
  createSubmission: ({ session_id, student_id, answers, graded_answers, total_score, submitted_at }) => {
    const r = stmt.insertSubmission.run(session_id, student_id, answers, graded_answers, total_score, submitted_at);
    return r.lastInsertRowid;
  },
  getSubmissionByStudentSession: (student_id, session_id) => stmt.getSubmissionByStudentSess.get(student_id, session_id),
  getSubmissionById: (id) => stmt.getSubmissionById.get(id),
  getSubmissionsBySession: (session_id) => stmt.getSubmissionsBySession.all(session_id),
  getAllSubmissions: () => stmt.getAllSubmissions.all(),
  getStudentSubmissions: (student_id) => stmt.getStudentSubmissions.all(student_id),
  updateSubmissionGrades: (id, graded_answers, total_score) => stmt.updateSubmissionGrades.run(graded_answers, total_score, id),
};
