const socket = io();

let soundsLoaded = false;
let soundEnabled = true;
let sounds = {
  count: null,
  guess: null
};

function toggleSound() {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    elements.soundOnIcon.classList.remove('hidden');
    elements.soundOffIcon.classList.add('hidden');
  } else {
    elements.soundOnIcon.classList.add('hidden');
    elements.soundOffIcon.classList.remove('hidden');
  }
}

function loadSounds() {
  if (soundsLoaded) return;
  sounds.count = new Audio('/resources/sfx/count.mp3');
  sounds.guess = new Audio('/resources/sfx/guess.mp3');
  sounds.win = new Audio('/resources/sfx/win.mp3');
  sounds.count.play().then(() => sounds.count.pause()).catch(() => {});
  sounds.count.currentTime = 0;
  soundsLoaded = true;
}

let currentAvatarSeed = Math.random().toString(36).substring(7);
const THEMES = ['animals', 'food', 'objects', 'places', 'nature', 'people'];

function getAvatarUrl(seed, size = 80) {
  return `https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&size=${size}`;
}

function generateNewAvatar() {
  currentAvatarSeed = Math.random().toString(36).substring(7);
  return getAvatarUrl(currentAvatarSeed);
}

let currentPlayerId = null;
let currentRoomCode = null;
let isHost = false;
let isDrawer = false;
let currentWord = '';
let currentDrawerId = null;
let gameSettings = {};

const elements = {
  loginScreen: document.getElementById('login-screen'),
  roomScreen: document.getElementById('room-screen'),
  joinForm: document.getElementById('join-form'),
  createForm: document.getElementById('create-form'),
  usernameInput: document.getElementById('username-input'),
  roomCodeInput: document.getElementById('room-code-input'),
  createUsernameInput: document.getElementById('create-username-input'),
  loginError: document.getElementById('login-error'),
  displayRoomCode: document.getElementById('display-room-code'),
  waitingRoom: document.getElementById('waiting-room'),
  playerList: document.getElementById('player-list'),
  hostControls: document.getElementById('host-controls'),
  nonHostMessage: document.getElementById('non-host-message'),
  gameArea: document.getElementById('game-area'),
  wordSelection: document.getElementById('word-selection'),
  wordOptions: document.getElementById('word-options'),
  canvasContainer: document.getElementById('canvas-container'),
  drawingCanvas: document.getElementById('drawing-canvas'),
  drawingTools: document.getElementById('drawing-tools'),
  guesserView: document.getElementById('guesser-view'),
  wordBlanks: document.getElementById('word-blanks'),
  wordLength: document.getElementById('word-length'),
  mobileTimer: document.getElementById('mobile-timer'),
  mobileTimerText: document.getElementById('mobile-timer-text'),
  chatMessages: document.getElementById('chat-messages'),
  guessInput: document.getElementById('guess-input'),
  guessCharCount: document.getElementById('guess-char-count'),
  chatInput: document.querySelector('.chat-input'),
   stickyGuessBar: document.getElementById('sticky-guess-bar'),
   stickyGuessInput: document.getElementById('sticky-guess-input'),
  stickyCharCount: document.getElementById('sticky-char-count'),
  scoreboard: document.getElementById('scoreboard'),
  currentRound: document.getElementById('current-round'),
  drawerName: document.getElementById('drawer-name'),
  drawerAvatar: document.getElementById('drawer-avatar'),
  settingTheme: document.getElementById('setting-theme'),
  settingTime: document.getElementById('setting-time'),
  settingRounds: document.getElementById('setting-rounds'),
  settingMaxPlayers: document.getElementById('setting-max-players'),
  wordSelectionModal: document.getElementById('word-selection-modal'),
  modalWordOptions: document.getElementById('modal-word-options'),
  wordSelectTimerText: document.getElementById('word-select-timer-text'),
  roundEndModal: document.getElementById('round-end-modal'),
  revealedWord: document.getElementById('revealed-word'),
  roundDrawer: document.getElementById('round-drawer'),
  roundScores: document.getElementById('round-scores'),
  gameEndModal: document.getElementById('game-end-modal'),
  finalScores: document.getElementById('final-scores'),
  gameAbortedModal: document.getElementById('game-aborted-modal'),
  gameAbortedReason: document.getElementById('game-aborted-reason'),
  soundOnIcon: document.getElementById('sound-on-icon'),
  soundOffIcon: document.getElementById('sound-off-icon'),
};

const canvas = elements.drawingCanvas;
const ctx = canvas.getContext('2d');

let isDrawing = false;
let lastX = 0;
let lastY = 0;
let strokeHistory = []; // Now stores complete strokes: { type: 'stroke', points: [{x,y}], color, size }
let currentStroke = null; // Track current stroke while drawing
let currentTool = 'brush'; // 'brush', 'bucket', or 'eraser'

function init() {
  document.getElementById('btn-switch-to-create').addEventListener('click', () => showCreateForm());
  document.getElementById('btn-switch-to-join').addEventListener('click', () => showJoinForm());
  document.getElementById('btn-refresh-avatar').addEventListener('click', function() {
    const newUrl = generateNewAvatar();
    document.getElementById('avatar-preview').src = newUrl;
    this.classList.remove('shake');
    void this.offsetWidth;
    this.classList.add('shake');
  });
  document.getElementById('btn-refresh-avatar-create').addEventListener('click', function() {
    const newUrl = generateNewAvatar();
    document.getElementById('avatar-preview-create').src = newUrl;
    this.classList.remove('shake');
    void this.offsetWidth;
    this.classList.add('shake');
  });
  document.getElementById('btn-join').addEventListener('click', joinRoom);
  document.getElementById('btn-create').addEventListener('click', createRoom);
  document.getElementById('btn-play-random')?.addEventListener('click', () => {
    const username = elements.createUsernameInput.value.trim();
    if (!username) {
      elements.loginError.textContent = 'Please enter a username';
      return;
    }
    const avatarSeed = getSeedFromAvatarUrl(document.getElementById('avatar-preview-create').src);
    currentAvatarSeed = avatarSeed;
    const btn = document.getElementById('btn-play-random');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> Joining...';
    elements.loginError.textContent = 'Searching for available room...';
    socket.emit('getPublicRooms', (response) => {
      if (response.rooms && response.rooms.length > 0) {
        elements.loginError.textContent = 'Found room! Joining...';
        elements.usernameInput.value = username;
        elements.roomCodeInput.value = 'PLAY';
        socket.emit('joinRoom', { username, roomCode: 'PLAY', avatarSeed }, (res) => {
          btn.disabled = false;
          btn.textContent = 'Play with Random';
          if (res.success) {
            currentPlayerId = socket.id;
            currentRoomCode = res.roomCode;
            isHost = res.isHost;
            gameSettings = res.settings;
            showRoomScreen(res);
          } else {
            elements.loginError.textContent = 'Room full or in progress. Creating new room...';
            const settings = {
              theme: THEMES[Math.floor(Math.random() * THEMES.length)],
              timePerRound: 60,
              rounds: 5,
              maxPlayers: 8,
              isPublic: true
            };
            socket.emit('createRoom', { username, settings, avatarSeed }, (res2) => {
              if (res2.success) {
                currentPlayerId = socket.id;
                currentRoomCode = res2.roomCode;
                isHost = res2.isHost;
                gameSettings = res2.settings;
                showRoomScreen(res2);
              } else {
                elements.loginError.textContent = res2.error || 'Failed to create room';
              }
            });
          }
        });
      } else {
        elements.loginError.textContent = 'Creating public room...';
        const settings = {
          theme: THEMES[Math.floor(Math.random() * THEMES.length)],
          timePerRound: 60,
          rounds: 5,
          maxPlayers: 8,
          isPublic: true
        };
        socket.emit('createRoom', { username, settings, avatarSeed }, (res) => {
          btn.disabled = false;
          btn.textContent = 'Play with Random';
          if (res.success) {
            currentPlayerId = socket.id;
            currentRoomCode = res.roomCode;
            isHost = res.isHost;
            gameSettings = res.settings;
            showRoomScreen(res);
          } else {
            elements.loginError.textContent = res.error || 'Failed to create room';
          }
        });
      }
    });
  });
  document.getElementById('btn-leave-room').addEventListener('click', leaveRoom);
  document.getElementById('btn-start-game').addEventListener('click', startGame);
  document.getElementById('btn-clear').addEventListener('click', clearCanvas);
  document.getElementById('btn-undo').addEventListener('click', undoStroke);
  document.getElementById('btn-tool-brush').addEventListener('click', () => setTool('brush'));
  document.getElementById('btn-tool-bucket').addEventListener('click', () => setTool('bucket'));
  document.getElementById('btn-tool-eraser').addEventListener('click', () => setTool('eraser'));
  document.getElementById('btn-send-guess').addEventListener('click', () => sendGuess(elements.guessInput));
  document.getElementById('guess-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendGuess(elements.guessInput);
  });
  elements.guessInput.addEventListener('input', () => {
    const len = elements.guessInput.value.trim();
    elements.guessCharCount.textContent = len ? getWordLengths(len) : 0;
  });
  document.getElementById('btn-sticky-send').addEventListener('click', () => sendGuess(elements.stickyGuessInput));
  document.getElementById('sticky-guess-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendGuess(elements.stickyGuessInput);
  });
  elements.stickyGuessInput.addEventListener('input', () => {
    const len = elements.stickyGuessInput.value.trim();
    elements.stickyCharCount.textContent = len ? getWordLengths(len) : 0;
  });
  document.getElementById('btn-play-again').addEventListener('click', playAgain);
  document.getElementById('btn-game-aborted-ok').addEventListener('click', () => {
    location.reload();
  });
  document.getElementById('btn-sound-toggle').addEventListener('click', toggleSound);

  elements.settingTheme.addEventListener('change', updateSettings);
  elements.settingTime.addEventListener('change', updateSettings);
  elements.settingRounds.addEventListener('change', updateSettings);
  elements.settingMaxPlayers.addEventListener('change', updateSettings);

  showCreateForm();
  document.getElementById('avatar-preview').src = generateNewAvatar();
  document.getElementById('avatar-preview-create').src = generateNewAvatar();
  setupCanvas();
}

function getSeedFromAvatarUrl(url) {
  const match = url.match(/seed=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function showCreateForm() {
  elements.joinForm.classList.remove('active');
  elements.joinForm.classList.add('hidden');
  elements.createForm.classList.remove('hidden');
  elements.createForm.classList.add('active');
  elements.loginError.textContent = '';
  const joinAvatar = document.getElementById('avatar-preview').src;
  document.getElementById('avatar-preview-create').src = joinAvatar;
  const seed = getSeedFromAvatarUrl(joinAvatar);
  if (seed) currentAvatarSeed = seed;
}

function showJoinForm() {
  elements.createForm.classList.remove('active');
  elements.createForm.classList.add('hidden');
  elements.joinForm.classList.remove('hidden');
  elements.joinForm.classList.add('active');
  elements.loginError.textContent = '';
  const createAvatar = document.getElementById('avatar-preview-create').src;
  document.getElementById('avatar-preview').src = createAvatar;
  const seed = getSeedFromAvatarUrl(createAvatar);
  if (seed) currentAvatarSeed = seed;
}

function createRoom() {
  loadSounds();
  const username = elements.createUsernameInput.value.trim();
  if (!username) {
    elements.loginError.textContent = 'Please enter a username';
    return;
  }

  const avatarSeed = getSeedFromAvatarUrl(document.getElementById('avatar-preview-create').src);

  const settings = {
    theme: elements.settingTheme.value,
    timePerRound: parseInt(elements.settingTime.value),
    rounds: parseInt(elements.settingRounds.value),
    maxPlayers: parseInt(elements.settingMaxPlayers.value)
  };

  socket.emit('createRoom', { username, settings, avatarSeed }, (response) => {
    if (response.success) {
      currentPlayerId = socket.id;
      currentRoomCode = response.roomCode;
      isHost = true;
      gameSettings = response.settings;
      showRoomScreen(response);
    } else {
      elements.loginError.textContent = response.error || 'Failed to create room';
    }
  });
}

function joinRoom() {
  loadSounds();
  const username = elements.usernameInput.value.trim();
  const roomCode = elements.roomCodeInput.value.trim().toUpperCase();

  if (!username) {
    elements.loginError.textContent = 'Please enter a username';
    return;
  }
  if (!roomCode || roomCode.length !== 6) {
    elements.loginError.textContent = 'Please enter a valid room code';
    return;
  }

  const avatarSeed = getSeedFromAvatarUrl(document.getElementById('avatar-preview').src);

  socket.emit('joinRoom', { username, roomCode, avatarSeed }, (response) => {
    console.log('joinRoom sent - avatarSeed:', avatarSeed);
    if (response.success) {
      currentPlayerId = socket.id;
      currentRoomCode = response.roomCode;
      isHost = response.isHost;
      gameSettings = response.settings;
      showRoomScreen(response);
    } else {
      elements.loginError.textContent = response.error || 'Failed to join room';
    }
  });
}

function showRoomScreen(response) {
  console.log('showRoomScreen response:', response);
  elements.loginScreen.classList.remove('active');
  elements.roomScreen.classList.add('active');
  elements.displayRoomCode.textContent = response.roomCode;

  updatePlayerList(response.players);

  const isPublicRoom = response.isPublic;
  if (isHost || isPublicRoom) {
    elements.hostControls.classList.remove('hidden');
    elements.nonHostMessage.classList.add('hidden');
    elements.settingTheme.value = response.settings.theme;
    elements.settingTime.value = response.settings.timePerRound;
    elements.settingRounds.value = response.settings.rounds;
    elements.settingMaxPlayers.value = response.settings.maxPlayers;
    if (isPublicRoom) {
      const settingItems = elements.hostControls.querySelectorAll('.setting-item');
      settingItems.forEach(item => {
        const select = item.querySelector('select');
        const label = item.querySelector('label');
        if (select && label) {
          const value = select.options[select.selectedIndex].textContent;
          const span = document.createElement('span');
          span.style.cssText = 'color: var(--text-primary); font-size: 14px; padding: 10px 12px; background: var(--secondary); border-radius: var(--border-radius-sm);';
          span.textContent = value;
          item.innerHTML = '';
          item.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
          const labelDiv = document.createElement('div');
          labelDiv.style.cssText = 'color: var(--text-secondary); font-size: 14px;';
          labelDiv.textContent = label.textContent;
          item.appendChild(labelDiv);
          item.appendChild(span);
        }
      });
    }
  } else {
    elements.hostControls.classList.add('hidden');
    elements.nonHostMessage.classList.remove('hidden');
    elements.nonHostMessage.innerHTML = '<p>Waiting for host to start the game...</p>';
  }

  if (response.gameState === 'playing') {
    elements.waitingRoom.classList.add('hidden');
    elements.gameArea.classList.remove('hidden');
    socket.emit('getGameState', (state) => {
      if (state.success) {
        updateGameState(state);
      }
    });
  }
}

function updatePlayerList(players) {
  console.log('updatePlayerList called with:', players);
  elements.playerList.innerHTML = players.map((player, index) => `
    <div class="player-item">
      <img class="player-avatar" src="${getAvatarUrl(player.avatarSeed || player.username)}" alt="${escapeHtml(player.username)}">
      <span class="player-name">${escapeHtml(player.username)}</span>
      ${player.isHost ? '<span class="host-badge">Host</span>' : ''}
    </div>
  `).join('');
}

function updateSettings() {
  const settings = {
    theme: elements.settingTheme.value,
    timePerRound: parseInt(elements.settingTime.value),
    rounds: parseInt(elements.settingRounds.value),
    maxPlayers: parseInt(elements.settingMaxPlayers.value)
  };

  socket.emit('updateSettings', settings, (response) => {
    if (response.success) {
      gameSettings = response.settings;
    }
  });
}

function startGame() {
  socket.emit('startGame', (response) => {
    if (!response.success) {
      alert(response.error || 'Cannot start game');
    }
  });
}

function leaveRoom() {
  socket.disconnect();
  socket.connect();
  location.reload();
}

function playAgain() {
  elements.gameEndModal.classList.add('hidden');
  socket.disconnect();
  socket.connect();
  location.reload();
}

// Socket Events
socket.on('roomUpdate', (data) => {
  updatePlayerList(data.players);
  if (data.settings) {
    gameSettings = data.settings;
  }
});

socket.on('playerJoined', (data) => {
    console.log('playerJoined received data:', data);
    console.log('data.username:', data.username);
    console.log('data.players:', data.players);
    updatePlayerList(data.players);
    updateScoreboard(data.drawer, data.players);
    if (data.username) {
      addSystemMessage(`${data.username} joined the room`);
    } else {
      // Fallback: get the last player from players list
      const lastPlayer = data.players[data.players.length - 1];
      if (lastPlayer) {
        addSystemMessage(`${lastPlayer.username} joined the room`);
      }
    }
  });

socket.on('playerLeft', (data) => {
    console.log('playerLeft received data:', data);
    console.log('data.username:', data.username);
    console.log('data.players:', data.players);
    updatePlayerList(data.players);
    updateScoreboard(data.drawer, data.players);
    if (data.username) {
      addSystemMessage(`${data.username} left the room`);
    } else {
      // Fallback: find the player who is no longer in the current game
      // This is tricky without previous state, so we'll use a generic message
      addSystemMessage('A player left the room');
    }
  });

socket.on('settingsUpdated', (settings) => {
  gameSettings = settings;
  if (!isHost) {
    elements.settingTheme.value = settings.theme;
    elements.settingTime.value = settings.timePerRound;
    elements.settingRounds.value = settings.rounds;
    elements.settingMaxPlayers.value = settings.maxPlayers;
  }
});

socket.on('gameAborted', (data) => {
  elements.gameAbortedReason.textContent = data.reason;
  elements.gameAbortedModal.classList.remove('hidden');
});

// Game Events
socket.on('turnStart', (data) => {
  console.log('=== turnStart received ===');
  console.log('socket.id:', socket.id);
  console.log('data.drawer:', data.drawer);
  console.log('socket.id === data.drawer:', socket.id === data.drawer);
  
  // Show mobile timer in header
  if (elements.mobileTimer) {
    elements.mobileTimer.classList.remove('hidden');
  }
  
  elements.waitingRoom.classList.add('hidden');
  elements.gameArea.classList.remove('hidden');
  elements.wordSelectionModal.classList.add('hidden');
  elements.roundEndModal.classList.add('hidden');

  elements.currentRound.textContent = `Round ${data.round}/${data.totalRounds}`;
  currentDrawerId = data.drawerName;
  elements.drawerName.textContent = data.drawerName;
  elements.drawerAvatar.src = getAvatarUrl(data.drawerAvatarSeed || data.drawerName);
  
  isDrawer = socket.id === data.drawer;
  console.log('=== isDrawer set to:', isDrawer, '===');
  
  elements.waitingRoom.classList.add('hidden');
  elements.gameArea.classList.remove('hidden');
  elements.wordSelectionModal.classList.add('hidden');
  elements.roundEndModal.classList.add('hidden');

  elements.currentRound.textContent = `Round ${data.round}/${data.totalRounds}`;
  currentDrawerId = data.drawerName;
  elements.drawerName.textContent = data.drawerName;
  elements.drawerAvatar.src = getAvatarUrl(data.drawerAvatarSeed || data.drawerName);
  
isDrawer = data.drawer === socket.id;

   updateScoreboard(data.drawer, data.players);

  console.log('About to check word options. isDrawer:', isDrawer, 'has wordOptions:', !!data.wordOptions, 'data.currentWord:', data.currentWord);
  
  if (data.currentWord) {
    console.log('Setting word from currentWord in turnStart');
    if (isDrawer) {
      currentWord = data.currentWord;
      elements.wordBlanks.textContent = data.currentWord;
      elements.wordLength.textContent = data.currentWord.length;
    } else {
      elements.wordBlanks.textContent = getWordBlanks(data.currentWord);
      elements.wordLength.textContent = getWordLengths(data.currentWord);
    }
  } else if (isDrawer && data.wordOptions) {
    console.log('Calling showWordSelection');
    showWordSelection(data.wordOptions);
    elements.wordBlanks.textContent = 'Select a word...';
    elements.wordLength.textContent = '';
  } else if (!isDrawer) {
    console.log('Setting Waiting for word... in turnStart');
    elements.wordBlanks.textContent = 'Waiting for word...';
    elements.wordLength.textContent = '';
  }

  if (isDrawer) {
    elements.drawingTools.classList.remove('hidden');
    canvas.classList.remove('disabled');
    elements.canvasContainer.classList.add('drawing-active');
    elements.stickyGuessBar.classList.add('hidden');
    elements.chatInput.classList.add('drawer-hide-desktop');
  } else {
    elements.drawingTools.classList.add('hidden');
    canvas.classList.add('disabled');
    elements.canvasContainer.classList.remove('drawing-active');
    elements.stickyGuessBar.classList.remove('hidden');
    elements.chatInput.classList.remove('drawer-hide-desktop');
  }
});

socket.on('wordSelected', (data) => {
  console.log('=== wordSelected received ===');
  console.log('data:', data);
  console.log('isDrawer (current value):', isDrawer);
  console.log('socket.id:', socket.id);
  console.log('data.drawer:', data.drawer);
  console.log('data.word:', data.word);
  
  const isGuesser = !isDrawer && data.word;
  console.log('isGuesser check result:', isGuesser);
  console.log('!isDrawer =', !isDrawer, 'data.word exists =', !!data.word);
  
  if (isGuesser) {
    console.log('Updating wordBlanks with word:', data.word);
    console.log('Before update, wordBlanks is:', elements.wordBlanks);
    console.log('Before update, wordBlanks textContent:', elements.wordBlanks.textContent);
    elements.wordBlanks.textContent = getWordBlanks(data.word);
    elements.wordLength.textContent = getWordLengths(data.word);
    console.log('After update, wordBlanks textContent:', elements.wordBlanks.textContent);
  } else {
    console.log('NOT updating blanks - isDrawer:', isDrawer, 'data.word:', data.word);
  }
});

socket.on('wordSelectTimerUpdate', (data) => {
  if (elements.wordSelectTimerText) {
    elements.wordSelectTimerText.textContent = data.timeLeft;
    
    // Add warning style when time is running low (3 seconds or less)
    const timerContainer = elements.wordSelectTimerText.closest('.word-select-timer');
    if (timerContainer) {
      if (data.timeLeft <= 3) {
        timerContainer.classList.add('warning');
      } else {
        timerContainer.classList.remove('warning');
      }
    }
  }
});

socket.on('wordSelectTimeUp', () => {
  // Close the word selection modal when timer runs out
  if (elements.wordSelectionModal) {
    elements.wordSelectionModal.classList.add('hidden');
    elements.wordSelectionModal.style.display = 'none';
  }
});

socket.on('yourWord', (data) => {
  console.log('=== yourWord received ===');
  console.log('data:', data);
  console.log('isDrawer:', isDrawer);
  currentWord = data.word;
  elements.wordSelection.classList.add('hidden');
  elements.drawingTools.classList.remove('hidden');
  elements.drawerName.textContent = 'YOU';
  elements.drawerAvatar.src = getAvatarUrl(currentAvatarSeed);
  elements.wordBlanks.textContent = data.word;
  elements.wordLength.textContent = getWordLengths(data.word);
  elements.stickyGuessBar.classList.add('hidden');
  clearCanvas();
});

socket.on('timerUpdate', (data) => {
  updateTimer(data.timeLeft);
});

socket.on('timerCountdown', (data) => {
  playCountSound();
});

socket.on('draw', (data) => {
  drawStroke(data);
});

socket.on('clearCanvas', () => {
  clearCanvasLocal();
});

socket.on('correctGuess', (data) => {
  addCorrectGuessMessage(data.player, data.points, data.isFirst, data.timeElapsed, data.guessPosition, data.totalGuessers);
  updateScoreboardFromChat();
});

socket.on('playGuessSound', () => {
  playGuessSound();
});

socket.on('wrongGuess', (data) => {
  console.log('Received wrongGuess event:', data);
  addMessage(data.player, data.guess);
});

socket.on('turnEnd', (data) => {
  // Hide mobile timer in header
  if (elements.mobileTimer) {
    elements.mobileTimer.classList.add('hidden');
  }
  
  elements.revealedWord.textContent = data.word;
  elements.roundDrawer.textContent = data.drawer;
  elements.roundScores.innerHTML = data.scores.map(s => `
    <div class="round-score-item">
      <img class="score-avatar" src="${getAvatarUrl(s.avatarSeed || s.username, 32)}" alt="${escapeHtml(s.username)}">
      <span>${escapeHtml(s.username)}</span>
      <span>${s.score} pts</span>
    </div>
  `).join('');
elements.roundEndModal.classList.remove('hidden');
   updateScoreboard(null, data.scores);
});

socket.on('gameEnd', (data) => {
   if (elements.mobileTimer) {
     elements.mobileTimer.classList.add('hidden');
   }
  
  const sorted = [...data.finalScores].sort((a, b) => b.score - a.score);
  
  if (sorted[0]) {
    document.querySelector('#podium-1st .podium-name').textContent = sorted[0].username;
    document.querySelector('#podium-1st .podium-score').textContent = sorted[0].score;
    document.querySelector('#podium-1st .podium-avatar').src = getAvatarUrl(sorted[0].avatarSeed || sorted[0].username, 48);
  }
  
  const podium2nd = document.querySelector('#podium-2nd');
  const podium3rd = document.querySelector('#podium-3rd');
  
  if (sorted[1]) {
    podium2nd.querySelector('.podium-name').textContent = sorted[1].username;
    podium2nd.querySelector('.podium-score').textContent = sorted[1].score;
    podium2nd.querySelector('.podium-avatar').src = getAvatarUrl(sorted[1].avatarSeed || sorted[1].username, 48);
    podium2nd.classList.remove('hidden');
  } else {
    podium2nd.classList.add('hidden');
  }
  
  if (sorted[2]) {
    podium3rd.querySelector('.podium-name').textContent = sorted[2].username;
    podium3rd.querySelector('.podium-score').textContent = sorted[2].score;
    podium3rd.querySelector('.podium-avatar').src = getAvatarUrl(sorted[2].avatarSeed || sorted[2].username, 48);
    podium3rd.classList.remove('hidden');
  } else {
    podium3rd.classList.add('hidden');
  }
  
  elements.finalScores.innerHTML = sorted.map((s, i) => `
    <div class="final-score-item">
      <span class="final-rank">#${i + 1}</span>
      <img class="score-avatar" src="${getAvatarUrl(s.avatarSeed || s.username, 24)}" alt="">
      <span class="final-name">${escapeHtml(s.username)}</span>
      <span class="final-points">${s.score}</span>
    </div>
  `).join('');
  
  elements.gameEndModal.classList.remove('hidden');
  elements.gameArea.classList.add('hidden');
  playWinSound();
});

// Word Selection
function showWordSelection(words) {
  console.log('showWordSelection called with:', words);
  console.log('modal element:', elements.wordSelectionModal);
  console.log('isDrawer:', isDrawer);
  
  // Reset timer display to 10 when modal opens
  if (elements.wordSelectTimerText) {
    elements.wordSelectTimerText.textContent = '10';
  }
  
  elements.modalWordOptions.innerHTML = words.map(word => `
    <button class="word-option" data-word="${word}">${word}</button>
  `).join('');
  
  const buttons = elements.modalWordOptions.querySelectorAll('.word-option');
  console.log('Created', buttons.length, 'word option buttons');
  
  buttons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      console.log('Button clicked, word:', btn.dataset.word, 'index:', index);
      selectWord(btn.dataset.word);
    });
  });

  // Remove hidden class to show modal
  elements.wordSelectionModal.classList.remove('hidden');
  elements.wordSelectionModal.style.display = 'flex';
  console.log('Modal should be visible now, classes:', elements.wordSelectionModal.className);
}

function selectWord(word) {
  console.log('Selecting word:', word, 'type:', typeof word);
  socket.emit('selectWord', word, (response) => {
    console.log('Select word response:', response);
    if (response.success) {
      elements.wordSelectionModal.classList.add('hidden');
      elements.wordSelectionModal.style.display = 'none';
    } else {
      console.log('Failed to select word');
    }
  });
}

// Chat
function sendGuess(inputElement) {
  const guess = inputElement.value.trim();
  if (!guess) return;

  console.log('Client - sending guess:', guess);
  socket.emit('guess', guess, (response) => {
    console.log('Client - guess response:', response);
    inputElement.value = '';
  });
}

function addMessage(username, text) {
  console.log('addMessage called with:', username, text);
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';
  msgDiv.innerHTML = `<span class="chat-username">${escapeHtml(username)}:</span><span class="chat-text">${escapeHtml(text)}</span>`;
  elements.chatMessages.appendChild(msgDiv);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function addSystemMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message system';
  msgDiv.textContent = text;
  elements.chatMessages.appendChild(msgDiv);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function addCorrectGuessMessage(player, points, isFirst, timeElapsed, guessPosition, totalGuessers) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message correct';
  
  msgDiv.innerHTML = `
    <span class="chat-username">${escapeHtml(player)}</span>
    <span class="chat-text">guessed correctly</span>
  `;
  elements.chatMessages.appendChild(msgDiv);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function clearChat() {
  elements.chatMessages.innerHTML = '';
}

// Timer
function updateTimer(timeLeft) {
  const totalTime = gameSettings.timePerRound || 60;
  const progress = (timeLeft / totalTime) * 283;
  
  // Update mobile timer in header
  if (elements.mobileTimer) {
    elements.mobileTimer.classList.remove('hidden');
    elements.mobileTimerText.textContent = timeLeft;
  }
}

// Scoreboard
function updateScoreboard(drawerId, scores = null) {
  // If scores provided, use them; otherwise get from scoreboard elements
  let playerData = [];
  
  if (scores) {
    playerData = scores.map((p, index) => ({
      name: p.username,
      score: p.score,
      avatarSeed: p.avatarSeed,
      isDrawer: drawerId && p.id === drawerId,
      index: index
    }));
  } else {
    // Read from existing scoreboard elements
    const scoreItems = elements.scoreboard.querySelectorAll('.score-item');
    scoreItems.forEach((item, index) => {
      const name = item.querySelector('.score-name').textContent;
      const score = parseInt(item.querySelector('.score-points').textContent) || 0;
      playerData.push({ name, score, isDrawer: false, index });
    });
  }

  // Sort by score descending
  playerData.sort((a, b) => b.score - a.score);

  elements.scoreboard.innerHTML = playerData.map((p, rank) => `
    <div class="score-item ${p.isDrawer ? 'current-drawer' : ''}">
      <div class="score-rank">#${rank + 1}</div>
      <div class="score-player">
        ${p.isDrawer ? '<span class="drawer-icon-wrapper"><svg class="drawer-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></span>' : ''}
        <img class="score-avatar" src="${getAvatarUrl(p.avatarSeed || p.name)}" alt="${escapeHtml(p.name)}">
        <span class="score-name">${escapeHtml(p.name)}</span>
      </div>
      <span class="score-points">${p.score}</span>
    </div>
  `).join('');
}

function updateScoreboardFromChat() {
  socket.emit('getGameState', (state) => {
    if (state.success && state.players) {
      updateScoreboard(null, state.players);
    }
  });
}

// Canvas
function setupCanvas() {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);

  canvas.addEventListener('touchstart', handleTouch);
  canvas.addEventListener('touchmove', handleTouch);
  canvas.addEventListener('touchend', stopDrawing);
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  
  if (e.touches) {
    return {
      x: (e.touches[0].clientX - rect.left) * scaleX,
      y: (e.touches[0].clientY - rect.top) * scaleY
    };
  }
  
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function startDrawing(e) {
  if (!isDrawer) return;
  e.preventDefault();

  const pos = getPos(e);

  // Handle bucket tool
  if (currentTool === 'bucket') {
    e.preventDefault();
    const color = document.getElementById('color-picker').value;
    fillArea(Math.floor(pos.x), Math.floor(pos.y), color);
    return;
  }

  // Handle brush and eraser tools
  isDrawing = true;
  lastX = pos.x;
  lastY = pos.y;

  // Start a new stroke
  const size = document.getElementById('brush-size').value;
  const color = currentTool === 'eraser' ? '#0a0a0a' : document.getElementById('color-picker').value; // Use background color for eraser

  currentStroke = {
    type: 'stroke',
    points: [{ x: pos.x, y: pos.y }],
    color: color,
    size: parseInt(size),
    isEraser: currentTool === 'eraser'
  };
}

function draw(e) {
  if (!isDrawing || !isDrawer || (currentTool !== 'brush' && currentTool !== 'eraser')) return;
  e.preventDefault();

  const pos = getPos(e);
  const color = currentStroke.color;
  const size = parseInt(document.getElementById('brush-size').value);

  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();

  // Add point to current stroke
  if (currentStroke) {
    currentStroke.points.push({ x: pos.x, y: pos.y });
  }

  lastX = pos.x;
  lastY = pos.y;
}

function stopDrawing() {
  if (!isDrawing) return;
  isDrawing = false;
  
  // Save the completed stroke and emit it
  if (currentStroke && currentStroke.points.length > 1) {
    strokeHistory.push(currentStroke);
    socket.emit('draw', currentStroke);
    currentStroke = null;
  }
}

function handleTouch(e) {
  if (e.touches.length === 1) {
    if (e.type === 'touchstart') {
      startDrawing(e);
    } else if (e.type === 'touchmove') {
      draw(e);
    }
  }
}

function drawStroke(data) {
  if (data.type === 'fill') {
    // Handle fill operation
    applyFill(data.x, data.y, data.color);
    return;
  }
  
  // Handle stroke (array of points)
  if (data.points && data.points.length > 1) {
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(data.points[0].x, data.points[0].y);
    for (let i = 1; i < data.points.length; i++) {
      ctx.lineTo(data.points[i].x, data.points[i].y);
    }
    ctx.stroke();
  }
}

// Flood fill algorithm (bucket tool)
function fillArea(startX, startY, fillColor) {
  const width = canvas.width;
  const height = canvas.height;
  
  // Get current canvas image data
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Get the color at the click position
  const startPos = (startY * width + startX) * 4;
  const startR = data[startPos];
  const startG = data[startPos + 1];
  const startB = data[startPos + 2];
  const startA = data[startPos + 3];
  
  // Parse fill color
  const r = parseInt(fillColor.slice(1, 3), 16);
  const g = parseInt(fillColor.slice(3, 5), 16);
  const b = parseInt(fillColor.slice(5, 7), 16);
  
  // Don't fill if clicking on the same color
  if (startR === r && startG === g && startB === b && startA === 255) {
    return;
  }
  
  // Flood fill using stack-based approach
  const stack = [[startX, startY]];
  const visited = new Set([`${startX},${startY}`]);
  
  // Helper to check if colors match (with tolerance)
  function colorsMatch(pos) {
    const tolerance = 32;
    return Math.abs(data[pos] - startR) <= tolerance &&
           Math.abs(data[pos + 1] - startG) <= tolerance &&
           Math.abs(data[pos + 2] - startB) <= tolerance &&
           Math.abs(data[pos + 3] - startA) <= tolerance;
  }
  
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const pos = (y * width + x) * 4;
    
    data[pos] = r;
    data[pos + 1] = g;
    data[pos + 2] = b;
    data[pos + 3] = 255;
    
    // Check neighbors
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const key = `${nx},${ny}`;
        if (!visited.has(key)) {
          const nPos = (ny * width + nx) * 4;
          if (colorsMatch(nPos)) {
            visited.add(key);
            stack.push([nx, ny]);
          }
        }
      }
    }
  }
  
  // Apply the fill
  ctx.putImageData(imageData, 0, 0);
  
  // Save fill to history
  const fillData = {
    type: 'fill',
    x: startX,
    y: startY,
    color: fillColor
  };
  strokeHistory.push(fillData);
  socket.emit('draw', fillData);
}

// Apply fill from received data
function applyFill(startX, startY, fillColor) {
  const width = canvas.width;
  const height = canvas.height;
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  const startPos = (startY * width + startX) * 4;
  const startR = data[startPos];
  const startG = data[startPos + 1];
  const startB = data[startPos + 2];
  const startA = data[startPos + 3];
  
  const r = parseInt(fillColor.slice(1, 3), 16);
  const g = parseInt(fillColor.slice(3, 5), 16);
  const b = parseInt(fillColor.slice(5, 7), 16);
  
  const stack = [[startX, startY]];
  const visited = new Set([`${startX},${startY}`]);
  
  function colorsMatch(pos) {
    const tolerance = 32;
    return Math.abs(data[pos] - startR) <= tolerance &&
           Math.abs(data[pos + 1] - startG) <= tolerance &&
           Math.abs(data[pos + 2] - startB) <= tolerance &&
           Math.abs(data[pos + 3] - startA) <= tolerance;
  }
  
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const pos = (y * width + x) * 4;
    
    data[pos] = r;
    data[pos + 1] = g;
    data[pos + 2] = b;
    data[pos + 3] = 255;
    
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const key = `${nx},${ny}`;
        if (!visited.has(key)) {
          const nPos = (ny * width + nx) * 4;
          if (colorsMatch(nPos)) {
            visited.add(key);
            stack.push([nx, ny]);
          }
        }
      }
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokeHistory = [];
  socket.emit('clearCanvas');
}

function clearCanvasLocal() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokeHistory = [];
}

function undoStroke() {
  if (strokeHistory.length === 0) return;
  strokeHistory.pop();
  redrawCanvas();
}

function redrawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokeHistory.forEach(stroke => drawStroke(stroke));
}

function setTool(tool) {
  currentTool = tool;

  // Update UI
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-tool-${tool}`).classList.add('active');

  // Update cursor
  if (tool === 'bucket') {
    canvas.style.cursor = 'crosshair';
  } else if (tool === 'eraser') {
    canvas.style.cursor = 'cell';
  } else {
    canvas.style.cursor = 'default';
  }
}

function getWordBlanks(word) {
  return word.split('').map(char => char === ' ' ? ' ' : '_').join('');
}

function getWordLengths(word) {
  const parts = word.split(' ');
  return parts.map(p => p.length).join(' ');
}

// Game State Update
function updateGameState(state) {
  elements.waitingRoom.classList.add('hidden');
  elements.gameArea.classList.remove('hidden');
  elements.currentRound.textContent = `Round ${state.currentRound}/${state.totalRounds}`;
  
  if (state.players) {
    updateScoreboard(null, state.players);
  }
}

// Sound Functions
function playCountSound() {
  if (!soundEnabled) return;
  loadSounds();
  if (sounds.count) {
    sounds.count.currentTime = 0;
    sounds.count.play().catch(e => console.log('Count sound error:', e.message));
  }
}

function playGuessSound() {
  if (!soundEnabled) return;
  loadSounds();
  if (sounds.guess) {
    sounds.guess.currentTime = 0;
    sounds.guess.play().catch(e => console.log('Guess sound error:', e.message));
  }
}

function playWinSound() {
  if (!soundEnabled) return;
  loadSounds();
  if (sounds.win) {
    sounds.win.currentTime = 0;
    sounds.win.play().catch(e => console.log('Win sound error:', e.message));
  }
}

// Utilities
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

init();