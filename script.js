const COLS = 5;
let ROWS = 6;
let numWords = 1;
let selectedWord = 0;
let keyStates = []; // keyStates[w] = { letter: state }
let answers = [];
let locked = []; // locked[w] = bool
let currentRow = 0;
let currentCol = 0;
let gameOver = false;
let board = []; // board[w] = array of rows; row = array of tile elements
let boardEls = []; // boardEls[w] = word-board container element

const boardEl = document.getElementById('board');
const keyboardEl = document.getElementById('keyboard');
const messageEl = document.getElementById('message');
const modeSelect = document.getElementById('modeSelect');
const gameEl = document.getElementById('game');
const subtitleEl = document.getElementById('subtitle');

const KEYBOARD_LAYOUT = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','BACK']
];

function pickAnswers() {
  const pool = [...ANSWERS];
  answers = [];
  const used = new Set();
  while (answers.length < numWords) {
    const w = pool[Math.floor(Math.random() * pool.length)].toUpperCase();
    if (used.has(w)) continue;
    used.add(w);
    answers.push(w);
  }
  locked = answers.map(() => false);
  keyStates = answers.map(() => ({}));
  selectedWord = 0;
}

function ensureRows(w, upTo) {
  const wb = boardEls[w];
  const grid = wb.querySelector('.board-grid');
  while (board[w].length <= upTo) {
    const r = board[w].length;
    const rowEl = document.createElement('div');
    rowEl.className = 'row';
    const tiles = [];
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      rowEl.appendChild(tile);
      tiles.push(tile);
    }
    grid.appendChild(rowEl);
    board[w].push(tiles);
  }
}

function initBoard() {
  boardEl.innerHTML = '';
  board = [];
  boardEls = [];
  for (let w = 0; w < numWords; w++) {
    const wb = document.createElement('div');
    wb.className = 'word-board';
    const label = document.createElement('div');
    label.className = 'board-label';
    label.textContent = (w + 1);
    wb.appendChild(label);
    const grid = document.createElement('div');
    grid.className = 'board-grid';
    wb.appendChild(grid);
    boardEl.appendChild(wb);
    board.push([]);
    boardEls.push(wb);
    ensureRows(w, Math.min(ROWS - 1, 5));
    wb.addEventListener('click', () => selectWord(w));
  }
  updateRowVisibility();
}

function updateRowVisibility() {
  for (let w = 0; w < numWords; w++) {
    for (let r = 0; r < board[w].length; r++) {
      const rowEl = board[w][r][0].parentNode;
      if (r <= currentRow + 5) {
        rowEl.style.display = '';
      } else {
        rowEl.style.display = 'none';
      }
    }
  }
}

function initKeyboard() {
  keyboardEl.innerHTML = '';
  KEYBOARD_LAYOUT.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';
    row.forEach(key => {
      const btn = document.createElement('button');
      btn.className = 'key' + (key === 'ENTER' || key === 'BACK' ? ' wide' : '');
      btn.textContent = key === 'BACK' ? '⌫' : key;
      btn.dataset.key = key;
      btn.setAttribute('tabindex', '-1');
      btn.addEventListener('click', () => { handleKey(key); btn.blur(); });
      rowEl.appendChild(btn);
    });
    keyboardEl.appendChild(rowEl);
  });
}

function firstUnlockedBoard() {
  for (let w = 0; w < numWords; w++) {
    if (!locked[w]) return w;
  }
  return -1;
}

function handleKey(key) {
  if (gameOver) return;
  if (key === 'BACK') {
    if (currentCol > 0) {
      currentCol--;
      for (let w = 0; w < numWords; w++) {
        if (locked[w]) continue;
        ensureRows(w, currentRow);
        const tile = board[w][currentRow][currentCol];
        tile.textContent = '';
        tile.classList.remove('filled');
      }
    }
    return;
  }
  if (key === 'ENTER') {
    submitGuess();
    return;
  }
  if (currentCol < COLS && /^[A-Z]$/.test(key)) {
    for (let w = 0; w < numWords; w++) {
      if (locked[w]) continue;
      ensureRows(w, currentRow);
      const tile = board[w][currentRow][currentCol];
      tile.textContent = key;
      tile.classList.add('filled');
    }
    currentCol++;
  }
}

function submitGuess() {
  if (currentCol !== COLS) {
    showMessage('Not enough letters');
    return;
  }
  const gb = firstUnlockedBoard();
  if (gb === -1) { gameOver = true; return; }
  ensureRows(gb, currentRow);
  const guess = board[gb][currentRow].map(t => t.textContent).join('');
  if (!VALID_GUESSES.has(guess.toLowerCase())) {
    showMessage('Not in word list');
    return;
  }
  // Score per word
  for (let w = 0; w < numWords; w++) {
    if (locked[w]) continue;
    ensureRows(w, currentRow);
    const result = scoreGuess(guess, answers[w]);
    const bestKeyState = {};
    for (let c = 0; c < COLS; c++) {
      board[w][currentRow][c].classList.add(result[c]);
      const letter = guess[c];
      const cur = bestKeyState[letter];
      const priority = { correct: 3, present: 2, absent: 1 };
      if (!cur || (priority[result[c]] || 0) > (priority[cur] || 0)) {
        bestKeyState[letter] = result[c];
      }
    }
    // merge into keyStates[w]
    const ks = keyStates[w];
    for (const letter in bestKeyState) {
      const priority = { correct: 3, present: 2, absent: 1 };
      const cur = ks[letter];
      if (!cur || (priority[bestKeyState[letter]] || 0) > (priority[cur] || 0)) {
        ks[letter] = bestKeyState[letter];
      }
    }
    if (guess === answers[w]) {
      locked[w] = true;
      boardEls[w].classList.add('locked');
    }
  }
  renderKeyboard();
  const allLocked = locked.every(Boolean);
  if (allLocked) {
    subtitleEl.textContent = 'Solved! Answers: ' + answers.join(', ');
    showMessage('You win! Answers: ' + answers.join(', '));
    gameOver = true;
    return;
  }
  currentRow++;
  currentCol = 0;
  // ensure rows for next typing
  for (let w = 0; w < numWords; w++) {
    if (locked[w]) continue;
    ensureRows(w, currentRow + 5);
  }
  updateRowVisibility();
  if (currentRow >= ROWS) {
    subtitleEl.textContent = 'Answers: ' + answers.join(', ');
    showMessage('Game over. Answers: ' + answers.join(', '));
    gameOver = true;
  }
}

function scoreGuess(guess, answer) {
  const res = Array(COLS).fill('absent');
  const ansArr = answer.split('');
  const guessArr = guess.split('');
  for (let i = 0; i < COLS; i++) {
    if (guessArr[i] === ansArr[i]) {
      res[i] = 'correct';
      ansArr[i] = null;
      guessArr[i] = null;
    }
  }
  for (let i = 0; i < COLS; i++) {
    if (guessArr[i] === null) continue;
    const idx = ansArr.indexOf(guessArr[i]);
    if (idx !== -1) {
      res[i] = 'present';
      ansArr[idx] = null;
    }
  }
  return res;
}

function selectWord(w) {
  selectedWord = w;
  document.querySelectorAll('.word-board').forEach((wb, idx) => {
    wb.classList.toggle('selected', idx === w);
  });
  renderKeyboard();
}

function renderKeyboard() {
  const ks = keyStates[selectedWord] || {};
  keyboardEl.querySelectorAll('.key').forEach(btn => {
    const letter = btn.dataset.key;
    btn.classList.remove('correct','present','absent');
    if (ks[letter]) {
      btn.classList.add(ks[letter]);
      btn.dataset.state = ks[letter];
    } else {
      delete btn.dataset.state;
    }
  });
}

function showMessage(msg) {
  messageEl.textContent = msg;
  if (msg.startsWith('You win') || msg.startsWith('Game over') || msg.startsWith('Answers')) {
    // keep visible
  } else {
    setTimeout(() => { if (messageEl.textContent === msg) messageEl.textContent = ''; }, 2000);
  }
}

function newGame() {
  pickAnswers();
  currentRow = 0;
  currentCol = 0;
  gameOver = false;
  messageEl.textContent = '';
  boardEl.innerHTML = '';
  initBoard();
  initKeyboard();
  keyboardEl.querySelectorAll('.key').forEach(k => {
    k.classList.remove('correct','present','absent');
    delete k.dataset.state;
  });
  selectWord(0);
  subtitleEl.textContent = numWords === 1
    ? 'Guess the word in 6 tries'
    : `Guess ${numWords} words at once in 6 tries`;
}

function showMenu() {
  gameEl.classList.add('hidden');
  modeSelect.classList.remove('hidden');
}

function startMode(n) {
  n = Math.max(1, Math.min(256, parseInt(n) || 1));
  numWords = n;
  ROWS = Math.min(200, n + 5);
  const size = n <= 4 ? 46 : (n <= 16 ? 34 : 24);
  document.documentElement.style.setProperty('--tile-size', size + 'px');
  document.documentElement.style.setProperty('--rows', ROWS);
  modeSelect.classList.add('hidden');
  gameEl.classList.remove('hidden');
  newGame();
}

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => startMode(parseInt(btn.dataset.mode)));
});
document.getElementById('modeStart').addEventListener('click', () => {
  startMode(document.getElementById('modeInput').value);
});

document.getElementById('newGame').addEventListener('click', newGame);
document.getElementById('menuBtn').addEventListener('click', showMenu);
document.getElementById('toggleKb').addEventListener('click', () => {
  const kb = document.getElementById('keyboard');
  const btn = document.getElementById('toggleKb');
  if (kb.classList.contains('hidden-kb')) {
    kb.classList.remove('hidden-kb');
    btn.textContent = 'Hide KB';
  } else {
    kb.classList.add('hidden-kb');
    btn.textContent = 'Show KB';
  }
});

document.addEventListener('keydown', e => {
  if (modeSelect && !modeSelect.classList.contains('hidden')) return;
  if (e.key === 'Enter') { e.preventDefault(); if (gameOver) { newGame(); return; } handleKey('ENTER'); }
  else if (e.key === 'Backspace') { e.preventDefault(); handleKey('BACK'); }
  else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
});