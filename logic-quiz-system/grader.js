'use strict';
/**
 * grader.js — Logic Formula Parser & Auto-Grader
 *
 * Supports propositional logic and first-order predicate logic.
 *
 * Notation accepted:
 *   Connectives : ~  &  v  -->  <->
 *   Quantifiers : Ax / ∀x  (universal)   Ex / ∃x  (existential)
 *   Bottom      : _|_  ⊥  F  Bot
 *   Predicates  : P(x,y,...)
 *   Atoms       : single uppercase letter, optionally followed by letters/digits
 */

// ═══════════════════════════════════════════════════════════
//  FORMULA PARSER  (recursive descent)
// ═══════════════════════════════════════════════════════════

class FormulaParser {
  constructor(src) {
    // Normalize Unicode / alternate notations
    this.src = src
      .replace(/∧/g, '&')
      .replace(/∨/g, 'v')
      .replace(/¬|!/g, '~')
      .replace(/→|->(?!>)/g, '-->')   // single -> → -->
      .replace(/↔|<->/g, '<->')
      .replace(/⊥|_\|_/g, 'F')
      .replace(/∀/g, 'A')
      .replace(/∃/g, 'E')
      .trim();
    this.pos = 0;
  }

  peek(n = 1) {
    this._skip();
    return this.src.slice(this.pos, this.pos + n);
  }

  eat(s) {
    this._skip();
    if (this.src.slice(this.pos, this.pos + s.length) !== s)
      throw new Error(`Expected "${s}" at pos ${this.pos} (got "${this.src.slice(this.pos, this.pos + 5)}")`);
    this.pos += s.length;
    return s;
  }

  _skip() {
    while (this.pos < this.src.length && this.src[this.pos] === ' ') this.pos++;
  }

  done() { this._skip(); return this.pos >= this.src.length; }

  // Entry: biconditional (lowest precedence)
  parse() {
    const f = this._parseBicond();
    if (!this.done()) throw new Error(`Unexpected input remaining: "${this.src.slice(this.pos)}"`);
    return f;
  }

  _parseBicond() {
    let left = this._parseImpl();
    while (this.peek(3) === '<->') {
      this.eat('<->');
      left = { type: '<->', left, right: this._parseImpl() };
    }
    return left;
  }

  _parseImpl() {
    let left = this._parseDisj();
    while (this.peek(3) === '-->') {
      this.eat('-->');
      left = { type: '-->', left, right: this._parseImpl() }; // right-associative
    }
    return left;
  }

  _parseDisj() {
    let left = this._parseConj();
    while (true) {
      this._skip();
      if (this.src[this.pos] === 'v' &&
          (this.pos + 1 >= this.src.length || !/[A-Za-z0-9_]/.test(this.src[this.pos + 1]))) {
        this.pos++;
        left = { type: 'v', left, right: this._parseConj() };
      } else break;
    }
    return left;
  }

  _parseConj() {
    let left = this._parseNeg();
    while (this.peek(1) === '&') {
      this.eat('&');
      left = { type: '&', left, right: this._parseNeg() };
    }
    return left;
  }

  _parseNeg() {
    this._skip();
    if (this.src[this.pos] === '~') { this.pos++; return { type: '~', operand: this._parseNeg() }; }
    return this._parseQuant();
  }

  _parseQuant() {
    this._skip();
    const ch = this.src[this.pos];
    // Universal: Ax
    if ((ch === 'A') && this.pos + 1 < this.src.length && /[a-z]/.test(this.src[this.pos + 1])) {
      this.pos++;
      const v = this.src[this.pos++];
      return { type: 'forall', var: v, body: this._parseNeg() };
    }
    // Existential: Ex
    if ((ch === 'E') && this.pos + 1 < this.src.length && /[a-z]/.test(this.src[this.pos + 1])) {
      this.pos++;
      const v = this.src[this.pos++];
      return { type: 'exists', var: v, body: this._parseNeg() };
    }
    return this._parseAtom();
  }

  _parseAtom() {
    this._skip();
    const ch = this.src[this.pos];

    if (ch === '(') {
      this.eat('(');
      const inner = this._parseBicond();
      this.eat(')');
      return inner;
    }

    // Bottom
    if (ch === 'F' && (this.pos + 1 >= this.src.length || !/[A-Za-z0-9]/.test(this.src[this.pos + 1]))) {
      this.pos++;
      return { type: 'bottom' };
    }

    // Atom or predicate: starts with uppercase letter
    if (/[A-Z]/.test(ch)) {
      let name = '';
      while (this.pos < this.src.length && /[A-Za-z0-9]/.test(this.src[this.pos])) {
        name += this.src[this.pos++];
      }
      this._skip();
      // Predicate application
      if (this.src[this.pos] === '(') {
        this.pos++;
        const args = [];
        while (this.pos < this.src.length && this.src[this.pos] !== ')') {
          this._skip();
          let arg = '';
          while (this.pos < this.src.length && /[A-Za-z0-9_]/.test(this.src[this.pos])) arg += this.src[this.pos++];
          if (arg) args.push(arg);
          this._skip();
          if (this.src[this.pos] === ',') this.pos++;
        }
        this.eat(')');
        return { type: 'pred', name, args };
      }
      if (name === 'Bot' || name === 'FALSE' || name === 'BOTTOM') return { type: 'bottom' };
      return { type: 'atom', name };
    }

    throw new Error(`Unexpected character "${ch}" at pos ${this.pos}`);
  }
}

function parseFormula(str) {
  if (!str || str.trim() === '') return null;
  return new FormulaParser(str.trim()).parse();
}

// ─── Equality (structural) ───
function fEq(a, b) {
  if (!a || !b) return a === b;
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'atom':   return a.name === b.name;
    case 'bottom': return true;
    case 'pred':   return a.name === b.name && a.args.length === b.args.length && a.args.every((x,i) => x === b.args[i]);
    case '~':      return fEq(a.operand, b.operand);
    case '&': case 'v': case '-->': case '<->':
      return fEq(a.left, b.left) && fEq(a.right, b.right);
    case 'forall': case 'exists':
      return a.var === b.var && fEq(a.body, b.body);
    default: return false;
  }
}

// ─── Substitution: does `instance` equal `template` with `variable` replaced by `term`? ───
function checkSubst(template, variable, term, instance) {
  let inferred = null;
  function match(t, i) {
    if (!t || !i) return t === i;
    if (t.type === 'atom') {
      if (t.name === variable) {
        if (i.type !== 'atom') return false;
        if (inferred === null) { inferred = i.name; return true; }
        return inferred === i.name;
      }
      return i.type === 'atom' && t.name === i.name;
    }
    if (t.type === 'pred') {
      if (i.type !== 'pred' || t.name !== i.name || t.args.length !== i.args.length) return false;
      return t.args.every((a, idx) => {
        if (a === variable) {
          if (inferred === null) { inferred = i.args[idx]; return true; }
          return inferred === i.args[idx];
        }
        return a === i.args[idx];
      });
    }
    if (t.type !== i.type) return false;
    switch (t.type) {
      case 'bottom': return true;
      case '~': return match(t.operand, i.operand);
      case '&': case 'v': case '-->': case '<->': return match(t.left, i.left) && match(t.right, i.right);
      case 'forall': case 'exists':
        if (t.var === variable) return fEq(t, i); // bound — no substitution inside
        return t.var === i.var && match(t.body, i.body);
      default: return false;
    }
  }
  return match(template, instance) ? { ok: true, term: inferred } : { ok: false };
}

// ─── Safe parse (returns null on error) ───
function safeParse(s) {
  try { return parseFormula(s); } catch { return null; }
}

// ─── Convert formula to canonical string (for comparison) ───
function fStr(f) {
  if (!f) return '';
  switch (f.type) {
    case 'atom':   return f.name;
    case 'bottom': return '⊥';
    case 'pred':   return `${f.name}(${f.args.join(',')})`;
    case '~':      return `~${fStr(f.operand)}`;
    case '&':      return `(${fStr(f.left)}&${fStr(f.right)})`;
    case 'v':      return `(${fStr(f.left)}v${fStr(f.right)})`;
    case '-->':    return `(${fStr(f.left)}->${fStr(f.right)})`;
    case '<->':    return `(${fStr(f.left)}<->${fStr(f.right)})`;
    case 'forall': return `A${f.var}${fStr(f.body)}`;
    case 'exists': return `E${f.var}${fStr(f.body)}`;
    default: return '';
  }
}

// ─── Normalize rule name to canonical key ───
const RULE_MAP = {
  // Premise / Assumption
  prem:'PREM', premise:'PREM', p:'PREM',
  ass:'ASS', assumption:'ASS', a:'ASS', hyp:'ASS',
  // Reiteration
  reit:'REIT', r:'REIT', rep:'REIT',
  // Conjunction
  'conj i':'CONJ_I', '&i':'CONJ_I', 'andi':'CONJ_I', 'ci':'CONJ_I',
  'conj e':'CONJ_E', '&e':'CONJ_E', 'ande':'CONJ_E', 'ce':'CONJ_E',
  // Disjunction
  'disj i':'DISJ_I', 'vi':'DISJ_I', 'ori':'DISJ_I', 'addi':'DISJ_I', 'add':'DISJ_I',
  'disj e':'DISJ_E', 've':'DISJ_E', 'ore':'DISJ_E', 'cd':'DISJ_E',
  // Implication
  '->i':'IMP_I', '-->i':'IMP_I', 'impi':'IMP_I', 'cp':'IMP_I', 'cond i':'IMP_I',
  '->e':'IMP_E', '-->e':'IMP_E', 'impe':'IMP_E', 'mp':'IMP_E', 'modus ponens':'IMP_E', 'cond e':'IMP_E',
  // Negation
  '~i':'NEG_I', 'negi':'NEG_I', 'ni':'NEG_I',
  '~e':'NEG_E', 'nege':'NEG_E', 'ne':'NEG_E',
  // Bottom
  'bote':'BOT_E', '⊥e':'BOT_E', 'efq':'BOT_E', 'ex falso':'BOT_E', 'fate':'BOT_E', 'fe':'BOT_E',
  // RAA
  raa:'RAA', reductio:'RAA',
  // Biconditional
  '<->i':'BICON_I', 'biconi':'BICON_I',
  '<->e':'BICON_E', 'bicone':'BICON_E',
  // FOL
  'ae':'UNIV_E', '∀e':'UNIV_E', 'ue':'UNIV_E', 'ui':'UNIV_E', 'forall e':'UNIV_E',
  'ai':'UNIV_I', '∀i':'UNIV_I', 'ug':'UNIV_I', 'forall i':'UNIV_I',
  'ei':'EXIST_I', '∃i':'EXIST_I', 'eg':'EXIST_I', 'exists i':'EXIST_I',
  'ee':'EXIST_E', '∃e':'EXIST_E', 'qe':'EXIST_E', 'exists e':'EXIST_E',
};

function normalizeRule(r) {
  if (!r) return '';
  const key = r.trim().toLowerCase().replace(/\s+/g, ' ');
  return RULE_MAP[key] || key.toUpperCase();
}

// ─── Parse justification string: "->E 1, 2" → { rule, citedLines } ───
function parseJustification(s) {
  if (!s) return { rule: '', citedLines: [] };
  s = s.trim();
  // Extract trailing numbers
  const numMatch = s.match(/^(.*?)\s*([\d\s,]+)\s*$/);
  if (numMatch && /\d/.test(numMatch[2])) {
    const rule = numMatch[1].trim();
    const citedLines = numMatch[2].split(',').map(x => parseInt(x.trim())).filter(n => !isNaN(n));
    return { rule, citedLines };
  }
  return { rule: s, citedLines: [] };
}

// ═══════════════════════════════════════════════════════════
//  NATURAL DEDUCTION STEP VERIFIER
// ═══════════════════════════════════════════════════════════

/**
 * steps: array of { assumptionNums: string, formula: string, justification: string }
 *        (1-indexed when referred to by line number)
 * premises: array of formula strings (given)
 * conclusion: formula string
 * allowedRuleSymbols: array of rule symbols the instructor has enabled
 * Returns: { ok, score, errors, conclusionReached, undischarged }
 */
function gradeNDProof(steps, premises, conclusion, allowedRuleSymbols) {
  const errors = [];
  // 1-indexed: stepFormulas[1] = parsed formula of step 1
  const stepFormulas = {};
  const stepRules    = {};   // canonical rule name
  const stepCited    = {};   // cited line numbers
  const isAssumption = {};   // line -> bool
  const dischargedBy = {};   // assumpLine -> derivedLine that discharged it

  // Normalize allowed rules
  const allowed = new Set((allowedRuleSymbols || []).map(normalizeRule));

  // Parse all steps first
  for (let i = 0; i < steps.length; i++) {
    const ln = i + 1;
    const step = steps[i];
    const f = safeParse(step.formula);
    if (!f) { errors.push({ line: ln, msg: `Cannot parse formula: "${step.formula}"` }); }
    stepFormulas[ln] = f;
    const { rule, citedLines } = parseJustification(step.justification);
    stepRules[ln] = normalizeRule(rule);
    stepCited[ln]  = citedLines;
    isAssumption[ln] = (stepRules[ln] === 'ASS');
  }

  // Verify each step
  for (let ln = 1; ln <= steps.length; ln++) {
    const ruleKey = stepRules[ln];
    const formula  = stepFormulas[ln];
    const cited    = stepCited[ln];
    if (!formula) continue;

    // Skip PREM / ASS — always allowed as long as they're valid
    if (ruleKey === 'PREM' || ruleKey === 'ASS') continue;

    // Check allowed rules
    if (allowed.size > 0 && !allowed.has(ruleKey)) {
      errors.push({ line: ln, msg: `Rule "${steps[ln-1].justification}" is not in the allowed rules for this question.` });
      continue;
    }

    // Check out-of-range citations
    for (const c of cited) {
      if (c < 1 || c > steps.length) {
        errors.push({ line: ln, msg: `Cited line ${c} is out of range.` }); continue;
      }
    }

    const gf = (n) => stepFormulas[n];
    const gs = (n) => steps[n - 1];
    const result = verifyStep(ruleKey, formula, cited, gf, gs, isAssumption, dischargedBy, ln);
    if (!result.ok) errors.push({ line: ln, msg: result.msg });

    // Record discharges
    if (result.discharged) {
      for (const al of result.discharged) dischargedBy[al] = ln;
    }
  }

  // Check conclusion
  const parsedConclusion = safeParse(conclusion);
  const lastFormula = stepFormulas[steps.length];
  const conclusionReached = !!(parsedConclusion && lastFormula && fEq(lastFormula, parsedConclusion));
  if (!conclusionReached) {
    errors.push({ line: 'end', msg: `The last line does not match the required conclusion "${conclusion}".` });
  }

  // Check undischarged assumptions
  const undischarged = [];
  for (let ln = 1; ln <= steps.length; ln++) {
    if (isAssumption[ln] && !dischargedBy[ln]) {
      undischarged.push(ln);
      errors.push({ line: ln, msg: `Assumption on line ${ln} was never discharged.` });
    }
  }

  const ok = errors.length === 0;
  return { ok, errors, conclusionReached, undischarged };
}

function verifyStep(ruleKey, formula, cited, gf, gs, isAssumption, dischargedBy, thisLine) {
  switch (ruleKey) {

    case 'REIT': {
      if (cited.length !== 1) return err('Reit requires exactly 1 cited line.');
      if (!fEq(gf(cited[0]), formula)) return err('Reiterated formula does not match cited line.');
      return ok();
    }

    case 'CONJ_I': {
      if (cited.length !== 2) return err('&I requires exactly 2 cited lines.');
      if (formula.type !== '&') return err('&I must derive a conjunction.');
      const [a, b] = cited.map(gf);
      if ((fEq(a, formula.left) && fEq(b, formula.right)) ||
          (fEq(b, formula.left) && fEq(a, formula.right))) return ok();
      return err('&I: cited formulas do not match the conjuncts.');
    }

    case 'CONJ_E': {
      if (cited.length !== 1) return err('&E requires exactly 1 cited line.');
      const conj = gf(cited[0]);
      if (!conj || conj.type !== '&') return err('&E: cited line must be a conjunction.');
      if (fEq(formula, conj.left) || fEq(formula, conj.right)) return ok();
      return err('&E: derived formula is not a conjunct of the cited line.');
    }

    case 'DISJ_I': {
      if (cited.length !== 1) return err('vI requires exactly 1 cited line.');
      if (formula.type !== 'v') return err('vI must derive a disjunction.');
      const d = gf(cited[0]);
      if (fEq(d, formula.left) || fEq(d, formula.right)) return ok();
      return err('vI: cited formula is neither disjunct.');
    }

    case 'DISJ_E': {
      // Format: vE disjLine, assLineA, concLineA, assLineB, concLineB
      if (cited.length < 3) return err('vE requires at least 3 cited lines: [disjunction, concA, concB].');
      const disjF = gf(cited[0]);
      if (!disjF || disjF.type !== 'v') return err('vE: first cited line must be a disjunction.');
      // The last two cited lines should both match the derived formula
      const last = cited.slice(-2).map(gf);
      if (last.every(f => f && fEq(f, formula))) return ok(cited.length >= 5 ? [cited[1], cited[3]] : []);
      return err('vE: the subproof conclusions do not both match the derived formula.');
    }

    case 'IMP_I': {
      // ->I: cited[0]=assumption line, cited[1]=conclusion-of-subproof line
      if (cited.length !== 2) return err('→I requires exactly 2 cited lines: [assumption, subproof conclusion].');
      if (formula.type !== '-->') return err('→I must derive a conditional.');
      const assLine = cited[0];
      if (!isAssumption[assLine]) return err(`→I: line ${assLine} must be an assumption.`);
      if (!fEq(gf(assLine), formula.left)) return err('→I: the assumption does not match the antecedent.');
      if (!fEq(gf(cited[1]), formula.right)) return err('→I: the subproof conclusion does not match the consequent.');
      return ok([assLine]);  // discharges the assumption
    }

    case 'IMP_E': {
      if (cited.length !== 2) return err('→E requires exactly 2 cited lines.');
      const [l1, l2] = cited.map(gf);
      if (l1 && l1.type === '-->' && fEq(l1.left, l2) && fEq(l1.right, formula)) return ok();
      if (l2 && l2.type === '-->' && fEq(l2.left, l1) && fEq(l2.right, formula)) return ok();
      return err('→E: cited lines do not form a valid modus ponens application.');
    }

    case 'NEG_I': {
      if (cited.length !== 2) return err('~I requires exactly 2 cited lines: [assumption, ⊥].');
      if (formula.type !== '~') return err('~I must derive a negation.');
      const assLine = cited[0];
      if (!isAssumption[assLine]) return err(`~I: line ${assLine} must be an assumption.`);
      if (!fEq(gf(assLine), formula.operand)) return err('~I: assumption does not match the negand.');
      const bot = gf(cited[1]);
      if (!bot || bot.type !== 'bottom') return err('~I: second cited line must be ⊥.');
      return ok([assLine]);
    }

    case 'NEG_E': {
      if (cited.length !== 2) return err('~E requires exactly 2 cited lines.');
      if (formula.type !== 'bottom') return err('~E must derive ⊥.');
      const [e1, e2] = cited.map(gf);
      if (e1 && e1.type === '~' && fEq(e1.operand, e2)) return ok();
      if (e2 && e2.type === '~' && fEq(e2.operand, e1)) return ok();
      return err('~E: cited lines do not form a contradiction.');
    }

    case 'BOT_E': {
      if (cited.length !== 1) return err('⊥E requires exactly 1 cited line.');
      const b = gf(cited[0]);
      if (!b || b.type !== 'bottom') return err('⊥E: cited line must be ⊥.');
      return ok();  // anything follows
    }

    case 'RAA': {
      if (cited.length !== 2) return err('RAA requires exactly 2 cited lines: [~φ assumption, ⊥].');
      const assLine = cited[0];
      if (!isAssumption[assLine]) return err(`RAA: line ${assLine} must be an assumption.`);
      const assF = gf(assLine);
      if (!assF || assF.type !== '~') return err('RAA: the assumption must be a negation (~φ).');
      if (!fEq(assF.operand, formula)) return err('RAA: the derived formula does not match the negand of the assumption.');
      const bot2 = gf(cited[1]);
      if (!bot2 || bot2.type !== 'bottom') return err('RAA: second cited line must be ⊥.');
      return ok([assLine]);
    }

    case 'BICON_I': {
      if (cited.length !== 2) return err('<->I requires exactly 2 cited lines (both conditionals).');
      if (formula.type !== '<->') return err('<->I must derive a biconditional.');
      const [bc1, bc2] = cited.map(gf);
      if (bc1 && bc2 && bc1.type === '-->' && bc2.type === '-->' &&
          fEq(bc1.left, formula.left) && fEq(bc1.right, formula.right) &&
          fEq(bc2.left, formula.right) && fEq(bc2.right, formula.left)) return ok();
      return err('<->I: cited lines must be φ→ψ and ψ→φ.');
    }

    case 'BICON_E': {
      if (cited.length !== 2) return err('<->E requires exactly 2 cited lines.');
      const [be1, be2] = cited.map(gf);
      if (!be1) return err('Cannot parse cited line.');
      if (be1.type === '<->') {
        if ((fEq(formula, be1.right) && fEq(be2, be1.left)) ||
            (fEq(formula, be1.left) && fEq(be2, be1.right))) return ok();
      }
      if (be2 && be2.type === '<->') {
        if ((fEq(formula, be2.right) && fEq(be1, be2.left)) ||
            (fEq(formula, be2.left) && fEq(be1, be2.right))) return ok();
      }
      return err('<->E: cannot derive formula from cited biconditional and line.');
    }

    // ── FOL ──

    case 'UNIV_E': {
      if (cited.length !== 1) return err('∀E requires exactly 1 cited line.');
      const univF = gf(cited[0]);
      if (!univF || univF.type !== 'forall') return err('∀E: cited line must be a universal formula ∀x φ(x).');
      const subResult = checkSubst(univF.body, univF.var, null, formula);
      if (subResult.ok) return ok();
      return err('∀E: derived formula is not a valid substitution instance of the universal.');
    }

    case 'UNIV_I': {
      if (cited.length !== 1) return err('∀I requires exactly 1 cited line.');
      if (formula.type !== 'forall') return err('∀I must derive a universal formula ∀x φ(x).');
      const srcF = gf(cited[0]);
      const subResult = checkSubst(formula.body, formula.var, null, srcF);
      if (subResult.ok) return ok();
      return err('∀I: cited formula is not an instance of the universal body.');
    }

    case 'EXIST_I': {
      if (cited.length !== 1) return err('∃I requires exactly 1 cited line.');
      if (formula.type !== 'exists') return err('∃I must derive an existential formula ∃x φ(x).');
      const srcF2 = gf(cited[0]);
      const subResult2 = checkSubst(formula.body, formula.var, null, srcF2);
      if (subResult2.ok) return ok();
      return err('∃I: cited formula is not a substitution instance of the existential body.');
    }

    case 'EXIST_E': {
      // Format: ∃E existLine, assLine, concLine
      if (cited.length !== 3) return err('∃E requires exactly 3 cited lines: [∃xφ, assumption φ[x/a], conclusion].');
      const exF = gf(cited[0]);
      if (!exF || exF.type !== 'exists') return err('∃E: first cited line must be an existential.');
      if (!isAssumption[cited[1]]) return err(`∃E: line ${cited[1]} must be an assumption (the instance φ[x/a]).`);
      if (!fEq(gf(cited[2]), formula)) return err('∃E: third cited line (conclusion) must match derived formula.');
      return ok([cited[1]]);  // discharges the assumption
    }

    default:
      return err(`Unknown or unsupported rule: "${ruleKey}". Check spelling or the allowed rules list.`);
  }
}

function ok(discharged) { return { ok: true, discharged: discharged || [] }; }
function err(msg) { return { ok: false, msg, discharged: [] }; }

// ═══════════════════════════════════════════════════════════
//  TRUTH TABLE GRADER
// ═══════════════════════════════════════════════════════════

/**
 * studentTable : 2D array of 'T'/'F' strings  (rows × cols)
 * answerTable  : 2D array of 'T'/'F' strings  (instructor's correct answer)
 * Returns { ok, score, errors, cellErrors }
 */
function gradeTruthTable(studentTable, answerTable) {
  const errors    = [];
  const cellErrors = [];

  if (!Array.isArray(studentTable) || !Array.isArray(answerTable)) {
    return { ok: false, score: 0, errors: ['Invalid table format.'] };
  }

  if (studentTable.length !== answerTable.length) {
    errors.push(`Wrong number of rows: expected ${answerTable.length}, got ${studentTable.length}.`);
    return { ok: false, score: 0, errors, cellErrors };
  }

  let totalCells  = 0;
  let correctCells = 0;

  for (let r = 0; r < answerTable.length; r++) {
    const sRow = studentTable[r] || [];
    const aRow = answerTable[r];
    if (sRow.length !== aRow.length) {
      errors.push(`Row ${r + 1}: wrong number of columns (expected ${aRow.length}, got ${sRow.length}).`);
    }
    for (let c = 0; c < aRow.length; c++) {
      totalCells++;
      const sv = (sRow[c] || '').toString().trim().toUpperCase();
      const av = (aRow[c] || '').toString().trim().toUpperCase();
      if (sv === av) {
        correctCells++;
      } else {
        cellErrors.push({ row: r + 1, col: c + 1, got: sv, expected: av });
      }
    }
  }

  const score = totalCells > 0 ? correctCells / totalCells : 0;
  return {
    ok: cellErrors.length === 0 && errors.length === 0,
    score,
    errors,
    cellErrors,
    summary: `${correctCells}/${totalCells} cells correct`
  };
}

// ═══════════════════════════════════════════════════════════
//  TRANSLATION GRADER
// ═══════════════════════════════════════════════════════════

/**
 * Grades a translation question.
 * answer = {
 *   premises: string[],
 *   conclusion: string,
 *   proofType: 'nd'|'pl'|'tt',
 *   ndProof: steps[],       // if proofType = 'nd' or 'pl'
 *   ttTable: [][],          // if proofType = 'tt'
 * }
 * meta = {
 *   model_premises: string[],
 *   model_conclusion: string,
 *   allowed_rules: string[]
 * }
 */
function gradeTranslation(answer, meta) {
  const errors = [];
  let translationScore = 0;
  let proofScore = 0;
  const feedback = [];

  // ── Grade translation accuracy ──
  const modelPrems = (meta.model_premises || []).map(safeParse);
  const modelConc  = safeParse(meta.model_conclusion || '');
  const studPrems  = (answer.premises || []).map(s => safeParse(s));
  const studConc   = safeParse(answer.conclusion || '');

  // Check premises
  let premCorrect = 0;
  for (const mp of modelPrems) {
    if (studPrems.some(sp => sp && fEq(sp, mp))) premCorrect++;
  }
  const premScore = modelPrems.length > 0 ? premCorrect / modelPrems.length : 0;

  // Check conclusion
  const concScore = (modelConc && studConc && fEq(studConc, modelConc)) ? 1 : 0;

  translationScore = (premScore + concScore) / 2;
  feedback.push(`Translation: ${Math.round(premScore * 100)}% of premises correct, conclusion ${concScore ? 'correct' : 'incorrect'}.`);

  // ── Grade proof ──
  const proofType = answer.proofType || 'nd';
  if (proofType === 'tt') {
    const ttResult = gradeTruthTable(answer.ttTable || [], meta.model_tt_answer || []);
    proofScore = ttResult.score;
    feedback.push(`Truth table proof: ${ttResult.summary || ''}`);
    errors.push(...(ttResult.errors || []));
  } else {
    // ND or PL
    const proofSteps = answer.ndProof || [];
    // Use student's own premises as the proof premises
    const proofPrems = (answer.premises || []).filter(s => s.trim() !== '');
    const proofConc  = answer.conclusion || '';
    const ndResult = gradeNDProof(proofSteps, proofPrems, proofConc, meta.allowed_rules || []);
    proofScore = ndResult.ok ? 1 : ndResult.conclusionReached ? 0.5 : 0;
    feedback.push(`Proof: ${ndResult.errors.length} error(s).`);
    if (ndResult.errors.length) {
      errors.push(...ndResult.errors.map(e => `Line ${e.line}: ${e.msg}`));
    }
  }

  const totalScore = translationScore * 0.4 + proofScore * 0.6;

  return {
    ok: errors.length === 0 && translationScore === 1,
    score: totalScore,
    translationScore,
    proofScore,
    errors,
    feedback
  };
}

// ═══════════════════════════════════════════════════════════
//  TOP-LEVEL DISPATCHER
// ═══════════════════════════════════════════════════════════

/**
 * grade an answer for any question type.
 * Returns { score, maxScore, ok, errors, feedback, needsManualGrading }
 */
function gradeAnswer(type, answer, meta, sessionSettings) {
  try {
    switch (type) {

      case 'truth_table': {
        // Check if student used shortcut method
        if (answer.method === 'shortcut') {
          return {
            score: null,
            maxScore: meta.points || 10,
            ok: false,
            needsManualGrading: true,
            feedback: ['Student used the shortcut method — requires manual grading.'],
            errors: []
          };
        }
        const result = gradeTruthTable(answer.table || [], meta.sample_answer || []);
        return {
          score: result.score * (meta.points || 10),
          maxScore: meta.points || 10,
          ok: result.ok,
          errors: result.errors,
          cellErrors: result.cellErrors,
          feedback: [result.summary || ''],
          needsManualGrading: false
        };
      }

      case 'natural_deduction':
      case 'predicate_logic': {
        const steps  = answer.steps || [];
        const prems  = meta.premises || [];
        const conc   = meta.conclusion || '';
        const rules  = meta.allowed_rules || [];
        const result = gradeNDProof(steps, prems, conc, rules);

        let score = 0;
        if (result.ok) score = meta.points || 10;
        else if (result.conclusionReached) score = (meta.points || 10) * 0.5;
        else if (result.errors.length < steps.length / 2) score = (meta.points || 10) * 0.25;

        return {
          score,
          maxScore: meta.points || 10,
          ok: result.ok,
          errors: result.errors.map(e => `Line ${e.line}: ${e.msg}`),
          feedback: [
            `Conclusion reached: ${result.conclusionReached}`,
            `Steps with errors: ${result.errors.filter(e => e.line !== 'end' && e.line !== 'undischarged').length}`,
            `Undischarged assumptions: ${result.undischarged.length}`
          ],
          needsManualGrading: false
        };
      }

      case 'translation': {
        const result = gradeTranslation(answer, meta);
        return {
          score: result.score * (meta.points || 10),
          maxScore: meta.points || 10,
          ok: result.ok,
          errors: result.errors,
          feedback: result.feedback,
          needsManualGrading: false
        };
      }

      default:
        return { score: 0, maxScore: meta.points || 10, ok: false, errors: ['Unknown question type'], needsManualGrading: true };
    }
  } catch (e) {
    return { score: 0, maxScore: meta.points || 10, ok: false, errors: [`Grading error: ${e.message}`], needsManualGrading: false };
  }
}

module.exports = { gradeAnswer, parseFormula, fEq, fStr, gradeNDProof, gradeTruthTable, gradeTranslation, normalizeRule };
