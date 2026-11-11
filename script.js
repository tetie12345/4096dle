const COLS = 5;
let ROWS = 6;
let numWords = 1;
let selectedWord = 0;
let keyStates = []; // keyStates[w] = { letter: state }
let foundLetters = []; // foundLetters[w] = Set of found letters
let answerLetters = []; // cached distinct letters per answer (perf: avoid Sets in render loop)
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
  answerLetters = answers.map(a => new Set(a.split('')));
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
  setTimeout(() => { updateVisibleBoards(); updateBoardMinHeights(); }, 50);
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

let _lastMinH = -1, _lastMinW = -1;
function updateBoardMinHeights() {
  const tileSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-size')) || 46;
  const rows = Math.min(ROWS, (currentRow || 0) + 6);
  const h = rows * (tileSize + 4) + 40;
  const w = 5 * tileSize + 4 * 4 + 16 + 4;
  if (h === _lastMinH && w === _lastMinW) return; // nothing changed — skip 4096 style writes
  _lastMinH = h; _lastMinW = w;
  const cis = w + 'px ' + h + 'px';
  for (let w2 = 0; w2 < numWords; w2++) {
    const wb = boardEls[w2];
    if (wb) {
      wb.style.minHeight = h + 'px';
      wb.style.minWidth = w + 'px';
      wb.style.containIntrinsicSize = cis;
    }
  }
}

function updateRowVisibilityOne(w) {
  if (!board[w] || !board[w].length) return;
  for (let r = 0; r < board[w].length; r++) {
    const rowEl = board[w][r][0].parentNode;
    if (r <= currentRow + 5) rowEl.style.display = '';
    else rowEl.style.display = 'none';
  }
}

let _renderQueue = [];
let _renderBudget = 12;
let _drainScheduled = false;
function scheduleRenderDrain() {
  if (_drainScheduled) return;
  _drainScheduled = true;
  requestAnimationFrame(() => {
    _drainScheduled = false;
    _renderBudget = 12;
    while (_renderQueue.length && _renderBudget > 0) {
      const w = _renderQueue.shift();
      _renderBudget--;
      if (boardEls[w]) renderBoard(w);
    }
    if (_renderQueue.length) scheduleRenderDrain();
  });
}
function updateVisibleBoards() {
  if (!boardEls.length) return;
  const vh = window.innerHeight;
  const margin = 600;
  // read ALL rects first, then mutate — avoids layout thrashing mid-loop
  const rects = new Array(numWords);
  for (let w = 0; w < numWords; w++) {
    rects[w] = boardEls[w] ? boardEls[w].getBoundingClientRect() : null;
  }
  for (let w = 0; w < numWords; w++) {
    const wb = boardEls[w];
    if (!wb) continue;
    const rect = rects[w];
    if (!rect) continue;
    if (rect.top > vh + margin) break; // rest are below viewport
    const inView = rect.bottom > -margin && rect.top < vh + margin;
    if (inView) {
      if (!visibleBoards.has(w)) {
        visibleBoards.add(w);
        // render budget: at most 12 boards per pass, defer the rest to rAF
        if (_renderBudget > 0) { _renderBudget--; renderBoard(w); }
        else { _renderQueue.push(w); scheduleRenderDrain(); }
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

function extraGuesses(n) {
  // Linear: 5 extra on 1 word, 20 extra on 4096 words
  return Math.round(5 + 15 * (n - 1) / 4095);
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
  const _oldScrollY = window.scrollY;
  const _oldHeight = document.documentElement.scrollHeight;
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
  updateRowVisibility();
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
  updateBoardMinHeights();
  updateVisibleBoards();
  // Compensate scroll so the view stays at the same relative position
  const _newHeight = document.documentElement.scrollHeight;
  if (_oldHeight > 0 && _newHeight !== _oldHeight) {
    const ratio = _newHeight / _oldHeight;
    window.scrollTo(0, _oldScrollY * ratio);
  }
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
  const mobile = window.innerWidth <= 600;
  const sqSize = minimapMode === 'old' ? (mobile ? 13 : 12) : (mobile ? 13 : 24);
  const gap = minimapMode === 'old' ? (mobile ? 3 : 2) : (mobile ? 3 : 4);
  const pad = mobile ? 16 : 20;
  let cols;
  if (minimapMode === 'old') {
    cols = Math.ceil(Math.sqrt(numWords));
    // cap to container width (small screens: nearly full width)
    const maxW = mobile ? window.innerWidth - 20 : 260;
    const maxCols = Math.max(1, Math.floor((maxW - pad) / (sqSize + gap)));
    if (cols > maxCols) cols = maxCols;
  } else {
    // fit the grid exactly inside the available width — no horizontal scrolling
    const availW = mobile ? window.innerWidth - 16 : window.innerWidth * 0.9;
    cols = Math.max(1, Math.min(numWords, Math.floor((availW - pad) / (sqSize + gap))));
  }
  mm.style.gridTemplateColumns = `repeat(${cols}, ${sqSize}px)`;
  // pin the container width to the grid so it never overflows
  mm.style.width = Math.min(
    mobile ? window.innerWidth - 16 : window.innerWidth * 0.9,
    cols * (sqSize + gap) - gap + pad
  ) + 'px';
  // one delegated listener + fragment instead of 4096 closures — much faster init
  if (!mm._delegated) {
    mm.addEventListener('click', e => {
      const sq = e.target.closest('.minimap-sq');
      if (sq) selectWord(parseInt(sq.dataset.w));
    });
    mm._delegated = true;
  }
  const frag = document.createDocumentFragment();
  for (let w = 0; w < numWords; w++) {
    const sq = document.createElement('div');
    sq.className = 'minimap-sq';
    sq.dataset.w = w;
    sq.title = 'Board ' + (w + 1);
    frag.appendChild(sq);
  }
  mm.replaceChildren(frag);
  minimapState = [];
  _mmSelected = -1;
}
let _mmSelected = -1;
function renderMinimap() {
  const mm = document.getElementById('minimap');
  if (!mm) return;
  if (mm.classList.contains('hidden')) return;
  if (mm.classList.contains('collapsed')) return;
  const sqs = mm.children;
  if (!sqs.length) return;
  // only touch squares whose state changed (perf: 4096 squares on big modes)
  for (let w = 0; w < numWords; w++) {
    const sq = sqs[w];
    if (!sq) continue;
    let st = '';
    if (locked[w]) st = 'solved';
    else {
      let solvable = true;
      for (const l of answerLetters[w]) { if (!foundLetters[w].has(l)) { solvable = false; break; } }
      if (solvable) st = 'solvable';
    }
    if (minimapState[w] !== st) {
      minimapState[w] = st;
      sq.className = 'minimap-sq' + (st ? ' ' + st : '') + (w === selectedWord ? ' selected' : '');
    }
  }
  // selection: toggle only the previous and current squares
  if (_mmSelected !== selectedWord) {
    if (_mmSelected >= 0 && sqs[_mmSelected]) sqs[_mmSelected].classList.remove('selected');
    if (sqs[selectedWord]) sqs[selectedWord].classList.add('selected');
    _mmSelected = selectedWord;
  }
}
function selectWord(w) {
  selectedWord = w;
  document.querySelectorAll('.word-board').forEach((wb, idx) => {
    wb.classList.toggle('selected', idx === w);
  });
  const fl = document.getElementById('hudBoard');
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
    let _stabRemaining = 4;
    function _stab() {
      if (_stabRemaining <= 0) return;
      if (boardEls[w]) {
        boardEls[w].scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      }
      updateVisibleBoards();
      _stabRemaining--;
      if (_stabRemaining > 0) setTimeout(_stab, 120);
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
  const statsEl = document.getElementById('hudStats');
  if (statsEl) statsEl.innerHTML =
    '<span>Unsolved <b>' + unsolved + '</b></span>' +
    '<span>Guesses <b>' + guessesLeft + '</b></span>' +
    '<span class="extra">Extra <b>' + extra + '</b></span>';
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
  _lastMinH = -1; _lastMinW = -1;
  updateBoardMinHeights();
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
    mm.classList.remove('old', 'new', 'collapsed', 'hidden');
    tog.classList.remove('hidden');
    tog.textContent = 'Hide Map';
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
      // old style: visible with toggle
      mm.classList.remove('collapsed');
      tog.classList.remove('hidden');
      tog.textContent = 'Hide Map';
    }
    buildMinimap();
    renderMinimap();
    syncMapClose();
  }, 0);
  selectWord(0);
  updateStatus(false);
  updateKbHeight();
  subtitleEl.textContent = numWords === 1
    ? `Guess the word in ${ROWS} tries`
    : `Guess ${numWords} words at once in ${ROWS} tries`;
}

function syncMapClose() {
  const mm = document.getElementById('minimap');
  const mc = document.getElementById('mapClose');
  if (!mm || !mc) return;
  const open = !mm.classList.contains('hidden') && !mm.classList.contains('collapsed')
    && !gameEl.classList.contains('hidden');
  mc.classList.toggle('hidden', !open);
}
function showMenu() {
  gameEl.classList.add('hidden');
  modeSelect.classList.remove('hidden');
  // hide floating game UI while in the menu
  document.getElementById('minimapToggle').classList.add('hidden');
  document.getElementById('minimap').classList.add('hidden');
  syncMapClose();
}

function baseTileSize(n) {
  return n <= 4 ? 52 : (n <= 16 ? 40 : (n <= 64 ? 34 : (n <= 256 ? 28 : 20)));
}

// Viewport-aware tile size: never wider than the screen, so boards fit on phones.
function applyTileSize() {
  const base = baseTileSize(numWords);
  // word-board: padding 2*8 + border 2*2 = 20 on desktop (8 on mobile), grid gaps 4*4 = 16
  const chrome = window.innerWidth <= 600 ? 18 : 36;
  const avail = window.innerWidth - 24;
  const size = Math.max(16, Math.min(base, Math.floor((avail - chrome) / 5)));
  document.documentElement.style.setProperty('--tile-size', size + 'px');
  updateBoardMinHeights();
  updateKbHeight();
}

function updateKbHeight() {
  const kb = document.getElementById('keyboard');
  const h = kb && !kb.classList.contains('hidden-kb') ? kb.offsetHeight + 8 : 0;
  document.documentElement.style.setProperty('--kb-h', h + 'px');
}

let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    applyTileSize();
    if (minimapMode !== 'none' && boardEls.length) buildMinimap();
  }, 120);
});

function startMode(n) {
  n = Math.max(1, Math.min(4096, parseInt(n) || 1));
  numWords = n;
  ROWS = n + extraGuesses(n);
  applyTileSize();
  modeSelect.classList.add('hidden');
  gameEl.classList.remove('hidden');
  newGame();
  setTimeout(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; }, 100);
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
  updateKbHeight();
});
document.getElementById('mapClose').addEventListener('click', () => {
  const mm = document.getElementById('minimap');
  mm.classList.add('collapsed');
  document.getElementById('minimapToggle').textContent = 'Map';
  syncMapClose();
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
  syncMapClose();
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
    updateVisibleBoards();
  }, 150);
}, { capture: true, passive: true });

document.addEventListener('keydown', e => {
  if (modeSelect && !modeSelect.classList.contains('hidden')) return;
  if (e.key === 'Enter') { e.preventDefault(); if (gameOver) { newGame(); return; } handleKey('ENTER'); }
  else if (e.key === 'Backspace') { e.preventDefault(); handleKey('BACK'); }
  else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
});