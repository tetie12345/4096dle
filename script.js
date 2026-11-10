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
let currentGuess = ''; // in-progress guess string
let guesses = []; // global guess history (same for all boards)
let visibleBoards = new Set(); // set of board indices currently in viewport
let minimapState = []; // cached state per board for minimap diffing
let minimapMode = 'none'; // 'none' | 'old' | 'new'
let boardObserver = null;

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
  let pool;
  if (numWords <= ANSWERS.length) {
    pool = [...ANSWERS];
  } else {
    // Expand pool to all valid guesses so 4096 unique answers are possible
    pool = [...VALID_GUESSES];
  }
  answers = [];
  const used = new Set();
  // Always dedup: never allow two boards to share an answer
  while (answers.length < numWords && used.size < pool.length) {
    const w = pool[Math.floor(Math.random() * pool.length)].toUpperCase();
    if (used.has(w)) continue;
    used.add(w);
    answers.push(w);
  }
  // If pool exhausted (shouldn't happen for <=4096), pad with repeats as last resort
  while (answers.length < numWords) {
    answers.push(pool[Math.floor(Math.random() * pool.length)].toUpperCase());
  }
  locked = answers.map(() => false);
  keyStates = answers.map(() => ({}));
  foundLetters = answers.map(() => new Set());
  guesses = [];
  currentGuess = '';
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
  visibleBoards = new Set();
  let html = '';
  for (let w = 0; w < numWords; w++) {
    html += '<div class="word-board" data-w="' + w + '"><div class="board-label">' + (w + 1) + '</div><div class="board-grid"></div></div>';
  }
  boardEl.innerHTML = html;
  const boards = boardEl.children;
  for (let w = 0; w < numWords; w++) {
    const wb = boards[w];
    boardEls[w] = wb;
    board[w] = [];
    wb.addEventListener('click', () => selectWord(w));
  }
  setTimeout(updateVisibleBoards, 50);
}

function renderBoard(w) {
  const wb = boardEls[w];
  if (!wb) return;
  const grid = wb.querySelector('.board-grid') || wb.children[1];
  grid.innerHTML = '';
  board[w] = [];
  const numRows = Math.min(guesses.length + 1, ROWS); // at least 1 row
  // ensure at least currentRow+1 rows up to ROWS
  const totalRows = Math.min(ROWS, Math.max(numRows, currentRow + 6));
  for (let r = 0; r < totalRows; r++) {
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
  // fill from guesses
  for (let r = 0; r < guesses.length; r++) {
    const g = guesses[r];
    const res = scoreGuess(g, answers[w]);
    for (let c = 0; c < COLS; c++) {
      const tile = board[w][r][c];
      tile.textContent = g[c];
      tile.classList.add(res[c]);
    }
  }
  // current row input (if not locked and within range)
  if (!locked[w] && guesses.length < ROWS) {
    const row = board[w][guesses.length];
    if (row) {
      for (let c = 0; c < currentCol; c++) {
        if (row[c]) {
          row[c].textContent = currentGuess[c] || '';
          row[c].classList.add('filled');
        }
      }
    }
  }
  updateRowVisibilityOne(w);
}

function clearBoard(w) {
  const wb = boardEls[w];
  if (!wb) return;
  const grid = wb.querySelector('.board-grid') || wb.children[1];
  if (grid) grid.innerHTML = '';
  board[w] = [];
}

function updateRowVisibilityOne(w) {
  if (!board[w] || !board[w].length) return;
  for (let r = 0; r < board[w].length; r++) {
    const rowEl = board[w][r][0].parentNode;
    if (r <= currentRow + 5) rowEl.style.display = '';
    else rowEl.style.display = 'none';
  }
}

function updateVisibleBoards() {
  if (!boardEls.length) return;
  const vh = window.innerHeight;
  const margin = 150;
  for (let w = 0; w < numWords; w++) {
    const wb = boardEls[w];
    if (!wb) continue;
    const rect = wb.getBoundingClientRect();
    if (rect.top > vh + margin) break; // rest are below viewport
    const inView = rect.bottom > -margin && rect.top < vh + margin;
    if (inView) {
      if (!visibleBoards.has(w)) {
        visibleBoards.add(w);
        renderBoard(w);
      }
    } else {
      if (rect.bottom < -margin) {
        // above viewport
        if (visibleBoards.has(w) && w !== selectedWord) {
          visibleBoards.delete(w);
          clearBoard(w);
        }
      }
    }
  }
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
      currentGuess = currentGuess.slice(0, -1);
      for (const w of visibleBoards) {
        if (locked[w]) continue;
        ensureRows(w, currentRow);
        if (!board[w] || !board[w][currentRow]) continue;
        const tile = board[w][currentRow][currentCol];
        if (tile) { tile.textContent = ''; tile.classList.remove('filled'); }
      }
    }
    return;
  }
  if (key === 'ENTER') {
    submitGuess();
    return;
  }
  if (currentCol < COLS && /^[A-Z]$/.test(key)) {
    currentGuess += key;
    for (const w of visibleBoards) {
      if (locked[w]) continue;
      ensureRows(w, currentRow);
      if (!board[w] || !board[w][currentRow]) continue;
      const tile = board[w][currentRow][currentCol];
      if (tile) { tile.textContent = key; tile.classList.add('filled'); }
    }
    currentCol++;
  }
}

function submitGuess() {
  if (currentCol !== COLS) {
    showMessage('Not enough letters');
    return;
  }
  const guess = currentGuess.toUpperCase();
  if (guess.length !== COLS) {
    showMessage('Not enough letters');
    return;
  }
  const gb = firstUnlockedBoard();
  if (gb === -1) { gameOver = true; return; }
  if (!VALID_GUESSES.has(guess.toLowerCase())) {
    showMessage('Not in word list');
    return;
  }
  // Score per word (data only)
  for (let w = 0; w < numWords; w++) {
    if (locked[w]) continue;
    const result = scoreGuess(guess, answers[w]);
    const bestKeyState = {};
    for (let c = 0; c < COLS; c++) {
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
    // update DOM tiles for visible boards (in place, no full rebuild)
    if (board[w] && board[w][currentRow]) {
      for (let c = 0; c < COLS; c++) {
        const tile = board[w][currentRow][c];
        if (tile) tile.classList.add(result[c]);
      }
    }
    if (guess === answers[w]) {
      locked[w] = true;
      if (boardEls[w]) boardEls[w].classList.add('locked');
    }
  }
  guesses.push(guess);
  currentGuess = '';
  // Ensure next row exists for visible boards
  for (const w of visibleBoards) {
    if (!locked[w]) ensureRows(w, currentRow + 1);
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
  const sqSize = minimapMode === 'old' ? 10 : 24;
  const gap = minimapMode === 'old' ? 2 : 4;
  let cols;
  if (minimapMode === 'old') {
    cols = Math.ceil(Math.sqrt(numWords));
    // cap to container width
    const maxCols = Math.floor(260 / (sqSize + gap));
    if (cols > maxCols) cols = maxCols;
  } else {
    const availW = Math.floor(window.innerWidth * 0.9);
    cols = Math.max(1, Math.min(numWords, Math.floor(availW / (sqSize + gap))));
  }
  mm.style.gridTemplateColumns = `repeat(${cols}, ${sqSize}px)`;
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
  if (mm.classList.contains('hidden')) return;
  if (mm.classList.contains('collapsed')) return;
  const sqs = mm.children;
  if (!sqs.length) return;
  for (let w = 0; w < numWords; w++) {
    const sq = sqs[w];
    if (!sq) continue;
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
    if (!visibleBoards.has(w)) {
      visibleBoards.add(w);
      renderBoard(w);
    }
    // render neighbors to stabilize layout before scrolling
    for (let d = -2; d <= 2; d++) {
      const idx = w + d;
      if (idx >= 0 && idx < numWords && !visibleBoards.has(idx)) {
        visibleBoards.add(idx);
        renderBoard(idx);
      }
    }
    // Repeatedly re-scroll until layout (board heights) stabilizes
    let _stabRemaining = 8;
    function _stab() {
      if (_stabRemaining <= 0) return;
      if (boardEls[w]) {
        boardEls[w].scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      }
      updateVisibleBoards();
      _stabRemaining--;
      if (_stabRemaining > 0) setTimeout(_stab, 150);
    }
    _stab();
    setTimeout(updateVisibleBoards, 250);
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
  const gl = document.getElementById('gamesLeft');
  if (gl) gl.innerHTML = '<span>Games: ' + unsolved + '</span><span>Guesses: ' + guessesLeft + '</span><span>Free: ' + extra + '</span>';
}
function showMessage(msg) {
  messageEl.textContent = msg;
  if (msg) messageEl.classList.add('show');
  else messageEl.classList.remove('show');
  if (msg.startsWith('You win') || msg.startsWith('Game over') || msg.startsWith('Answers')) {
    // keep visible
  } else if (msg) {
    setTimeout(() => { if (messageEl.textContent === msg) { messageEl.textContent = ''; messageEl.classList.remove('show'); } }, 2000);
  }
}

function newGame() {
  pickAnswers();
  currentRow = 0;
  currentCol = 0;
  gameOver = false;
  messageEl.textContent = '';
  messageEl.classList.remove('show');
  boardEl.innerHTML = '';
  visibleBoards = new Set();
  minimapState = [];
  initBoard();
  initKeyboard();
  keyboardEl.querySelectorAll('.key').forEach(k => {
    k.classList.remove('correct','present','absent');
    delete k.dataset.state;
  });
  setTimeout(() => {
    // Determine minimap mode
    if (numWords < 16) minimapMode = 'none';
    else if (numWords < 256) minimapMode = 'old';
    else minimapMode = 'new';
    const mm = document.getElementById('minimap');
    const tog = document.getElementById('minimapToggle');
    mm.classList.remove('old', 'new', 'collapsed');
    tog.classList.remove('hidden');
    if (minimapMode === 'none') {
      mm.classList.add('hidden');
      tog.classList.add('hidden');
      return;
    }
    mm.classList.add(minimapMode);
    if (minimapMode === 'new') {
      if (numWords > 64) {
        mm.classList.add('collapsed');
        tog.textContent = 'Map';
      } else {
        mm.classList.remove('collapsed');
        tog.textContent = 'Hide Map';
      }
    } else {
      // old style: always visible, no toggle
      mm.classList.remove('collapsed');
      tog.classList.add('hidden');
    }
    buildMinimap();
    renderMinimap();
  }, 0);
  selectWord(0);
  updateStatus(false);
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
  const size = n <= 4 ? 52 : (n <= 16 ? 40 : (n <= 64 ? 34 : (n <= 256 ? 28 : 20)));
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
  const gl = document.getElementById('gamesLeft');
  if (kb.classList.contains('hidden-kb')) {
    kb.classList.remove('hidden-kb');
    if (gl) gl.classList.remove('hidden');
    btn.textContent = 'Hide KB';
  } else {
    kb.classList.add('hidden-kb');
    if (gl) gl.classList.add('hidden');
    btn.textContent = 'Show KB';
  }
});
document.getElementById('minimapToggle').addEventListener('click', () => {
  const mm = document.getElementById('minimap');
  const btn = document.getElementById('minimapToggle');
  if (mm.classList.contains('collapsed')) {
    mm.classList.remove('collapsed');
    btn.textContent = 'Hide Map';
    renderMinimap();
  } else {
    mm.classList.add('collapsed');
    btn.textContent = 'Map';
  }
});

let _scrollTimer = null;
let _lastScrollY = -1;
let _stillTimer = null;
let _isStill = false;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (y === _lastScrollY) return; // no actual change
  _lastScrollY = y;
  _isStill = false;
  if (_stillTimer) clearTimeout(_stillTimer);
  _stillTimer = setTimeout(() => { _isStill = true; }, 2000);
  if (_scrollTimer) return;
  _scrollTimer = setTimeout(() => {
    _scrollTimer = null;
    if (!_isStill) updateVisibleBoards();
  }, 500);
}, true);

document.addEventListener('keydown', e => {
  if (modeSelect && !modeSelect.classList.contains('hidden')) return;
  if (e.key === 'Enter') { e.preventDefault(); if (gameOver) { newGame(); return; } handleKey('ENTER'); }
  else if (e.key === 'Backspace') { e.preventDefault(); handleKey('BACK'); }
  else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
});