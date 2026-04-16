# Doodlify

A real-time multiplayer drawing and guessing game built with Node.js, Express, and Socket.io. Players take turns drawing words while others try to guess what is being drawn before time runs out.

## Features

- **Real-time Multiplayer** - Play with friends or random players online
- **Drawing Tools** - Brush, bucket fill, and eraser tools with customizable colors and sizes
- **Multiple Themes** - Animals, Food, Objects, Places, Nature, and People
- **Time-based Scoring** - Faster guesses earn more points (exponential decay formula)
- **Room System** - Create private rooms with 6-character codes or play with random players
- **Responsive Design** - Works on desktop and mobile devices
- **Sound Effects** - Audio feedback for correct guesses and game events

## Prerequisites

- Node.js (v14 or higher recommended)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd GuessTheDrawing
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
- Local: `http://localhost:5000`
- Network: `http://<your-local-ip>:5000`

## Game Rules

### How to Play

1. **Join/Create a Room**
   - Create a new room as the host or join an existing room with a 6-character code
   - Or use "Play with Random" to join a public game

2. **Gameplay**
   - One player is selected as the "drawer" each turn
   - The drawer selects a word from 3 options to draw
   - Other players try to guess what is being drawn

3. **Guessing**
   - Type your guess in the chat input
   - First person to guess correctly earns the most points
   - All correct guessers move to the next round

4. **Scoring**
   - **Guessers**: Points decrease exponentially over time (max 550, min 50)
   - **Drawer**: Bonus based on how many players guessed correctly (up to 200 pts)

5. **Winning**
   - After all rounds, the player with the highest score wins

### Scoring Formula

**Guesser Score:**
```
Score = maxPoints × e^(-timeElapsed / timeConstant) + minPoints
```
- maxPoints: 500 (instant guess)
- minPoints: 50 (floor at 0 seconds)
- timeConstant: 25 seconds

**Drawer Bonus:**
```
Bonus = maxBonus × (1 - e^(-3 × guessRate))
```
- maxBonus: 200 points
- guessRate: correctGuessers / totalOtherPlayers

## Project Structure

```
├── server.js          # Main server file (Express + Socket.io)
├── package.json      # Dependencies
├── data/
│   └── words.json  # Word bank by theme
└── public/
    ├── index.html  # Main HTML file
    ├── client.js  # Client-side JavaScript
    ├── style.css # Styles
    └── resources/
        ├── font/   # Custom fonts (Sketchit, Scratch)
        └── sfx/    # Sound effects (count, guess, win)
```

## Technologies Used

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Real-time**: WebSocket (Socket.io)
- **Rendering**: HTML5 Canvas API

## Configuration

### Server Settings

Default settings (can be modified in the waiting room):

| Setting | Options | Default |
|---------|---------|---------|
| Theme | animals, food, objects, places, nature, people | food |
| Time per Round | 30, 60, 90, 120 seconds | 60 |
| Number of Rounds | 1, 3, 5, 7, 10 | 5 |
| Max Players | 4, 6, 8, 10 | 8 |

### Port Configuration

The server runs on port 5000 by default. To change:

```bash
PORT=3000 npm start
```

## Drawing Tools

- **Brush** - Freehand drawing with selected color and size
- **Bucket Fill** - Flood fill an area with a color
- **Eraser** - Remove strokes (paints with background color)

### Keyboard Shortcuts

- **Enter** - Send guess

## Mobile Support

The game is fully responsive and works on:
- Desktop browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome for Android)
- Tablet browsers

Touch controls are supported for drawing.

## API Events

### Socket Events (Client → Server)

| Event | Description |
|------|-------------|
| `createRoom` | Create a new room |
| `joinRoom` | Join an existing room |
| `updateSettings` | Update room settings |
| `startGame` | Start the game |
| `selectWord` | Select a word to draw |
| `draw` | Send drawing data |
| `clearCanvas` | Clear the canvas |
| `guess` | Submit a guess |

### Socket Events (Server → Client)

| Event | Description |
|------|-------------|
| `roomUpdate` | Room state updated |
| `playerJoined` | Player joined |
| `playerLeft` | Player left |
| `turnStart` | New turn started |
| `wordSelected` | Word was selected |
| `timerUpdate` | Timer tick |
| `correctGuess` | Correct guess made |
| `wrongGuess` | Wrong guess made |
| `turnEnd` | Turn ended |
| `gameEnd` | Game ended |

## Word Categories

The game includes 6 word categories:

1. **Animals** - 70+ animals
2. **Food** - 70+ food items
3. **Objects** - 80+ everyday objects
4. **Places** - 60+ locations
5. **Nature** - 60+ nature elements
6. **People** - 50+ occupations and characters

## Troubleshooting

### Common Issues

1. **Can't connect to server**
   - Check if the server is running
   - Verify firewall settings
   - Try using the local IP address

2. **Drawing not syncing**
   - Refresh the page
   - Check WebSocket connection

3. **Sound not playing**
   - Check browser audio permissions
   - Ensure sound is not muted in the app

## License

MIT License

## Credits

- [DiceBear](https://www.dicebear.com/) for avatar generation
- Google Fonts for typography