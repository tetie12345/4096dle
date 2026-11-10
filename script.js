const ROWS = 6, COLS = 5;
let answer = '';
let currentRow = 0;
let currentCol = 0;
let gameOver = false;
let board = [];

const boardEl = document.getElementById('board');
const keyboardEl = document.getElementById('keyboard');
const messageEl = document.getElementById('message');

function pickAnswer() {
  answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)].toUpperCase();
}

function initBoard() {
  boardEl.innerHTML = '';
  board = [];
  for (let r = 0; r < ROWS; r++) {
    const row = document.createElement('div');
    row.className = 'row';
    const rowTiles = [];
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      row.appendChild(tile);
      rowTiles.push(tile);
    }
    boardEl.appendChild(row);
    board.push(rowTiles);
  }
}

const KEYBOARD_LAYOUT = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','BACK']
];

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
      btn.addEventListener('click', () => handleKey(key));
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
      board[currentRow][currentCol].textContent = '';
      board[currentRow][currentCol].classList.remove('filled');
    }
    return;
  }
  if (key === 'ENTER') {
    submitGuess();
    return;
  }
  if (currentCol < COLS && /^[A-Z]$/.test(key)) {
    board[currentRow][currentCol].textContent = key;
    board[currentRow][currentCol].classList.add('filled');
    currentCol++;
  }
}

function submitGuess() {
  if (currentCol !== COLS) {
    showMessage('Not enough letters');
    return;
  }
  const guess = board[currentRow].map(t => t.textContent).join('');
  if (!VALID_GUESSES.has(guess.toLowerCase())) {
    showMessage('Not in word list');
    return;
  }
  // Score
  const result = scoreGuess(guess, answer);
  for (let c = 0; c < COLS; c++) {
    board[currentRow][c].classList.add(result[c]);
    updateKeyColor(guess[c], result[c]);
  }
  if (guess === answer) {
    showMessage('You win! 🎉');
    gameOver = true;
    return;
  }
  currentRow++;
  currentCol = 0;
  if (currentRow === ROWS) {
    showMessage('The word was ' + answer);
    gameOver = true;
  }
}

function scoreGuess(guess, answer) {
  const res = Array(COLS).fill('absent');
  const ansArr = answer.split('');
  const guessArr = guess.split('');
  // correct position
  for (let i = 0; i < COLS; i++) {
    if (guessArr[i] === ansArr[i]) {
      res[i] = 'correct';
      ansArr[i] = null;
      guessArr[i] = null;
    }
  }
  // present
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
  setTimeout(() => { if (messageEl.textContent === msg) messageEl.textContent = ''; }, 2000);
}

function newGame() {
  pickAnswer();
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
}

document.addEventListener('keydown', e => {
  if (gameOver && e.key === 'Enter') { newGame(); return; }
  if (e.key === 'Enter') handleKey('ENTER');
  else if (e.key === 'Backspace') handleKey('BACK');
  else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
});

document.getElementById('newGame').addEventListener('click', newGame);

newGame();