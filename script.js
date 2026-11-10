const COLS = 5;
let ROWS = 6;
let numWords = 1;
let selectedWord = 0;
let keyStates = []; // keyStates[w] = { letter: state }
let answers = [];
let currentRow = 0;
let currentCol = 0;
let gameOver = false;
let board = []; // board[row][wordIndex][col] = tile element
let solved = []; // solved[wordIndex] = bool

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
  solved = answers.map(() => false);
  keyStates = answers.map(() => ({}));
  selectedWord = 0;
}

function initBoard() {
  boardEl.innerHTML = '';
  board = []; // board[wordIndex][row][col]
  for (let w = 0; w < numWords; w++) {
    const wb = document.createElement('div');
    wb.className = 'word-board';
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      const tiles = [];
      for (let c = 0; c < COLS; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        rowEl.appendChild(tile);
        tiles.push(tile);
      }
      wb.appendChild(rowEl);
      rows.push(tiles);
    }
    boardEl.appendChild(wb);
    board.push(rows);
    // selection
    wb.addEventListener('click', () => selectWord(w));
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

function handleKey(key) {
  if (gameOver) return;
  if (key === 'BACK') {
    if (currentCol > 0) {
      currentCol--;
      for (let w = 0; w < numWords; w++) {
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
  const guess = board[0][currentRow].map(t => t.textContent).join('');
  if (!VALID_GUESSES.has(guess.toLowerCase())) {
    showMessage('Not in word list');
    return;
  }
  // Score per word
  for (let w = 0; w < numWords; w++) {
    if (solved[w]) {
      for (let c = 0; c < COLS; c++) {
        board[w][currentRow][c].classList.add('correct');
      }
      continue;
    }
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
      solved[w] = true;
    }
  }
  renderKeyboard();
  const allSolved = solved.every(Boolean);
  if (allSolved) {
    subtitleEl.textContent = 'Solved! Answers: ' + answers.join(', ');
    showMessage('You win! Answers: ' + answers.join(', '));
    gameOver = true;
    return;
  }
  currentRow++;
  currentCol = 0;
  if (currentRow === ROWS) {
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

function updateKeyColor(letter, state) {
  const btn = keyboardEl.querySelector(`[data-key="${letter}"]`);
  if (!btn) return;
  const priority = { correct: 3, present: 2, absent: 1 };
  const current = btn.dataset.state || '';
  if ((priority[state] || 0) > (priority[current] || 0)) {
    btn.classList.remove('correct','present','absent');
    btn.classList.add(state);
    btn.dataset.state = state;
  }
}

function showMessage(msg) {
  messageEl.textContent = msg;
  if (msg.startsWith('You win') || msg.startsWith('Game over') || msg.startsWith('Answers')) {
    // keep visible
  } else {
    setTimeout(() => { if (messageEl.textContent === msg) messageEl.textContent = ''; }, 2000);
  }
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
function newGame() {
  pickAnswers();
  currentRow = 0;
  currentCol = 0;
  gameOver = false;
  messageEl.textContent = '';
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
  numWords = n;
  ROWS = (n === 1) ? 6 : 9;
  modeSelect.classList.add('hidden');
  gameEl.classList.remove('hidden');
  newGame();
}

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => startMode(parseInt(btn.dataset.mode)));
});

document.getElementById('newGame').addEventListener('click', newGame);
document.getElementById('menuBtn').addEventListener('click', showMenu);
document.getElementById('toggleKb').addEventListener('click', () => {
  const kb = document.getElementById('keyboard');
  const btn = document.getElementById('toggleKb');
  if (kb.style.display === 'none') {
    kb.style.display = '';
    btn.textContent = 'Hide KB';
  } else {
    kb.style.display = 'none';
    btn.textContent = 'Show KB';
  }
});

document.addEventListener('keydown', e => {
  if (modeSelect && !modeSelect.classList.contains('hidden')) return;
  if (e.key === 'Enter') { e.preventDefault(); if (gameOver) { newGame(); return; } handleKey('ENTER'); }
  else if (e.key === 'Backspace') { e.preventDefault(); handleKey('BACK'); }
  else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
});