// ============================================================
// CALCOLATRICE PRO - PWA
// Mirror della versione desktop Python in HTML/JavaScript
// ============================================================

'use strict';

// ============================================================
// FORMATTING
// ============================================================
function fmtIt(n, fixedDecimals) {
  if (fixedDecimals === undefined) fixedDecimals = -1;
  if (!isFinite(n)) return 'Errore';
  if (fixedDecimals >= 0) {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    const s = abs.toFixed(fixedDecimals);
    if (fixedDecimals === 0) {
      // integer with thousands
      return sign + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    const [ip, dp] = s.split('.');
    return sign + ip.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dp;
  }
  if (n === Math.trunc(n) && Math.abs(n) < 1e16) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  let s = n.toPrecision(10);
  // Remove trailing zeros after decimal
  if (s.indexOf('.') !== -1 && s.indexOf('e') === -1) {
    s = s.replace(/\.?0+$/, '');
  }
  if (s.indexOf('e') !== -1) return s;
  if (s.indexOf('.') !== -1) {
    const [ip, dp] = s.split('.');
    const sign = ip.startsWith('-') ? '-' : '';
    const intN = ip.replace('-', '');
    return sign + intN.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dp;
  }
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ============================================================
// CALC ENGINE
// ============================================================
class CalcEngine {
  constructor() {
    this.angleMode = 'DEG';
    this.decimals = -1;
    this.rounding = '5/4';
    this.memory = 0;
    this.taxRate = 22;
    this.statData = [];
  }

  roundResult(r) {
    if (Math.abs(r) < 1e-12) return 0;
    r = parseFloat(r.toPrecision(12));
    if (this.decimals < 0) return r;
    const d = this.decimals;
    const f = Math.pow(10, d);
    if (this.rounding === 'DOWN') return Math.trunc(r * f) / f;
    if (this.rounding === 'UP') {
      if (r >= 0) return Math.ceil(r * f) / f;
      return -Math.ceil(-r * f) / f;
    }
    return Math.round(r * f) / f;
  }

  isSimpleChain(expr) {
    if (!expr) return false;
    if (/[a-zA-Z()^πE!]/.test(expr)) return false;
    const inner = expr.replace(/^-/, '');
    return /[+\-*/]/.test(inner);
  }

  // Adding-machine with operator precedence (× ÷ before + -)
  evaluateChain(expr) {
    let i = 0, n = expr.length;
    let firstSign = '+';
    if (i < n && expr[i] === '-') { firstSign = '-'; i++; }
    else if (i < n && expr[i] === '+') { i++; }
    let numStr = '';
    while (i < n && (/[\d.]/.test(expr[i]))) { numStr += expr[i++]; }
    if (!numStr) throw new Error('numero atteso');
    let firstVal = parseFloat(numStr);
    if (firstSign === '-') firstVal = -firstVal;

    const tokens = [];
    let currentValue = firstVal;
    while (i < n) {
      const op = expr[i++];
      if (!/[+\-*/]/.test(op)) throw new Error('operatore non valido');
      let neg = false;
      if (expr[i] === '-') { neg = true; i++; }
      numStr = '';
      while (i < n && (/[\d.]/.test(expr[i]))) { numStr += expr[i++]; }
      if (!numStr) throw new Error('numero mancante');
      const v = parseFloat(numStr) * (neg ? -1 : 1);
      tokens.push([currentValue, op]);
      currentValue = v;
    }
    tokens.push([currentValue, null]);

    // Apply precedence with grouped × ÷
    const steps = [];
    let runningTotal = null;
    let firstEmitted = false;
    let idx = 0;
    while (idx < tokens.length) {
      const groupStart = idx;
      let groupEnd = idx;
      while (groupEnd < tokens.length && (tokens[groupEnd][1] === '*' || tokens[groupEnd][1] === '/')) groupEnd++;
      const addOp = groupStart === 0 ? '+' : tokens[groupStart - 1][1];

      if (groupStart === groupEnd) {
        const val = tokens[groupStart][0];
        if (!firstEmitted) {
          steps.push({ op: val < 0 ? '-' : '+', value: Math.abs(val), partial: val, isFirst: true, note: '' });
          runningTotal = val;
          firstEmitted = true;
        } else {
          if (addOp === '+') runningTotal += val; else runningTotal -= val;
          steps.push({ op: addOp, value: Math.abs(val), partial: runningTotal, isFirst: false, note: '' });
        }
      } else {
        let groupAcc = tokens[groupStart][0];
        if (!firstEmitted) {
          steps.push({ op: groupAcc < 0 ? '-' : '+', value: Math.abs(groupAcc), partial: groupAcc, isFirst: true, note: '', groupMember: true });
          firstEmitted = true;
        } else {
          steps.push({ op: addOp, value: Math.abs(groupAcc), partial: groupAcc, isFirst: false, note: '', groupMember: true });
        }
        for (let k = groupStart; k < groupEnd; k++) {
          const curOp = tokens[k][1];
          const nextVal = tokens[k + 1][0];
          if (curOp === '*') groupAcc *= nextVal;
          else {
            if (nextVal === 0) throw new Error('divisione per zero');
            groupAcc /= nextVal;
          }
          steps.push({ op: curOp, value: Math.abs(nextVal), partial: groupAcc, isFirst: false, note: '', groupMember: true });
        }
        if (runningTotal === null) runningTotal = groupAcc;
        else if (addOp === '+') runningTotal += groupAcc;
        else runningTotal -= groupAcc;
        steps[steps.length - 1].groupResult = groupAcc;
        steps[steps.length - 1].groupRunningTotal = runningTotal;
      }
      if (!isFinite(runningTotal)) throw new Error('risultato non finito');
      idx = groupEnd + 1;
    }
    return { steps, total: runningTotal };
  }

  evaluateExpression(expr) {
    const isDeg = this.angleMode === 'DEG';
    const toRad = x => isDeg ? x * Math.PI / 180 : x;
    const fromRad = x => isDeg ? x * 180 / Math.PI : x;
    const fact = n => {
      n = Math.round(n);
      if (n < 0 || n > 170) throw new Error('fattoriale non valido');
      let r = 1;
      for (let i = 2; i <= n; i++) r *= i;
      return r;
    };
    const fns = {
      PI: Math.PI, EU: Math.E,
      sin: x => Math.sin(toRad(x)), cos: x => Math.cos(toRad(x)), tan: x => Math.tan(toRad(x)),
      asin: x => fromRad(Math.asin(x)), acos: x => fromRad(Math.acos(x)), atan: x => fromRad(Math.atan(x)),
      sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
      asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
      ln: Math.log, log: Math.log10,
      exp: Math.exp, pow10: x => Math.pow(10, x),
      sqrt: Math.sqrt,
      cbrt: x => Math.sign(x) * Math.pow(Math.abs(x), 1 / 3),
      abs: Math.abs, fact: fact,
    };
    // Handle ! postfix
    let code = expr;
    while (code.indexOf('!') !== -1) {
      const idx = code.lastIndexOf('!');
      let j = idx - 1;
      if (j < 0) throw new Error("'!' senza operando");
      let start;
      if (code[j] === ')') {
        let depth = 1, k = j - 1;
        while (k >= 0 && depth > 0) {
          if (code[k] === ')') depth++;
          else if (code[k] === '(') depth--;
          k--;
        }
        start = k + 1;
      } else {
        start = j;
        while (start > 0 && /[\d.]/.test(code[start - 1])) start--;
      }
      const operand = code.substring(start, idx);
      code = code.substring(0, start) + 'fact(' + operand + ')' + code.substring(idx + 1);
    }
    code = code.replace(/π/g, '(PI)').replace(/√/g, 'sqrt').replace(/\^/g, '**');
    code = code.replace(/(?<![A-Za-z0-9])e(?![A-Za-z])/g, '(EU)');
    // Use Function constructor with fns as scope
    const fnNames = Object.keys(fns);
    const fnValues = fnNames.map(k => fns[k]);
    let r;
    try {
      r = new Function(...fnNames, 'return (' + code + ');')(...fnValues);
    } catch (e) {
      throw new Error('Errore nell\'espressione');
    }
    if (typeof r !== 'number' || !isFinite(r)) throw new Error('risultato non finito');
    return r;
  }

  compute(expr) {
    if (this.isSimpleChain(expr)) {
      const chain = this.evaluateChain(expr);
      const rounded = this.roundResult(chain.total);
      chain.steps[chain.steps.length - 1].partial = rounded;
      return { result: rounded, chain };
    }
    const r = this.evaluateExpression(expr);
    return { result: this.roundResult(r), chain: null };
  }

  // Statistics
  statAdd(v) { this.statData.push(parseFloat(v)); }
  statRemoveLast() { this.statData.pop(); }
  statClear() { this.statData = []; }
  statN() { return this.statData.length; }
  statSum() { return this.statData.reduce((a, b) => a + b, 0); }
  statSumSq() { return this.statData.reduce((a, b) => a + b * b, 0); }
  statMean() {
    if (this.statData.length === 0) throw new Error('nessun dato');
    return this.statSum() / this.statData.length;
  }
  statSigmaPop() {
    const n = this.statData.length;
    if (n === 0) throw new Error('nessun dato');
    const m = this.statMean();
    return Math.sqrt(this.statData.reduce((s, x) => s + (x - m) ** 2, 0) / n);
  }
  statSigmaSample() {
    const n = this.statData.length;
    if (n < 2) throw new Error('servono almeno 2 dati');
    const m = this.statMean();
    return Math.sqrt(this.statData.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
  }
  statMin() {
    if (this.statData.length === 0) throw new Error('nessun dato');
    return Math.min(...this.statData);
  }
  statMax() {
    if (this.statData.length === 0) throw new Error('nessun dato');
    return Math.max(...this.statData);
  }
}

// ============================================================
// STATE / PERSISTENCE
// ============================================================
const STATE_KEY = 'calcPro.state';
const DEFAULT_STATE = {
  tape: [], headerNote: '', angleMode: 'DEG', mode: 'simple',
  decimals: -1, rounding: '5/4', taxRate: 22, memory: 0, statData: [],
};

function loadState() {
  try {
    const s = localStorage.getItem(STATE_KEY);
    if (!s) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(s) };
  } catch (e) { return { ...DEFAULT_STATE }; }
}
function saveState(st) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch (e) { }
}

// ============================================================
// APP STATE
// ============================================================
const engine = new CalcEngine();
const state = loadState();
engine.angleMode = state.angleMode;
engine.decimals = state.decimals;
engine.rounding = state.rounding;
engine.taxRate = state.taxRate;
engine.memory = state.memory;
engine.statData = state.statData || [];

let currentExpr = '';
let lastResult = null;
let freshResult = false;
let mode = state.mode || 'simple';
let shiftActive = false;
let hypActive = false;
let statActive = false;

// ============================================================
// DOM HELPERS
// ============================================================
const $ = id => document.getElementById(id);
const exprLine = $('exprLine');
const resultLine = $('resultLine');
const pad = $('pad');

// ============================================================
// BUTTON LAYOUTS
// ============================================================
const SIMPLE_BUTTONS = [
  ['MC', 'mem'], ['MR', 'mem'], ['M\u2212', 'mem'], ['M+', 'mem'],
  ['AC', 'clear'], ['\u232B', 'fn'], ['%', 'fn'], ['\u00F7', 'op'],
  ['7', 'digit'], ['8', 'digit'], ['9', 'digit'], ['\u00D7', 'op'],
  ['4', 'digit'], ['5', 'digit'], ['6', 'digit'], ['\u2212', 'op-sub'],
  ['1', 'digit'], ['2', 'digit'], ['3', 'digit'], ['+', 'op-add'],
  ['\u00B1', 'fn'], ['0', 'digit'], [',', 'fn'], ['=', 'equals'],
];
const SCI_LAYOUT = [
  ['2ndF', '2ndF', 'sci-shift'], ['hyp', 'hyp', 'sci-mod'], ['π', 'π', 'sci'], ['e', 'e', 'sci'],
  ['sin', 'sin\u207B\u00B9', 'sci'], ['cos', 'cos\u207B\u00B9', 'sci'], ['tan', 'tan\u207B\u00B9', 'sci'], ['\u221A', '\u00B3\u221A', 'sci'],
  ['ln', 'e\u02E3', 'sci'], ['log', '10\u02E3', 'sci'], ['x\u00B2', 'x\u00B3', 'sci'], ['1/x', 'n!', 'sci'],
  ['EXP', 'EXP', 'sci'], ['x\u02B8', '\u02B8\u221Ax', 'sci'], ['(', '(', 'sci'], ['STAT', 'STAT', 'sci-stat'],
];
const STAT_LAYOUT = [
  ['STAT', 'STAT', 'sci-stat'], ['DATA', 'DATA', 'stat-data'], ['CE', 'CE', 'stat-del'], ['AC-D', 'AC-D', 'stat-clr'],
  ['n', 'n', 'stat-read'], ['\u03A3x', '\u03A3x', 'stat-read'], ['\u03A3x\u00B2', '\u03A3x\u00B2', 'stat-read'], ['x\u0304', 'x\u0304', 'stat-read'],
  ['\u03C3', '\u03C3', 'stat-read'], ['s', 's', 'stat-read'], ['min', 'min', 'stat-read'], ['max', 'max', 'stat-read'],
  ['(', '(', 'sci'], [')', ')', 'sci'], ['EXP', 'EXP', 'sci'], ['\u221A', '\u221A', 'sci'],
];
const ECO_EXTRA = [
  ['COST', 'eco'], ['SELL', 'eco'], ['MAR', 'eco'], ['IVA', 'eco-set'],
  ['TAX+', 'eco-add'], ['TAX\u2212', 'eco-sub'], ['MU', 'eco'], ['MD', 'eco'],
];

// ============================================================
// PAD BUILDING
// ============================================================
function buildPad() {
  pad.innerHTML = '';
  // Extra row for scientific or economic
  if (mode === 'scientific') {
    const layout = statActive ? STAT_LAYOUT : SCI_LAYOUT;
    const grid = document.createElement('div');
    grid.className = 'pad-grid';
    layout.forEach(([normal, shift, variant]) => {
      const btn = document.createElement('button');
      let v = variant;
      if (normal === '2ndF' && shiftActive) v = 'sci-shift active';
      else if (normal === 'hyp' && hypActive) v = 'sci-mod active';
      else if (normal === 'STAT' && statActive) v = 'sci-stat active';
      btn.className = 'btn ' + v;
      btn.textContent = shiftActive ? shift : normal;
      btn.addEventListener('click', () => onSciButton(normal));
      grid.appendChild(btn);
    });
    pad.appendChild(grid);
  } else if (mode === 'economic') {
    const grid = document.createElement('div');
    grid.className = 'pad-grid';
    ECO_EXTRA.forEach(([txt, variant]) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + variant;
      btn.textContent = txt;
      btn.addEventListener('click', () => onButton(txt));
      grid.appendChild(btn);
    });
    pad.appendChild(grid);
  }
  // Main pad
  const grid = document.createElement('div');
  grid.className = 'pad-grid';
  SIMPLE_BUTTONS.forEach(([txt, variant]) => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + variant;
    btn.textContent = txt;
    btn.addEventListener('click', () => onButton(txt));
    grid.appendChild(btn);
  });
  pad.appendChild(grid);
}

// ============================================================
// INDICATORS
// ============================================================
function refreshIndicators() {
  const ab = $('angleBadge'), db = $('decBadge'), rb = $('roundBadge');
  const mb = $('memBadge'), sb = $('shiftBadge'), hb = $('hypBadge');
  const stb = $('statBadge'), ib = $('ivaBadge');

  ab.textContent = engine.angleMode;
  ab.className = 'badge ' + (engine.angleMode === 'RAD' ? 'amber' : 'idle');

  db.textContent = engine.decimals < 0 ? 'F' : 'DEC ' + engine.decimals;
  db.className = 'badge ' + (engine.decimals >= 0 ? 'amber' : 'idle');

  rb.textContent = engine.rounding;
  rb.className = 'badge ' + (engine.rounding !== '5/4' ? 'amber' : 'idle');

  if (Math.abs(engine.memory) > 1e-12) {
    mb.classList.remove('hidden'); mb.textContent = 'M';
  } else { mb.classList.add('hidden'); }

  if (mode === 'scientific' && shiftActive) {
    sb.classList.remove('hidden'); sb.textContent = '2ndF';
  } else { sb.classList.add('hidden'); }

  if (mode === 'scientific' && hypActive) {
    hb.classList.remove('hidden'); hb.textContent = 'HYP';
  } else { hb.classList.add('hidden'); }

  if (mode === 'scientific' && statActive) {
    stb.classList.remove('hidden'); stb.textContent = 'STAT n=' + engine.statN();
  } else { stb.classList.add('hidden'); }

  if (mode === 'economic') {
    ib.classList.remove('hidden'); ib.textContent = 'IVA' + engine.taxRate + '%';
  } else { ib.classList.add('hidden'); }
}

// ============================================================
// DISPLAY
// ============================================================
function fmtExprDisplay(s) {
  return s.replace(/\./g, ',').replace(/\*/g, '\u00D7').replace(/\//g, '\u00F7').replace(/-/g, '\u2212');
}
function unfmtExpr(s) {
  return s.replace(/,/g, '.').replace(/\u00D7/g, '*').replace(/\u00F7/g, '/').replace(/\u2212/g, '-').replace(/\s/g, '').replace(/=/g, '');
}

function updateDisplay() {
  if (currentExpr === 'Errore') {
    setExprText('');
    resultLine.textContent = 'Errore';
    resultLine.className = 'result-line red';
    return;
  }
  if (freshResult && lastResult !== null) {
    if (state.tape.length) {
      setExprText(fmtExprDisplay(state.tape[state.tape.length - 1].expr) + ' =');
    } else {
      setExprText('');
    }
    resultLine.textContent = fmtIt(lastResult, engine.decimals);
    resultLine.className = 'result-line ' + (lastResult < 0 ? 'red' : lastResult > 0 ? 'green' : '');
  } else {
    const disp = currentExpr ? fmtExprDisplay(currentExpr) : '';
    setExprText(disp);
    resultLine.textContent = disp || '0';
    const n = disp.length;
    let size = 48;
    if (n > 10) size = 40;
    if (n > 14) size = 34;
    if (n > 18) size = 28;
    if (n > 24) size = 22;
    resultLine.style.fontSize = size + 'px';
    resultLine.className = 'result-line';
  }
}
function setExprText(text) {
  if (exprLine.value === text) return;
  exprLine.value = text;
}

// React to user editing the expression directly
exprLine.addEventListener('input', e => {
  freshResult = false;
  currentExpr = unfmtExpr(e.target.value);
  // Update only the result line, not the expr (avoid loop)
  const disp = currentExpr ? fmtExprDisplay(currentExpr) : '';
  resultLine.textContent = disp || '0';
  const n = disp.length;
  let size = 48;
  if (n > 10) size = 40;
  if (n > 14) size = 34;
  if (n > 18) size = 28;
  if (n > 24) size = 22;
  resultLine.style.fontSize = size + 'px';
  resultLine.className = 'result-line';
});
exprLine.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    onButton('=');
  }
});

// ============================================================
// BUTTON HANDLER
// ============================================================
function onButton(label) {
  if (currentExpr === 'Errore') currentExpr = '';

  if (label === 'AC') {
    currentExpr = ''; lastResult = null; freshResult = false;
  } else if (label === '\u232B') {
    if (freshResult) { currentExpr = ''; freshResult = false; }
    else currentExpr = currentExpr.slice(0, -1);
  } else if (label === '=') {
    compute(); return;
  } else if (label === '\u00B1') {
    toggleSign();
  } else if (label === ',') {
    insertChar('.');
  } else if (label === '%') {
    appendPercent();
  } else if (['+', '\u2212', '\u00D7', '\u00F7'].includes(label)) {
    const opMap = { '+': '+', '\u2212': '-', '\u00D7': '*', '\u00F7': '/' };
    insertOp(opMap[label]);
  }
  // Memory
  else if (label === 'MC') { memoryOp('MC'); return; }
  else if (label === 'MR') { memoryOp('MR'); return; }
  else if (label === 'M+') { memoryOp('M+'); return; }
  else if (label === 'M\u2212') { memoryOp('M-'); return; }
  // Economic
  else if (label === 'TAX+') { applyTax(1); return; }
  else if (label === 'TAX\u2212') { applyTax(-1); return; }
  else if (label === 'IVA') { setTaxRate(); return; }
  else if (label === 'MU') { applyMarkupOrDown('MU'); return; }
  else if (label === 'MD') { applyMarkupOrDown('MD'); return; }
  else if (['COST', 'SELL', 'MAR'].includes(label)) {
    showToast(label + ': in arrivo'); return;
  }
  else if (/^\d$/.test(label)) {
    if (freshResult) { currentExpr = ''; freshResult = false; }
    currentExpr += label;
  } else {
    // unknown - ignore
  }
  updateDisplay();
}

function onSciButton(label) {
  const shift = shiftActive, hyp = hypActive;
  if (label === '2ndF') { shiftActive = !shiftActive; buildPad(); refreshIndicators(); return; }
  if (label === 'hyp') { hypActive = !hypActive; buildPad(); refreshIndicators(); return; }
  if (label === 'STAT') {
    statActive = !statActive;
    if (statActive) shiftActive = false;
    buildPad(); refreshIndicators(); return;
  }
  // Statistics actions
  if (label === 'DATA') { statAddCurrent(); return; }
  if (label === 'CE') { engine.statRemoveLast(); persistStat(); refreshIndicators(); showToast('Dato rimosso'); return; }
  if (label === 'AC-D') { statClearConfirm(); return; }
  if (['n', '\u03A3x', '\u03A3x\u00B2', 'x\u0304', '\u03C3', 's', 'min', 'max'].includes(label)) { statRead(label); return; }

  // Functions with shift/hyp combinations
  if (['sin', 'cos', 'tan'].includes(label)) {
    if (hyp && shift) insertFn('a' + label + 'h(');
    else if (hyp) insertFn(label + 'h(');
    else if (shift) insertFn('a' + label + '(');
    else insertFn(label + '(');
  } else if (label === '\u221A') { insertFn(shift ? 'cbrt(' : 'sqrt('); }
  else if (label === 'ln') { insertFn(shift ? 'exp(' : 'ln('); }
  else if (label === 'log') { insertFn(shift ? 'pow10(' : 'log('); }
  else if (label === 'x\u00B2') {
    if (shift) { insertOp('^'); currentExpr += '3'; }
    else { appendSquare(); }
  } else if (label === '1/x') {
    if (shift) { currentExpr += '!'; }
    else { if (currentExpr) currentExpr = '1/(' + currentExpr + ')'; }
  } else if (label === 'EXP') { currentExpr += 'E'; }
  else if (label === 'x\u02B8') {
    if (shift) currentExpr += '^(1/';
    else insertOp('^');
  } else if (label === '\u03C0') { insertChar('π'); shiftActive = false; }
  else if (label === 'e') { insertChar('e'); shiftActive = false; }
  else if (label === '(' || label === ')') { insertChar(label); shiftActive = false; }

  if (shiftActive && shift) {
    shiftActive = false;
    buildPad();
  }
  refreshIndicators();
  updateDisplay();
}

function insertChar(c) {
  if (freshResult) { currentExpr = ''; freshResult = false; }
  currentExpr += c;
}
function insertOp(op) {
  freshResult = false;
  if (!currentExpr && lastResult !== null) currentExpr = lastResult.toString();
  if (currentExpr && /[+\-*/]$/.test(currentExpr)) currentExpr = currentExpr.slice(0, -1);
  currentExpr += op;
}
function insertFn(name) {
  if (freshResult) { currentExpr = ''; freshResult = false; }
  currentExpr += name;
}
function appendSquare() {
  if (!currentExpr && lastResult !== null) currentExpr = lastResult.toString();
  if (!currentExpr) return;
  currentExpr = '(' + currentExpr + ')^2';
}
function appendPercent() {
  if (!currentExpr) return;
  try {
    const r = engine.compute(currentExpr);
    currentExpr = (r.result / 100).toString();
  } catch (e) { }
}
function toggleSign() {
  if (!currentExpr) {
    if (lastResult !== null) { currentExpr = (-lastResult).toString(); freshResult = false; }
    return;
  }
  if (currentExpr.startsWith('-')) currentExpr = currentExpr.slice(1);
  else currentExpr = '-' + currentExpr;
}

function compute() {
  if (!currentExpr) return;
  try {
    const { result, chain } = engine.compute(currentExpr);
    addToTape(currentExpr, result, chain);
    lastResult = result;
    currentExpr = result.toString();
    freshResult = true;
    updateDisplay();
  } catch (e) {
    currentExpr = 'Errore';
    updateDisplay();
  }
}

// ============================================================
// MEMORY
// ============================================================
function memoryOp(op) {
  let current = null;
  if (currentExpr) {
    try { current = engine.compute(currentExpr).result; } catch (e) { }
  } else if (lastResult !== null) current = lastResult;

  if (op === 'MC') engine.memory = 0;
  else if (op === 'MR') {
    currentExpr = engine.memory.toString();
    freshResult = false;
    updateDisplay();
  } else if (op === 'M+' && current !== null) {
    engine.memory += current;
    freshResult = true; lastResult = current;
    updateDisplay();
  } else if (op === 'M-' && current !== null) {
    engine.memory -= current;
    freshResult = true; lastResult = current;
    updateDisplay();
  }
  state.memory = engine.memory;
  saveState(state);
  refreshIndicators();
}

// ============================================================
// ECONOMIC
// ============================================================
function applyTax(sign) {
  let base = null;
  if (currentExpr) { try { base = engine.compute(currentExpr).result; } catch (e) { return; } }
  else if (lastResult !== null) base = lastResult;
  if (base === null) return;
  const rate = engine.taxRate / 100;
  const result = engine.roundResult(sign > 0 ? base * (1 + rate) : base / (1 + rate));
  const exprStr = fmtIt(base) + ' ' + (sign > 0 ? '+' : '-') + 'IVA' + engine.taxRate + '%';
  addToTape(exprStr, result, null);
  lastResult = result; currentExpr = result.toString(); freshResult = true;
  updateDisplay();
}
function applyMarkupOrDown(kind) {
  if (lastResult === null || !currentExpr) return;
  let pct;
  try { pct = parseFloat(currentExpr); if (!isFinite(pct)) return; } catch (e) { return; }
  const base = lastResult;
  const delta = base * pct / 100;
  const result = engine.roundResult(kind === 'MU' ? base + delta : base - delta);
  const exprStr = fmtIt(base) + ' ' + (kind === 'MU' ? '+' : '-') + pct + '%';
  addToTape(exprStr, result, null);
  lastResult = result; currentExpr = result.toString(); freshResult = true;
  updateDisplay();
}
function setTaxRate() {
  const v = prompt('Aliquota IVA in % (es. 22):', engine.taxRate);
  if (v === null) return;
  const n = parseFloat(v.replace(',', '.'));
  if (isFinite(n) && n >= 0 && n <= 100) {
    engine.taxRate = n;
    state.taxRate = n; saveState(state);
    refreshIndicators();
  }
}

// ============================================================
// STATISTICS UI
// ============================================================
function statAddCurrent() {
  let v = null;
  if (currentExpr) { try { v = engine.compute(currentExpr).result; } catch (e) { } }
  else if (lastResult !== null) v = lastResult;
  if (v === null) { showToast('Inserisci un numero, poi DATA'); return; }
  engine.statAdd(v);
  persistStat();
  showToast('Dato #' + engine.statN() + ' aggiunto: ' + fmtIt(v));
  currentExpr = ''; freshResult = false; lastResult = v;
  updateDisplay(); refreshIndicators();
}
function statClearConfirm() {
  const n = engine.statN();
  if (n === 0) { showToast('Dataset vuoto'); return; }
  if (!confirm('Cancellare tutti i ' + n + ' dati?\nOperazione irreversibile.')) return;
  engine.statClear(); persistStat();
  showToast('Dataset cancellato'); refreshIndicators();
}
function statRead(label) {
  let value, readable;
  try {
    if (label === 'n') { value = engine.statN(); readable = 'n (conteggio)'; }
    else if (label === '\u03A3x') { value = engine.statSum(); readable = 'Σx (somma)'; }
    else if (label === '\u03A3x\u00B2') { value = engine.statSumSq(); readable = 'Σx² (somma quadrati)'; }
    else if (label === 'x\u0304') { value = engine.statMean(); readable = 'media'; }
    else if (label === '\u03C3') { value = engine.statSigmaPop(); readable = 'σ (dev. std. popolazione)'; }
    else if (label === 's') { value = engine.statSigmaSample(); readable = 's (dev. std. campione)'; }
    else if (label === 'min') { value = engine.statMin(); readable = 'minimo'; }
    else if (label === 'max') { value = engine.statMax(); readable = 'massimo'; }
    else return;
  } catch (e) { showToast('Impossibile: ' + e.message); return; }
  const rounded = engine.roundResult(value);
  lastResult = rounded; currentExpr = rounded.toString(); freshResult = true;
  addToTape(readable + ' (n=' + engine.statN() + ')', rounded, null);
  updateDisplay(); refreshIndicators();
}
function persistStat() {
  state.statData = engine.statData.slice();
  saveState(state);
  refreshIndicators();
}

// ============================================================
// TAPE
// ============================================================
function addToTape(expr, result, chain) {
  state.tape.push({
    time: new Date().toISOString(),
    expr,
    result,
    sign: result > 0 ? 'pos' : result < 0 ? 'neg' : 'zero',
    note: '',
    type: chain ? 'chain' : 'expression',
    chain,
  });
  saveState(state);
  $('tapeCount').textContent = state.tape.length;
}

// ============================================================
// MODE SWITCH
// ============================================================
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    mode = btn.dataset.mode;
    state.mode = mode;
    saveState(state);
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
    shiftActive = false; hypActive = false;
    if (mode !== 'scientific') statActive = false;
    buildPad();
    refreshIndicators();
  });
});

// Set initial mode button
document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));

// ============================================================
// BADGE CLICKS
// ============================================================
$('angleBadge').addEventListener('click', () => {
  engine.angleMode = engine.angleMode === 'DEG' ? 'RAD' : 'DEG';
  state.angleMode = engine.angleMode;
  saveState(state); refreshIndicators();
});
$('decBadge').addEventListener('click', () => {
  const seq = [-1, 0, 2, 3, 4];
  const i = (seq.indexOf(engine.decimals) + 1) % seq.length;
  engine.decimals = seq[i];
  state.decimals = engine.decimals;
  saveState(state); refreshIndicators(); updateDisplay();
});
$('roundBadge').addEventListener('click', () => {
  const seq = ['5/4', 'UP', 'DOWN'];
  const i = (seq.indexOf(engine.rounding) + 1) % seq.length;
  engine.rounding = seq[i];
  state.rounding = engine.rounding;
  saveState(state); refreshIndicators();
});
$('ivaBadge').addEventListener('click', setTaxRate);

// ============================================================
// TAPE SHEET
// ============================================================
const tapeSheet = $('tapeSheet'), paper = $('paper');
$('tapeBtn').addEventListener('click', () => { renderTape(); tapeSheet.classList.add('open'); });
$('tapeClose').addEventListener('click', () => tapeSheet.classList.remove('open'));

function renderTape() {
  paper.innerHTML = '';
  // Header
  const head = document.createElement('div');
  head.className = 'paper-head';
  head.innerHTML = '<div class="paper-title">CALC · PRO</div><div class="paper-sub">NASTRO CALCOLI</div>';
  paper.appendChild(head);
  // Meta line
  const meta = document.createElement('div');
  meta.className = 'paper-meta';
  const d = new Date();
  const dayStr = d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  meta.innerHTML = '<span>' + dayStr + '</span><span>#' + String(Math.floor(Date.now() / 1000 % 1000000)).padStart(6, '0') + '</span>';
  paper.appendChild(meta);

  // Header note
  const hn = document.createElement('div');
  hn.className = 'paper-header-note' + (state.headerNote ? '' : ' placeholder');
  hn.textContent = state.headerNote || '+ intestazione (cliente, lavoro, riferimento)';
  hn.style.textAlign = 'center';
  hn.addEventListener('click', () => editNote(hn, 'header'));
  paper.appendChild(hn);

  if (state.tape.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'paper-empty';
    empty.textContent = '— nessun calcolo —';
    paper.appendChild(empty);
    return;
  }

  state.tape.forEach((entry, idx) => {
    const e = document.createElement('div');
    e.className = 'paper-entry';

    // Head with N° and delete button
    const ehead = document.createElement('div');
    ehead.className = 'paper-entry-head';
    const t = new Date(entry.time);
    const timeStr = t.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    ehead.innerHTML = '<span>N° ' + String(idx + 1).padStart(3, '0') + ' · ' + timeStr + '</span>';
    const del = document.createElement('button');
    del.className = 'paper-delete'; del.textContent = '🗑';
    del.title = 'Elimina';
    del.addEventListener('click', ev => {
      ev.stopPropagation();
      if (confirm('Cancellare calcolo N° ' + String(idx + 1).padStart(3, '0') + '?')) {
        state.tape.splice(idx, 1);
        saveState(state); renderTape();
        $('tapeCount').textContent = state.tape.length;
      }
    });
    ehead.appendChild(del);
    e.appendChild(ehead);

    if (entry.type === 'chain' && entry.chain) {
      renderChain(e, entry.chain, entry.sign, idx);
    } else {
      const r = document.createElement('div');
      r.className = 'paper-final ' + entry.sign;
      r.innerHTML = '<span class="eq">=</span><span class="val">' + fmtIt(entry.result, engine.decimals) + '</span> <span class="tot">' + entry.expr + '</span>';
      e.appendChild(r);
    }

    // Entry note
    const en = document.createElement('div');
    en.className = 'paper-entry-note' + (entry.note ? '' : ' placeholder');
    en.textContent = entry.note ? '✎ ' + entry.note : '+ aggiungi nota generale';
    en.addEventListener('click', () => editNote(en, 'entry', idx));
    e.appendChild(en);

    paper.appendChild(e);
  });
}

function renderChain(container, chain, sign, entryIdx) {
  chain.steps.forEach((step, sidx) => {
    const isFirst = step.isFirst, isLast = sidx === chain.steps.length - 1;
    const inGroup = step.groupMember === true;
    const isGroupEnd = step.groupResult !== undefined;

    const row = document.createElement('div');
    row.className = 'paper-step';
    const opSym = { '+': '+', '-': '−', '*': '×', '/': '÷' }[step.op] || '';
    const opCls = (step.op === '+' || step.op === '-') ? (step.op === '+' ? 'add' : 'sub') : '';
    row.innerHTML = '<span class="paper-op ' + opCls + '">' + (isFirst ? (step.op === '-' ? '−' : '') : opSym) + '</span>' +
                     '<span class="paper-val">' + fmtIt(step.value, engine.decimals) + '</span>';
    container.appendChild(row);

    // Step note
    const sn = document.createElement('div');
    sn.className = 'paper-step-note' + (step.note ? '' : ' placeholder');
    sn.textContent = step.note ? '✎ ' + step.note : '+ nota';
    sn.addEventListener('click', () => editStepNote(sn, entryIdx, sidx));
    container.appendChild(sn);

    if (chain.steps.length > 1 && !isFirst) {
      if (inGroup && !isGroupEnd) {
        // skip partial
      } else if (inGroup && isGroupEnd) {
        const gr = document.createElement('div');
        gr.className = 'paper-partial';
        gr.textContent = fmtIt(step.groupResult, engine.decimals);
        container.appendChild(gr);
        if (isLast) {
          const fr = document.createElement('div');
          fr.className = 'paper-final ' + (step.groupRunningTotal > 0 ? 'green' : step.groupRunningTotal < 0 ? 'red' : '');
          fr.innerHTML = '<span class="eq">=</span><span class="val">' + fmtIt(step.groupRunningTotal, engine.decimals) + '</span><span class="tot">TOT</span>';
          container.appendChild(fr);
        } else {
          const rt = document.createElement('div');
          rt.className = 'paper-partial';
          rt.textContent = fmtIt(step.groupRunningTotal, engine.decimals);
          container.appendChild(rt);
        }
      } else if (isLast) {
        const fr = document.createElement('div');
        fr.className = 'paper-final ' + (step.partial > 0 ? 'green' : step.partial < 0 ? 'red' : '');
        fr.innerHTML = '<span class="eq">=</span><span class="val">' + fmtIt(step.partial, engine.decimals) + '</span><span class="tot">TOT</span>';
        container.appendChild(fr);
      } else {
        const pr = document.createElement('div');
        pr.className = 'paper-partial';
        pr.textContent = fmtIt(step.partial, engine.decimals);
        container.appendChild(pr);
      }
    }
  });
}

function editNote(el, kind, idx) {
  const old = (kind === 'header') ? state.headerNote :
              (kind === 'entry') ? state.tape[idx].note : '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'paper-edit-input';
  input.value = old;
  input.placeholder = kind === 'header' ? 'Cliente, lavoro...' : 'Nota...';
  el.replaceWith(input);
  input.focus(); input.select();
  const save = () => {
    const v = input.value.trim();
    if (kind === 'header') state.headerNote = v;
    else if (kind === 'entry') state.tape[idx].note = v;
    saveState(state);
    renderTape();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { renderTape(); } });
}
function editStepNote(el, entryIdx, sidx) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'paper-edit-input';
  input.value = state.tape[entryIdx].chain.steps[sidx].note || '';
  input.placeholder = 'Nota...';
  el.replaceWith(input);
  input.focus(); input.select();
  const save = () => {
    state.tape[entryIdx].chain.steps[sidx].note = input.value.trim();
    saveState(state);
    renderTape();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') renderTape(); });
}

// ============================================================
// EXPORT (PNG / PDF)
// ============================================================
$('btnPng').addEventListener('click', async () => {
  if (state.tape.length === 0) { showToast('Nastro vuoto'); return; }
  try {
    const canvas = await html2canvas(paper, { backgroundColor: '#f4efe2', scale: 2 });
    const dataUrl = canvas.toDataURL('image/png');
    const fname = 'Calcolatrice_' + stampFile() + '.png';
    if (window.AndroidSaver && window.AndroidSaver.saveBase64) {
      window.AndroidSaver.saveBase64(dataUrl, fname, 'image/png');
    } else {
      const link = document.createElement('a');
      link.download = fname;
      link.href = dataUrl;
      link.click();
    }
  } catch (e) { alert('Errore PNG: ' + e); }
});
$('btnPdf').addEventListener('click', async () => {
  if (state.tape.length === 0) { showToast('Nastro vuoto'); return; }
  try {
    const canvas = await html2canvas(paper, { backgroundColor: '#f4efe2', scale: 2 });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const availW = pageW - 2 * margin;
    const imgRatio = canvas.height / canvas.width;
    const imgH = availW * imgRatio;
    const dataUrl = canvas.toDataURL('image/png');
    // Split into pages if needed
    if (imgH <= pageH - 2 * margin) {
      pdf.addImage(dataUrl, 'PNG', margin, margin, availW, imgH);
    } else {
      const pageImgH = pageH - 2 * margin;
      const totalPages = Math.ceil(imgH / pageImgH);
      const pxPerPage = canvas.width * (pageImgH / availW);
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = pxPerPage;
      const ctx = tmp.getContext('2d');
      for (let p = 0; p < totalPages; p++) {
        ctx.fillStyle = '#f4efe2';
        ctx.fillRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(canvas, 0, -p * pxPerPage);
        if (p > 0) pdf.addPage();
        pdf.addImage(tmp.toDataURL('image/png'), 'PNG', margin, margin, availW, pageImgH);
      }
    }
    pdf.save('Calcolatrice_' + stampFile() + '.pdf');
    // On Android WebView, also push via bridge (jsPDF .save uses blob download
    // which may not trigger in WebView)
    if (window.AndroidSaver && window.AndroidSaver.saveBase64) {
      const pdfData = pdf.output('datauristring');
      window.AndroidSaver.saveBase64(pdfData, 'Calcolatrice_' + stampFile() + '.pdf', 'application/pdf');
    }
  } catch (e) { alert('Errore PDF: ' + e); }
});
$('btnClear').addEventListener('click', () => {
  if (state.tape.length === 0) { showToast('Nastro vuoto'); return; }
  if (confirm('Cancellare tutti i ' + state.tape.length + ' calcoli del nastro?\nQuesta operazione non si può annullare.')) {
    state.tape = []; state.headerNote = '';
    saveState(state); renderTape();
    $('tapeCount').textContent = '0';
  }
});
function stampFile() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() +
         '_' + pad(d.getHours()) + '-' + pad(d.getMinutes());
}

// ============================================================
// TOAST
// ============================================================
let toastTimer;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ============================================================
// KEYBOARD
// ============================================================
window.addEventListener('keydown', e => {
  if (document.activeElement === exprLine) return;
  if (tapeSheet.classList.contains('open')) return;
  const k = e.key;
  if (/[0-9]/.test(k)) onButton(k);
  else if (k === '+') onButton('+');
  else if (k === '-') onButton('\u2212');
  else if (k === '*') onButton('\u00D7');
  else if (k === '/') { e.preventDefault(); onButton('\u00F7'); }
  else if (k === '.' || k === ',') onButton(',');
  else if (k === 'Enter' || k === '=') { e.preventDefault(); onButton('='); }
  else if (k === 'Backspace') onButton('\u232B');
  else if (k === 'Escape') onButton('AC');
});

// ============================================================
// INIT
// ============================================================
function init() {
  // Update date chip
  const d = new Date();
  $('dateChip').textContent = String(d.getDate()).padStart(2, '0') + '/' +
                                 String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  $('tapeCount').textContent = state.tape.length;
  buildPad();
  refreshIndicators();
  updateDisplay();
}
init();
