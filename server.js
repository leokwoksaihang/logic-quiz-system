'use strict';
const express = require('express');
const path    = require('path');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const db      = require('./db');
const { gradeAnswer } = require('./grader');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'logic-quiz-jwt-secret-change-in-prod';
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────
//  AUTH MIDDLEWARE
// ──────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function instructorOnly(req, res, next) {
  if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Instructor only' });
  next();
}

// ──────────────────────────────────────────
//  AUTH
// ──────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = db.getUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const payload = { id: user.id, username: user.username, role: user.role, name: user.name };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '10h' });
  res.json({ token, user: payload });
});

// ──────────────────────────────────────────
//  USER MANAGEMENT
// ──────────────────────────────────────────
app.get('/api/users', auth, instructorOnly, (req, res) => {
  res.json(db.getAllStudents());
});

app.post('/api/users', auth, instructorOnly, (req, res) => {
  const { username, password, name } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (db.getUserByUsername(username)) return res.status(409).json({ error: 'Username already exists' });
  const hash = bcrypt.hashSync(password, 10);
  const id = db.createUser({ username, password_hash: hash, role: 'student', name: name || username });
  res.status(201).json({ id, username, name: name || username, role: 'student' });
});

app.put('/api/users/:id/password', auth, instructorOnly, (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password required' });
  db.updateUserPassword(req.params.id, bcrypt.hashSync(password, 10));
  res.json({ ok: true });
});

app.delete('/api/users/:id', auth, instructorOnly, (req, res) => {
  db.deleteUser(req.params.id);
  res.json({ ok: true });
});

// ──────────────────────────────────────────
//  INFERENCE RULES
// ──────────────────────────────────────────
app.get('/api/rules', auth, (req, res) => {
  res.json(db.getAllRules());
});

app.post('/api/rules', auth, instructorOnly, (req, res) => {
  const { name, symbol, description, category } = req.body || {};
  if (!name || !symbol) return res.status(400).json({ error: 'name and symbol required' });
  const id = db.createRule({ name, symbol, description: description || '', category: category || 'propositional' });
  res.status(201).json({ id });
});

app.put('/api/rules/:id', auth, instructorOnly, (req, res) => {
  db.updateRule(req.params.id, req.body);
  res.json({ ok: true });
});

app.delete('/api/rules/:id', auth, instructorOnly, (req, res) => {
  db.deleteRule(req.params.id);
  res.json({ ok: true });
});

// ──────────────────────────────────────────
//  QUESTION BANK
// ──────────────────────────────────────────
app.get('/api/questions', auth, (req, res) => {
  const questions = db.getAllQuestions();
  // Parse metadata JSON for each question
  res.json(questions.map(q => ({ ...q, metadata: JSON.parse(q.metadata || '{}') })));
});

app.get('/api/questions/:id', auth, (req, res) => {
  const q = db.getQuestion(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  res.json({ ...q, metadata: JSON.parse(q.metadata || '{}') });
});

app.post('/api/questions', auth, instructorOnly, (req, res) => {
  const { type, title, question_text, metadata, points } = req.body || {};
  if (!type || !question_text) return res.status(400).json({ error: 'type and question_text required' });
  const id = db.createQuestion({ type, title: title || '', question_text, metadata: metadata || {}, points: points || 10, created_by: req.user.id });
  res.status(201).json({ id });
});

app.put('/api/questions/:id', auth, instructorOnly, (req, res) => {
  db.updateQuestion(req.params.id, req.body);
  res.json({ ok: true });
});

app.delete('/api/questions/:id', auth, instructorOnly, (req, res) => {
  db.deleteQuestion(req.params.id);
  res.json({ ok: true });
});

// ──────────────────────────────────────────
//  QUIZ SESSIONS
// ──────────────────────────────────────────
app.get('/api/sessions', auth, (req, res) => {
  res.json(db.getAllSessions().map(s => ({
    ...s,
    question_ids: JSON.parse(s.question_ids || '[]'),
    settings: JSON.parse(s.settings || '{}')
  })));
});

app.get('/api/sessions/:id', auth, (req, res) => {
  const s = db.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  // Auto-expire
  if (s.status === 'active' && s.end_time && Date.now() > s.end_time) {
    db.setSessionStatus(s.id, 'ended');
    s.status = 'ended';
  }
  res.json({ ...s, question_ids: JSON.parse(s.question_ids || '[]'), settings: JSON.parse(s.settings || '{}') });
});

app.post('/api/sessions', auth, instructorOnly, (req, res) => {
  const { name, time_limit, question_ids, settings } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = db.createSession({
    name,
    time_limit: time_limit || 3600,
    question_ids: JSON.stringify(question_ids || []),
    settings: JSON.stringify(settings || {}),
    created_by: req.user.id
  });
  res.status(201).json({ id });
});

app.put('/api/sessions/:id', auth, instructorOnly, (req, res) => {
  const { name, time_limit, question_ids, settings } = req.body || {};
  db.updateSession(req.params.id, {
    name,
    time_limit,
    question_ids: question_ids ? JSON.stringify(question_ids) : undefined,
    settings: settings ? JSON.stringify(settings) : undefined
  });
  res.json({ ok: true });
});

app.post('/api/sessions/:id/start', auth, instructorOnly, (req, res) => {
  const s = db.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  if (s.status === 'active') return res.status(409).json({ error: 'Already active' });
  const now = Date.now();
  const end = now + (s.time_limit || 3600) * 1000;
  db.startSession(s.id, now, end);
  res.json({ ok: true, start_time: now, end_time: end });
});

app.post('/api/sessions/:id/end', auth, instructorOnly, (req, res) => {
  db.setSessionStatus(req.params.id, 'ended');
  res.json({ ok: true });
});

app.delete('/api/sessions/:id', auth, instructorOnly, (req, res) => {
  db.deleteSession(req.params.id);
  res.json({ ok: true });
});

// Active session poll (students use this to detect start/end)
app.get('/api/active-session', auth, (req, res) => {
  let s = db.getActiveSession();
  if (!s) return res.json(null);
  if (s.end_time && Date.now() > s.end_time) {
    db.setSessionStatus(s.id, 'ended');
    return res.json(null);
  }
  res.json({
    ...s,
    question_ids: JSON.parse(s.question_ids || '[]'),
    settings: JSON.parse(s.settings || '{}')
  });
});

// ──────────────────────────────────────────
//  SUBMISSIONS
// ──────────────────────────────────────────
app.post('/api/submissions', auth, (req, res) => {
  const { session_id, answers } = req.body || {};
  if (!session_id || !answers) return res.status(400).json({ error: 'session_id and answers required' });

  const session = db.getSession(session_id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.status !== 'active' && !(session.end_time && Date.now() <= session.end_time + 30000)) {
    return res.status(400).json({ error: 'Quiz is not accepting submissions' });
  }
  if (db.getSubmissionByStudentSession(req.user.id, session_id)) {
    return res.status(409).json({ error: 'Already submitted' });
  }

  // Auto-grade
  const sessionSettings = JSON.parse(session.settings || '{}');
  const gradedAnswers = {};
  let totalScore = 0;

  for (const [qid, answer] of Object.entries(answers)) {
    const question = db.getQuestion(qid);
    if (!question) continue;
    const meta = JSON.parse(question.metadata || '{}');
    const result = gradeAnswer(question.type, answer, meta, sessionSettings);
    gradedAnswers[qid] = result;
    totalScore += result.score || 0;
  }

  const id = db.createSubmission({
    session_id,
    student_id: req.user.id,
    answers: JSON.stringify(answers),
    graded_answers: JSON.stringify(gradedAnswers),
    total_score: totalScore,
    submitted_at: Date.now()
  });

  res.status(201).json({ id, gradedAnswers, totalScore });
});

// Get submissions — instructor gets all, student gets their own
app.get('/api/submissions', auth, (req, res) => {
  if (req.user.role === 'instructor') {
    const { session_id } = req.query;
    const rows = session_id
      ? db.getSubmissionsBySession(session_id)
      : db.getAllSubmissions();
    res.json(rows.map(r => ({
      ...r,
      answers: JSON.parse(r.answers || '{}'),
      graded_answers: JSON.parse(r.graded_answers || '{}')
    })));
  } else {
    const rows = db.getStudentSubmissions(req.user.id);
    res.json(rows.map(r => ({
      ...r,
      answers: JSON.parse(r.answers || '{}'),
      graded_answers: JSON.parse(r.graded_answers || '{}')
    })));
  }
});

app.get('/api/submissions/:id', auth, (req, res) => {
  const sub = db.getSubmissionById(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'instructor' && sub.student_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json({
    ...sub,
    answers: JSON.parse(sub.answers || '{}'),
    graded_answers: JSON.parse(sub.graded_answers || '{}')
  });
});

// Instructor manually grades or overrides a specific question
app.put('/api/submissions/:id/grade-question', auth, instructorOnly, (req, res) => {
  const { question_id, score, feedback } = req.body || {};
  const sub = db.getSubmissionById(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Not found' });
  const ga = JSON.parse(sub.graded_answers || '{}');
  ga[question_id] = { ...(ga[question_id] || {}), score, feedback, manually_graded: true };
  const total = Object.values(ga).reduce((s, v) => s + (v.score || 0), 0);
  db.updateSubmissionGrades(req.params.id, JSON.stringify(ga), total);
  res.json({ ok: true, total_score: total });
});

// ──────────────────────────────────────────
//  SERVE SPA
// ──────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/student', (req, res) => res.sendFile(path.join(__dirname, 'public', 'student.html')));
app.get('/instructor', (req, res) => res.sendFile(path.join(__dirname, 'public', 'instructor.html')));

app.listen(PORT, () => {
  console.log(`\n🧠  Logic Quiz System running at http://localhost:${PORT}`);
  console.log(`    Default login: instructor / logic2024\n`);
});
