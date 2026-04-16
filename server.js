/**
 * GUESS THE DRAWING - TIME-BASED SCORING SYSTEM
 * =============================================
 * 
 * GUESSER SCORING FORMULA:
 * ------------------------
 * Score = maxPoints × e^(-timeElapsed / timeConstant) + minPoints
 * 
 * Where:
 *   - maxPoints = 500 (maximum for instant guess)
 *   - minPoints = 50 (minimum even at 0 seconds left)
 *   - timeConstant = 25 seconds (slower decay, easier to get high scores)
 *   - timeElapsed = seconds since drawer selected the word
 * 
 * This exponential decay formula means:
 *   - 0s (instant):  ~550 points (500 + 50)
 *   - 5s:            ~453 points
 *   - 10s:           ~324 points  
 *   - 20s:           ~217 points
 *   - 30s:           ~160 points
 *   - Approaches 50 as time → infinity
 * 
 * DRAWER SCORING FORMULA:
 * -----------------------
 * Bonus = maxBonus × (1 - e^(-3 × guessRate))
 * 
 * Where:
 *   - maxBonus = 200 points (if everyone guesses correctly)
 *   - guessRate = correctGuessers / totalOtherPlayers
 * 
 * This gives diminishing returns:
 *   - 1/8 correct:   ~64 points bonus
 *   - 4/8 correct:   ~158 points bonus  
 *   - 8/8 correct:   200 points bonus (max)
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

let words = {};
try {
  const wordsData = fs.readFileSync(path.join(__dirname, 'data', 'words.json'), 'utf8');
  words = JSON.parse(wordsData);
} catch (err) {
  console.error('Error loading words:', err);
  words = { easy: [], medium: [], hard: [] };
}

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getRandomWords(theme, count = 3) {
  const wordList = words[theme] || words['animals'] || [];
  const shuffled = [...wordList].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

const THEMES = ['animals', 'food', 'objects', 'places', 'nature', 'people'];

function findPublicRoom() {
  for (const [code, room] of rooms) {
    if (room.isPublic && room.players.length < room.settings.maxPlayers && room.gameState !== 'ended') {
      return room;
    }
  }
  return null;
}

function createRoom(hostId, settings) {
  let code;
  let isPublic = settings.isPublic || false;
  
  if (isPublic) {
    let attempt = 0;
    do {
      code = 'PLAY';
      if (attempt > 0) code += attempt;
      attempt++;
    } while (rooms.has(code));
  } else {
    do {
      code = generateRoomCode();
    } while (rooms.has(code));
  }

  const room = {
    code,
    hostId,
    isPublic,
    settings: {
      theme: settings.theme || (isPublic ? THEMES[Math.floor(Math.random() * THEMES.length)] : settings.theme) || 'animals',
      timePerRound: settings.timePerRound || 60,
      rounds: settings.rounds || 5,
      maxPlayers: settings.maxPlayers || 8
    },
    players: [],
    gameState: 'waiting',
    currentRound: 0,
    currentDrawerIndex: 0,
    currentWord: '',
    wordOptions: [],
    timer: null,
    timeLeft: 0,
    guessedPlayers: new Set(),
    roundResults: [],
    wordStartTime: null
  };

  rooms.set(code, room);
  return room;
}

// Time-based scoring configuration
const SCORE_CONFIG = {
  // Maximum points for instant guess
  maxPoints: 500,
  // Minimum points for a correct guess (even at 0 seconds left)
  minPoints: 50,
  // Time constant for exponential decay (in seconds)
  // Higher = slower decay, more time to get high scores
  timeConstant: 25,
  // Drawer bonus per correct guesser
  drawerBonusPerGuesser: 25,
  // Drawer max bonus cap
  drawerMaxBonus: 200
};

/**
 * Calculate score based on time elapsed using exponential decay formula
 * Formula: score = maxPoints * e^(-timeElapsed / timeConstant) + minPoints
 * 
 * This creates a curve where:
 * - Instant guess (0s): ~maxPoints + minPoints
 * - At timeConstant seconds: ~37% of maxPoints remaining
 * - Approaches minPoints as time goes to infinity
 */
function calculateGuessScore(timeElapsedSeconds) {
  const timeConst = SCORE_CONFIG.timeConstant;
  
  // Exponential decay: score decays naturally over time
  const decayFactor = Math.exp(-timeElapsedSeconds / timeConst);
  
  // Calculate base score from decay
  const decayedScore = SCORE_CONFIG.maxPoints * decayFactor;
  
  // Add minimum points floor and round to integer
  const finalScore = Math.round(decayedScore + SCORE_CONFIG.minPoints);
  
  return finalScore;
}

/**
 * Calculate drawer bonus based on number of correct guessers
 * More people guessing = more bonus, but with diminishing returns
 */
function calculateDrawerScore(correctGuessersCount, totalOtherPlayers) {
  if (totalOtherPlayers === 0) return 0;
  
  // Percentage of other players who guessed correctly
  const guessRate = correctGuessersCount / totalOtherPlayers;
  
  // Bonus based on guess rate with diminishing returns
  // Formula: bonus = maxBonus * (1 - e^(-3 * guessRate))
  // This gives reasonable bonus even with few guessers
  const bonusMultiplier = 1 - Math.exp(-3 * guessRate);
  const bonus = SCORE_CONFIG.drawerMaxBonus * bonusMultiplier;
  
  return Math.round(bonus);
}

function getRoomByCode(code) {
  return rooms.get(code.toUpperCase());
}

function getRoomBySocketId(socketId) {
  for (const [code, room] of rooms) {
    if (room.players.find(p => p.id === socketId)) {
      return room;
    }
  }
  return null;
}

function addPlayerToRoom(room, socketId, username) {
  if (room.players.length >= room.settings.maxPlayers) {
    return null;
  }
  
  if (room.players.find(p => p.username.toLowerCase() === username.toLowerCase())) {
    return null;
  }

  const isHost = !room.players.length && !room.isPublic;
  const player = {
    id: socketId,
    username,
    score: 0,
    isHost
  };
  room.players.push(player);
  return player;
}

function removePlayerFromRoom(room, socketId) {
  const index = room.players.findIndex(p => p.id === socketId);
  if (index !== -1) {
    room.players.splice(index, 1);
    
    if (room.players.length === 0) {
      clearInterval(room.timer);
      rooms.delete(room.code);
      return true;
    }

    if (!room.players.find(p => p.isHost)) {
      room.players[0].isHost = true;
    }
  }
  return false;
}

function startGame(room) {
  if (room.players.length < 2) return false;
  
  room.gameState = 'playing';
  room.currentRound = 1;
  room.currentDrawerIndex = 0;
  room.roundResults = [];
  
  room.players.forEach(p => p.score = 0);
  
  startRound(room);
  return true;
}

function startRound(room) {
  room.currentDrawerIndex = room.currentDrawerIndex % room.players.length;
  const drawer = room.players[room.currentDrawerIndex];
  
  room.wordOptions = getRandomWords(room.settings.theme, 3);
  room.currentWord = '';
  room.guessedPlayers = new Set();
  room.wordStartTime = null;
  room.drawingStartTime = null;
  
  // Word selection timer (10 seconds to pick a word)
  room.wordSelectTimeLeft = 10;
  
  // Calculate current turn position within the round
  const totalPlayers = room.players.length;
  const currentTurnInRound = room.currentDrawerIndex + 1;
  
  io.to(room.code).emit('turnStart', {
    round: room.currentRound,
    totalRounds: room.settings.rounds,
    currentTurnInRound: currentTurnInRound,
    totalPlayersInRound: totalPlayers,
    drawer: drawer.id,
    drawerName: drawer.username,
    drawerAvatarSeed: drawer.avatarSeed,
    wordOptions: room.wordOptions,
    currentWord: room.currentWord || null,
    players: room.players.map(p => ({ id: p.id, username: p.username, score: p.score, avatarSeed: p.avatarSeed }))
  });

  // Start word selection timer
  if (room.wordSelectTimer) clearInterval(room.wordSelectTimer);
  
  room.wordSelectTimer = setInterval(() => {
    room.wordSelectTimeLeft--;
    
    if (room.wordSelectTimeLeft <= 3 && room.wordSelectTimeLeft > 0) {
      const drawer = room.players[room.currentDrawerIndex];
      io.to(drawer.id).emit('timerCountdown', { timeLeft: room.wordSelectTimeLeft });
    }
    
    if (room.wordSelectTimeLeft <= 0) {
      // Clear the timer first
      clearInterval(room.wordSelectTimer);
      room.wordSelectTimer = null;
      
      // Close the word selection modal on all clients
      io.to(room.code).emit('wordSelectTimeUp');
      
      // Auto-select first word if time runs out
      if (room.wordOptions.length > 0 && !room.currentWord) {
        const autoWord = room.wordOptions[0];
        selectWord(room, room.players[room.currentDrawerIndex].id, autoWord);
      }
      return;
    }
    
    io.to(room.code).emit('wordSelectTimerUpdate', { timeLeft: room.wordSelectTimeLeft });
  }, 1000);
  
  // Start countdown timer but don't start actual game timer yet
  room.timeLeft = room.settings.timePerRound;
  
  if (room.timer) clearInterval(room.timer);
  
  // This timer will be activated when word is selected
  room.timer = null;
}

function selectWord(room, socketId, word) {
  const drawer = room.players[room.currentDrawerIndex];
  if (drawer?.id !== socketId || room.currentWord) {
    return;
  }
  
  room.currentWord = word;
  room.wordStartTime = Date.now();
  room.drawingStartTime = Date.now();
  
  // Clear word selection timer
  if (room.wordSelectTimer) {
    clearInterval(room.wordSelectTimer);
    room.wordSelectTimer = null;
  }
  
  io.to(room.code).emit('wordSelected', {
    drawer: drawer.id,
    word: word
  });
  
  io.to(drawer.id).emit('yourWord', { word: word });
  
  // Start the actual game timer now that word is selected
  room.timeLeft = room.settings.timePerRound;
  
  if (room.timer) clearInterval(room.timer);
  
  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(room.code).emit('timerUpdate', { timeLeft: room.timeLeft });
    
    if (room.timeLeft <= 3 && room.timeLeft > 0) {
      io.to(room.code).emit('timerCountdown', { timeLeft: room.timeLeft });
    }
    
    if (room.timeLeft <= 0) {
      endRound(room);
    }
  }, 1000);
}

function handleGuess(room, socketId, guess) {
  const player = room.players.find(p => p.id === socketId);
  const drawer = room.players[room.currentDrawerIndex];
  
  if (!player || player.id === drawer.id || room.guessedPlayers.has(socketId)) {
    return { success: false };
  }
  
  // Check if word has been selected and timer started
  if (!room.wordStartTime) {
    return { success: false };
  }
  
  const isCorrect = guess.toLowerCase().trim() === room.currentWord.toLowerCase();
  
  if (isCorrect) {
    room.guessedPlayers.add(socketId);
    
    // Calculate time elapsed since word was selected
    const timeElapsedMs = Date.now() - room.wordStartTime;
    const timeElapsedSeconds = timeElapsedMs / 1000;
    
    // Calculate score based on time
    const points = calculateGuessScore(timeElapsedSeconds);
    player.score += points;
    
    // Calculate drawer bonus based on how many people have guessed so far
    const otherPlayersCount = room.players.length - 1; // Excluding drawer
    const drawerBonus = calculateDrawerScore(room.guessedPlayers.size, otherPlayersCount);
    
    // Only add drawer bonus when someone guesses (cumulative)
    if (room.guessedPlayers.size === 1) {
      // First guess - set initial bonus
      drawer.score += drawerBonus;
    } else {
      // Additional guesses - add the incremental bonus
      const previousBonus = calculateDrawerScore(room.guessedPlayers.size - 1, otherPlayersCount);
      drawer.score += (drawerBonus - previousBonus);
    }
    
    const isFirst = room.guessedPlayers.size === 1;
    
    // Notify about correct guess but don't reveal the word
    io.to(room.code).emit('correctGuess', {
      player: player.username,
      points: points,
      timeElapsed: Math.round(timeElapsedSeconds * 10) / 10,
      isFirst: isFirst,
      guessPosition: room.guessedPlayers.size,
      totalGuessers: room.players.length - 1
    });
    
    io.to(room.code).emit('playGuessSound');

    if (room.guessedPlayers.size === room.players.length - 1) {
      endRound(room);
    }
    
    return { success: true, points };
  }
  
  // Wrong guess - show the actual guess to everyone
  io.to(room.code).emit('wrongGuess', {
    player: player.username,
    guess: guess
  });
  
  return { success: false };
}

function endRound(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
  
  room.roundResults.push({
    word: room.currentWord,
    drawer: room.players[room.currentDrawerIndex].username
  });

  const totalPlayers = room.players.length;
  const currentTurnInRound = room.currentDrawerIndex + 1;
  
  io.to(room.code).emit('turnEnd', {
    word: room.currentWord,
    drawer: room.players[room.currentDrawerIndex].username,
    round: room.currentRound,
    totalRounds: room.settings.rounds,
    currentTurnInRound: currentTurnInRound,
    totalPlayersInRound: totalPlayers,
    scores: room.players.map(p => ({ username: p.username, score: p.score, avatarSeed: p.avatarSeed }))
  });

  room.currentDrawerIndex++;
  
  // Check if we've completed a full round (all players have drawn once)
  if (room.currentDrawerIndex >= totalPlayers) {
    room.currentDrawerIndex = 0;
    room.currentRound++;
    
    // Check if game is over
    if (room.currentRound > room.settings.rounds) {
      setTimeout(() => endGame(room), 3000);
      return;
    }
  }
  
  setTimeout(() => startRound(room), 5000);
}

function endGame(room) {
  room.gameState = 'ended';
  
  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  const winner = sortedPlayers[0];
  
  io.to(room.code).emit('gameEnd', {
    winner: winner ? winner.username : null,
    winnerScore: winner ? winner.score : 0,
    finalScores: sortedPlayers.map(p => ({ username: p.username, score: p.score, avatarSeed: p.avatarSeed }))
  });
  
  room.gameState = 'waiting';
  room.currentRound = 0;
  room.currentDrawerIndex = 0;
  room.players.forEach(p => p.score = 0);
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ username, settings, avatarSeed }, callback) => {
    if (!username || username.length < 2 || username.length > 15) {
      callback({ success: false, error: 'Username must be 2-15 characters' });
      return;
    }

     const room = createRoom(socket.id, settings);
     const player = addPlayerToRoom(room, socket.id, username);
     player.avatarSeed = avatarSeed;
     socket.username = username;
    
    socket.join(room.code);
    
    callback({ 
      success: true, 
      roomCode: room.code, 
      isHost: player.isHost,
      isPublic: room.isPublic,
      players: room.players.map(p => ({ id: p.id, username: p.username, score: p.score, isHost: p.isHost, avatarSeed: p.avatarSeed })),
      settings: room.settings
    });

    socket.emit('roomUpdate', {
      players: room.players.map(p => ({ id: p.id, username: p.username, score: p.score, isHost: p.isHost, avatarSeed: p.avatarSeed })),
      settings: room.settings,
      gameState: room.gameState
    });
  });

  socket.on('getPublicRooms', (callback) => {
  const publicRooms = [];
  for (const [code, room] of rooms) {
    if (room.isPublic && room.players.length < room.settings.maxPlayers) {
      publicRooms.push({
        code: room.code,
        playerCount: room.players.length,
        maxPlayers: room.settings.maxPlayers,
        gameState: room.gameState,
        hostUsername: room.players.find(p => p.isHost)?.username || 'Unknown'
      });
    }
  }
  callback({ success: true, rooms: publicRooms });
});

socket.on('joinRoom', ({ username, roomCode, avatarSeed }, callback) => {
  if (!username || username.length < 2 || username.length > 15) {
    callback({ success: false, error: 'Username must be 2-15 characters' });
    return;
  }

  let room;
  const codeInput = roomCode?.toUpperCase();
  
  if (codeInput === 'PLAY') {
    room = findPublicRoom();
    if (!room) {
      callback({ success: false, error: 'No public rooms available' });
      return;
    }
  } else if (!codeInput || codeInput.length !== 6) {
    callback({ success: false, error: 'Invalid room code' });
    return;
  } else {
    room = getRoomByCode(codeInput);
    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }
  }

  if (room.players.length >= room.settings.maxPlayers) {
    callback({ success: false, error: 'Room is full' });
    return;
  }

  if (!room.isPublic && room.gameState === 'playing') {
    callback({ success: false, error: 'Game already in progress' });
    return;
  }

  const player = addPlayerToRoom(room, socket.id, username);
  if (!player) {
    callback({ success: false, error: 'Username already taken' });
    return;
  }
  player.avatarSeed = avatarSeed;
  socket.username = username;

  socket.join(room.code);

  callback({ 
    success: true, 
    roomCode: room.code, 
    isHost: player.isHost,
    isPublic: room.isPublic,
    players: room.players.map(p => ({ id: p.id, username: p.username, score: p.score, isHost: p.isHost, avatarSeed: p.avatarSeed })),
    settings: room.settings,
    gameState: room.gameState
  });

  io.to(room.code).emit('playerJoined', {
    username: player.username,
    players: room.players.map(p => ({ id: p.id, username: p.username, score: p.score, isHost: p.isHost, avatarSeed: p.avatarSeed }))
  });

  if (room.isPublic && room.players.length >= 2 && room.gameState === 'waiting') {
    startGame(room);
  }
});

  socket.on('updateSettings', (settings, callback) => {
    const room = getRoomBySocketId(socket.id);
    if (!room) {
      callback({ success: false, error: 'Not authorized' });
      return;
    }
    if (!room.isPublic && room.hostId !== socket.id) {
      callback({ success: false, error: 'Not authorized' });
      return;
    }

    room.settings = { ...room.settings, ...settings };
    
    io.to(room.code).emit('settingsUpdated', room.settings);
    callback({ success: true, settings: room.settings });
  });

  socket.on('startGame', (callback) => {
    const room = getRoomBySocketId(socket.id);
    if (!room) {
      callback({ success: false, error: 'Not in a room' });
      return;
    }
    if (!room.isPublic && room.hostId !== socket.id) {
      callback({ success: false, error: 'Not authorized' });
      return;
    }

    if (room.players.length < 2) {
      callback({ success: false, error: 'Need at least 2 players' });
      return;
    }

    if (room.gameState !== 'waiting') {
      callback({ success: false, error: 'Game already in progress' });
      return;
    }

    const success = startGame(room);
    callback({ success });
  });

  socket.on('selectWord', (word, callback) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || room.gameState !== 'playing') {
      callback({ success: false });
      return;
    }

    selectWord(room, socket.id, word);
    callback({ success: true });
  });

  socket.on('draw', (data) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || room.gameState !== 'playing') return;

    socket.to(room.code).emit('draw', data);
  });

  socket.on('clearCanvas', () => {
    const room = getRoomBySocketId(socket.id);
    if (!room) return;

    io.to(room.code).emit('clearCanvas');
  });

  socket.on('guess', (guess, callback) => {
    const room = getRoomBySocketId(socket.id);
    if (!room) {
      callback({ success: false, error: 'Not in a room' });
      return;
    }
    if (room.gameState !== 'playing') {
      callback({ success: false, error: 'Game not in progress' });
      return;
    }
    if (!room.currentWord) {
      callback({ success: false, error: 'No word selected' });
      return;
    }

    const result = handleGuess(room, socket.id, guess);
    callback(result);
  });

  socket.on('getGameState', (callback) => {
    const room = getRoomBySocketId(socket.id);
    if (!room) {
      callback({ success: false, error: 'Not in a room' });
      return;
    }

    callback({
      success: true,
      players: room.players.map(p => ({ id: p.id, username: p.username, score: p.score, isHost: p.isHost, avatarSeed: p.avatarSeed })),
      settings: room.settings,
      gameState: room.gameState,
      currentRound: room.currentRound,
      totalRounds: room.settings.rounds
    });
  });

socket.on('disconnect', () => {
     const room = getRoomBySocketId(socket.id);
     if (room) {
       const player = room.players.find(p => p.id === socket.id);
       const wasHost = room.hostId === socket.id;
       const roomEmpty = removePlayerFromRoom(room, socket.id);
       
       if (!roomEmpty) {
         if (room.isPublic) {
           room.hostId = room.players[0].id;
           room.players[0].isHost = true;
         }
         
         io.to(room.code).emit('playerLeft', {
           username: player ? player.username : 'Anonymous',
           players: room.players.map(p => ({ id: p.id, username: p.username, score: p.score, isHost: p.isHost, avatarSeed: p.avatarSeed })),
           hostId: room.hostId
         });

        if ((wasHost || room.isPublic) && room.gameState === 'playing' && room.players.length < 2) {
           io.to(room.code).emit('gameAborted', { reason: 'No player left' });
           room.gameState = 'waiting';
           room.currentRound = 0;
           if (room.timer) clearInterval(room.timer);
         }
       }
     }
   });
});

const PORT = process.env.PORT || 5000;

function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();

console.log('========================================');
console.log('🎯 Guess The Drawing Server Started!');
console.log('========================================');
console.log('');
console.log('  Local:    http://localhost:' + PORT);
console.log('  Network:  http://' + localIP + ':' + PORT);
console.log('');
console.log('Share the Network URL with other devices on your WiFi!');
console.log('========================================');

server.listen(PORT);