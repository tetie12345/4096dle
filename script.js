const COLS = 5;
let ROWS = 6;
let numWords = 1;
let selectedWord = 0;
let keyStates = []; // keyStates[w] = { letter: state }
let foundLetters = []; // foundLetters[w] = Set of found letters
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
  if (numWords <= pool.length) {
    while (answers.length < numWords) {
      const w = pool[Math.floor(Math.random() * pool.length)].toUpperCase();
      if (used.has(w)) continue;
      used.add(w);
      answers.push(w);
    }
  } else {
    // allow repeats for very large boards
    for (let i = 0; i < numWords; i++) {
      answers.push(pool[Math.floor(Math.random() * pool.length)].toUpperCase());
    }
  }
  locked = answers.map(() => false);
  keyStates = answers.map(() => ({}));
  foundLetters = answers.map(() => new Set());
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
  const initialRows = Math.min(ROWS - 1, 5);
  let html = '';
  for (let w = 0; w < numWords; w++) {
    html += '<div class="word-board" data-w="' + w + '"><div class="board-label">' + (w + 1) + '</div><div class="board-grid">';
    for (let r = 0; r <= initialRows; r++) {
      html += '<div class="row">';
      for (let c = 0; c < COLS; c++) html += '<div class="tile"></div>';
      html += '</div>';
    }
    html += '</div></div>';
  }
  boardEl.innerHTML = html;
  board = [];
  boardEls = [];
  const boards = boardEl.children;
  for (let w = 0; w < numWords; w++) {
    const wb = boards[w];
    boardEls.push(wb);
    const grid = wb.children[1];
    const rows = [];
    for (let i = 0; i < grid.children.length; i++) {
      const rowEl = grid.children[i];
      const tiles = [];
      for (let j = 0; j < rowEl.children.length; j++) tiles.push(rowEl.children[j]);
      rows.push(tiles);
    }
    board.push(rows);
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
    // track found letters for minimap
    for (let c = 0; c < COLS; c++) {
      if (result[c] === 'correct' || result[c] === 'present') {
        foundLetters[w].add(guess[c]);
      }
    }
    if (guess === answers[w]) {
      locked[w] = true;
      boardEls[w].classList.add('locked');
    }
  }
  renderKeyboard();
  renderMinimap();
  const allLocked = locked.every(Boolean);
  if (allLocked) {
    subtitleEl.textContent = 'Solved! Answers: ' + answers.join(', ');
    showMessage('You win! Answers: ' + answers.join(', '));
    updateStatus(true);
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
  updateStatus(false);
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

function buildMinimap() {
  const mm = document.getElementById('minimap');
  if (!mm) return;
  const cols = Math.ceil(Math.sqrt(numWords));
  mm.style.gridTemplateColumns = `repeat(${cols}, 10px)`;
  mm.innerHTML = '';
  for (let w = 0; w < numWords; w++) {
    const sq = document.createElement('div');
    sq.className = 'minimap-sq';
    sq.title = 'Board ' + (w + 1);
    sq.addEventListener('click', () => selectWord(w));
    mm.appendChild(sq);
  }
}
function renderMinimap() {
  const mm = document.getElementById('minimap');
  if (!mm) return;
  const sqs = mm.children;
  if (!sqs.length) return;
  for (let w = 0; w < numWords; w++) {
    const sq = sqs[w];
    sq.classList.remove('solved', 'solvable', 'selected');
    if (locked[w]) sq.classList.add('solved');
    else {
      const distinct = new Set(answers[w].split(''));
      let solvable = true;
      for (const l of distinct) { if (!foundLetters[w].has(l)) { solvable = false; break; } }
      if (solvable) sq.classList.add('solvable');
    }
    if (w === selectedWord) sq.classList.add('selected');
  }
}
function selectWord(w) {
  selectedWord = w;
  document.querySelectorAll('.word-board').forEach((wb, idx) => {
    wb.classList.toggle('selected', idx === w);
  });
  const fl = document.getElementById('boardLabelFloat');
  if (fl) fl.textContent = 'Board ' + (w + 1);
  renderKeyboard();
  renderMinimap();
  if (boardEls[w]) {
    boardEls[w].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }
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

function updateStatus(justSubmitted) {
  const unsolved = locked.filter(x => !x).length;
  const guessesLeft = ROWS - currentRow - (justSubmitted ? 1 : 0);
  const extra = Math.max(0, guessesLeft - unsolved);
  const statusEl = document.getElementById('status');
  statusEl.innerHTML = '<span>Unsolved: ' + unsolved + '</span><span>Guesses left: ' + guessesLeft + '</span><span class="extra">Extra: ' + extra + '</span>';
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
  buildMinimap();
  if (numWords > 64) {
    document.getElementById('minimap').classList.add('collapsed');
    document.getElementById('minimapToggle').textContent = 'Map';
  } else {
    document.getElementById('minimap').classList.remove('collapsed');
    document.getElementById('minimapToggle').textContent = 'Hide Map';
  }
  selectWord(0);
  updateStatus(false);
  renderMinimap();
  subtitleEl.textContent = numWords === 1
    ? 'Guess the word in 6 tries'
    : `Guess ${numWords} words at once in 6 tries`;
}

function showMenu() {
  gameEl.classList.add('hidden');
  modeSelect.classList.remove('hidden');
}

function startMode(n) {
  n = Math.max(1, Math.min(4096, parseInt(n) || 1));
  numWords = n;
  ROWS = n + 5;
  const size = n <= 4 ? 46 : (n <= 16 ? 34 : (n <= 64 ? 24 : (n <= 256 ? 18 : 12)));
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
document.getElementById('minimapToggle').addEventListener('click', () => {
  const mm = document.getElementById('minimap');
  const btn = document.getElementById('minimapToggle');
  if (mm.classList.contains('collapsed')) {
    mm.classList.remove('collapsed');
    btn.textContent = 'Hide Map';
  } else {
    mm.classList.add('collapsed');
    btn.textContent = 'Map';
  }
});

document.addEventListener('keydown', e => {
  if (modeSelect && !modeSelect.classList.contains('hidden')) return;
  if (e.key === 'Enter') { e.preventDefault(); if (gameOver) { newGame(); return; } handleKey('ENTER'); }
  else if (e.key === 'Backspace') { e.preventDefault(); handleKey('BACK'); }
  else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
});