# 4096dle

A browser-based multi-board Wordle that scales from 1 to 4096 simultaneous words. Open `index.html` in any browser — no build step required.

## Features

- **1 to 4096 words at once** — choose a preset or type any number up to 4096
- **Guess budget scales with word count** — `words + extra`, where extra grows linearly from 5 (1 word) to 20 (4096 words)
- **Virtualized rendering** — only boards in view are rendered; board containers keep the page length stable so scrolling stays smooth
- **Minimap** — color-coded overview of every board (green = solved, yellow = solvable, grey = not yet). Old compact style for 16–255 words, larger scrollable map for 256+
- **Per-board keyboard colors** — click a board to view its letter states
- **Floating keyboard** and **games-left indicator** — always visible, move with the keyboard
- **On-screen + physical keyboard** support
- **Word validation** against a built-in dictionary (2315 answers + 14855 valid guesses)
- **Win/lose detection** with answer reveal

## Run

Just open `index.html` in a browser. No build step required.

## Controls

- Type letters / `Enter` / `Backspace` on your keyboard, or click the on-screen keys
- Click a minimap square or board to jump to it
- `Hide Map` / `Map` toggles the minimap (256+ words)
- `Hide KB` / `Show KB` toggles the keyboard