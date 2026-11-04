const crypto = require('node:crypto');
const express = require('express');
const http = require('node:http');
const path = require('node:path');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();

const defaultQuestions = [
  {
    question: 'Name a Christmas food.',
    answers: [
      { text: 'Turkey', points: 30 }, { text: 'Ham', points: 25 },
      { text: 'Cookies', points: 20 }, { text: 'Pie', points: 15 },
      { text: 'Cake', points: 10 }, { text: 'Pudding', points: 5 }
    ]
  },
  {
    question: 'Name one of Santa\'s reindeer.',
    answers: [
      { text: 'Rudolph', points: 35 }, { text: 'Dasher', points: 18 },
      { text: 'Dancer', points: 15 }, { text: 'Prancer', points: 12 },
      { text: 'Comet', points: 10 }, { text: 'Vixen', points: 6 },
      { text: 'Blitzen', points: 4 }
    ]
  },
  {
    question: 'Name a Christmas song people know by heart.',
    answers: [
      { text: 'Jingle Bells', points: 30 }, { text: 'Silent Night', points: 22 },
      { text: 'Deck the Halls', points: 16 }, { text: 'We Wish You a Merry Christmas', points: 12 },
      { text: 'Jingle Bell Rock', points: 9 }, { text: 'Rudolph the Red-Nosed Reindeer', points: 7 },
      { text: 'Frosty the Snowman', points: 4 }
    ]
  },
  {
    question: 'Name something that is red at Christmas.',
    answers: [
      { text: 'Santa suit', points: 30 }, { text: 'Poinsettia', points: 22 },
      { text: 'Christmas ornament', points: 18 }, { text: 'Gift wrapping', points: 12 },
      { text: 'Cardinal', points: 9 }, { text: 'Candy cane', points: 6 },
      { text: 'Stocking', points: 3 }
    ]
  },
  {
    question: 'Name a Christmas movie.',
    answers: [
      { text: 'Home Alone', points: 30 }, { text: 'Elf', points: 24 },
      { text: 'The Grinch', points: 18 }, { text: 'A Christmas Story', points: 12 },
      { text: 'The Polar Express', points: 8 }, { text: 'It\'s a Wonderful Life', points: 5 },
      { text: 'The Santa Clause', points: 3 }
    ]
  },
  {
    question: 'Name a gift someone might find under the tree.',
    answers: [
      { text: 'Toy', points: 28 }, { text: 'Clothes', points: 22 },
      { text: 'Books', points: 16 }, { text: 'Video game', points: 13 },
      { text: 'Gift card', points: 10 }, { text: 'Jewelry', points: 7 },
      { text: 'Headphones', points: 4 }
    ]
  },
  {
    question: 'Name an activity people do in the snow.',
    answers: [
      { text: 'Build a snowman', points: 28 }, { text: 'Sledding', points: 23 },
      { text: 'Skiing', points: 18 }, { text: 'Snowball fight', points: 13 },
      { text: 'Snowboarding', points: 9 }, { text: 'Make snow angels', points: 6 },
      { text: 'Ice skating', points: 3 }
    ]
  },
  {
    question: 'Name something you might recognize about Santa.',
    answers: [
      { text: 'White beard', points: 29 }, { text: 'Red suit', points: 24 },
      { text: 'Belly', points: 17 }, { text: 'Black boots', points: 11 },
      { text: 'Glasses', points: 8 }, { text: 'Jolly laugh', points: 6 },
      { text: 'Round glasses', points: 5 }
    ]
  },
  {
    question: 'Name something people put on a Christmas tree.',
    answers: [
      { text: 'Ornaments', points: 32 }, { text: 'Lights', points: 25 },
      { text: 'Star', points: 16 }, { text: 'Tinsel', points: 10 },
      { text: 'Garland', points: 8 }, { text: 'Candy canes', points: 6 },
      { text: 'Angel', points: 3 }
    ]
  },
  {
    question: 'Name something people leave out for Santa.',
    answers: [
      { text: 'Cookies', points: 38 }, { text: 'Milk', points: 30 },
      { text: 'Carrots for reindeer', points: 12 }, { text: 'A note', points: 8 },
      { text: 'Hot chocolate', points: 5 }, { text: 'Cheese', points: 4 },
      { text: 'Water', points: 3 }
    ]
  }
];

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));

function roomChannel(code) { return `room:${code}`; }
function hostChannel(code) { return `host:${code}`; }

function safeQuestions(questions) {
  return questions.map((item) => ({
    question: item.question,
    answers: [...item.answers].sort((a, b) => b.points - a.points)
  }));
}

function hostSnapshot(room) {
  const session = room.session;
  return {
    code: room.code,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      team: player.team,
      connected: player.connected,
      waiting: !session || !session.playerIds.includes(player.id)
    })),
    questions: room.questions,
    totals: room.totals,
    sessionNumber: room.sessionNumber,
    history: room.history,
    session: session ? {
      number: session.number,
      status: session.status,
      questionIndex: session.questionIndex,
      questionCount: session.questionCount,
      playerIds: session.playerIds,
      teams: session.teams,
      scores: session.scores,
      completedQuestions: session.completedQuestions,
      question: session.question ? {
        text: session.question.text,
        answers: session.question.answers,
        revealed: session.question.revealed,
        strikes: session.question.strikes,
        accumulated: session.question.accumulated,
        activeTeam: session.question.activeTeam,
        status: session.question.status,
        submission: session.question.submission,
        deadline: session.question.deadline,
        turn: session.question.turn,
        result: session.question.result,
        awardedTeam: session.question.awardedTeam,
        stolenFrom: session.question.stolenFrom
      } : null,
      turn: session.turn,
      message: session.message
    } : null
  };
}

function playerSnapshot(room, player) {
  const session = room.session;
  let question = null;
  if (session?.question) {
    const current = session.question;
    question = {
      text: current.text,
      board: current.answers.map((answer, index) => {
        const revealed = current.revealed.includes(index) || current.status === 'ended';
        return { revealed, text: revealed ? answer.text : null, points: revealed ? answer.points : null };
      }),
      status: current.status,
      activeTeam: current.activeTeam,
      strikes: current.strikes,
      accumulated: current.accumulated,
      deadline: current.deadline,
      submissionReceived: Boolean(current.submission),
      result: current.result,
      turn: current.turn
    };
  }
  return {
    code: room.code,
    player: { id: player.id, name: player.name, team: player.team, connected: player.connected },
    totals: room.totals,
    session: session ? {
      number: session.number,
      status: session.status,
      questionIndex: session.questionIndex,
      questionCount: session.questionCount,
      scores: session.scores,
      teams: session.teams,
      message: session.message,
      question
    } : null
  };
}

function broadcast(room) {
  const hostView = hostSnapshot(room);
  io.to(hostChannel(room.code)).emit('hostState', hostView);
  for (const player of room.players.values()) {
    if (player.connected && player.socketId) {
      io.to(player.socketId).emit('playerState', playerSnapshot(room, player));
    }
  }
}

function fail(message) { throw new Error(message); }

function hostAction(socket, payload, action) {
  const room = rooms.get(String(payload.code || '').toUpperCase());
  if (!room || payload.token !== room.hostToken) fail('Host token mismatch or room no longer exists.');
  socket.join(roomChannel(room.code));
  socket.join(hostChannel(room.code));
  const result = action(room);
  broadcast(room);
  return { ...result, state: hostSnapshot(room) };
}

function normalizeAnswer(value) {
  return String(value || '').toLocaleLowerCase().trim()
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/g, ' ');
}

function clearTimer(question) {
  if (question.timer) clearTimeout(question.timer);
  question.timer = null;
}

function finishQuestion(room, awardTeam, result) {
  const session = room.session;
  const question = session.question;
  clearTimer(question);
  question.status = 'ended';
  question.deadline = null;
  question.result = result;
  question.awardedTeam = awardTeam;
  if (awardTeam) session.scores[awardTeam] += question.accumulated;
  session.completedQuestions += 1;
  session.status = 'question-ended';
  session.message = result;
}

function startTimer(room, seconds, mode) {
  const question = room.session.question;
  clearTimer(question);
  question.turn = mode;
  question.deadline = Date.now() + seconds * 1000;
  question.timer = setTimeout(() => {
    const latest = rooms.get(room.code)?.session?.question;
    if (!latest || latest !== question || latest.status === 'ended') return;
    if (latest.status === 'steal') {
      finishQuestion(room, latest.stolenFrom, 'Time expired. The original team keeps the points.');
    } else {
      applyStrike(room, 'Time expired.');
    }
    broadcast(room);
  }, seconds * 1000);
}

function beginSteal(room) {
  const question = room.session.question;
  question.status = 'steal';
  question.stolenFrom = question.activeTeam;
  question.activeTeam = question.activeTeam === 'blue' ? 'red' : 'blue';
  question.submission = null;
  startTimer(room, 45, 'steal');
}

function applyStrike(room, note = 'Strike added.') {
  const question = room.session.question;
  question.strikes[question.activeTeam] += 1;
  question.submission = null;
  question.result = note;
  if (question.strikes[question.activeTeam] >= 3) {
    beginSteal(room);
  } else {
    startTimer(room, 60, 'answer');
  }
}

function resolveAnswer(room, answerText) {
  const session = room.session;
  const question = session.question;
  const normalized = normalizeAnswer(answerText);
  if (!normalized) fail('Enter an answer, or use Add Strike for an empty answer.');
  const index = question.answers.findIndex((answer, answerIndex) =>
    normalizeAnswer(answer.text) === normalized && !question.revealed.includes(answerIndex));

  if (question.status === 'steal') {
    if (index >= 0) {
      question.revealed.push(index);
      question.accumulated += question.answers[index].points;
      finishQuestion(room, question.activeTeam, `${question.answers[index].text} is correct. ${question.activeTeam === 'blue' ? 'Blue' : 'Red'} steals ${question.accumulated} points.`);
    } else {
      finishQuestion(room, question.stolenFrom, 'The steal was missed. The original team keeps the points.');
    }
    return;
  }

  if (index >= 0) {
    question.revealed.push(index);
    question.accumulated += question.answers[index].points;
    question.result = `${question.answers[index].text} is correct for ${question.answers[index].points} points.`;
    question.submission = null;
    if (question.revealed.length === question.answers.length) {
      finishQuestion(room, question.activeTeam, 'All answers revealed. Points awarded.');
    } else {
      startTimer(room, 60, 'answer');
    }
  } else {
    applyStrike(room, 'Wrong or already revealed answer.');
  }
}

function initializeQuestion(room, index) {
  const session = room.session;
  const source = room.questions[index];
  const startingTeam = index % 2 === 0 ? 'blue' : 'red';
  session.questionIndex = index;
  session.status = 'active';
  session.message = '';
  session.question = {
    text: source.question,
    answers: [...source.answers],
    revealed: [],
    strikes: { blue: 0, red: 0 },
    accumulated: 0,
    activeTeam: startingTeam,
    status: 'playing',
    submission: null,
    deadline: null,
    timer: null,
    turn: 'answer',
    result: '',
    stolenFrom: null
  };
  startTimer(room, 60, 'answer');
}

function validateQuestions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) fail('Provide between 1 and 100 questions.');
  return value.map((item, index) => {
    const question = String(item?.question || '').trim().slice(0, 180);
    if (!question) fail(`Question ${index + 1} needs question text.`);
    if (!Array.isArray(item.answers) || item.answers.length < 2 || item.answers.length > 12) {
      fail(`Question ${index + 1} needs 2 to 12 answers.`);
    }
    const answers = item.answers.map((answer, answerIndex) => {
      const text = String(answer?.text || '').trim().slice(0, 80);
      const points = Number(answer?.points);
      if (!text || !Number.isInteger(points) || points < 1 || points > 10000) {
        fail(`Question ${index + 1}, answer ${answerIndex + 1}: enter text and positive integer points.`);
      }
      return { text, points };
    });
    if (new Set(answers.map((answer) => normalizeAnswer(answer.text))).size !== answers.length) {
      fail(`Question ${index + 1} has duplicate answers.`);
    }
    return { question, answers: answers.sort((a, b) => b.points - a.points) };
  });
}

function createRoom() {
  let code;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  do {
    code = [...crypto.randomBytes(5)].map((byte) => alphabet[byte % alphabet.length]).join('');
  } while (rooms.has(code));
  const room = {
    code,
    hostToken: crypto.randomBytes(24).toString('hex'),
    players: new Map(),
    questions: safeQuestions(defaultQuestions),
    totals: { blue: 0, red: 0 },
    sessionNumber: 0,
    session: null,
    history: []
  };
  rooms.set(code, room);
  return room;
}

function respond(socket, event, handler) {
  socket.on(event, async (payload = {}, callback = () => {}) => {
    try {
      const result = await handler(payload);
      if (typeof callback === 'function') callback({ ok: true, ...result });
    } catch (error) {
      if (typeof callback === 'function') callback({ ok: false, error: error.message || 'Action failed.' });
    }
  });
}

io.on('connection', (socket) => {
  respond(socket, 'createRoom', () => {
    const room = createRoom();
    socket.join(roomChannel(room.code));
    socket.join(hostChannel(room.code));
    return { code: room.code, token: room.hostToken, state: hostSnapshot(room) };
  });

  respond(socket, 'hostSync', ({ code, token }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.hostToken !== token) fail('Host token mismatch or room no longer exists.');
    socket.join(roomChannel(room.code));
    socket.join(hostChannel(room.code));
    return { state: hostSnapshot(room) };
  });

  respond(socket, 'joinRoom', ({ code, name, playerId }) => {
    const roomCode = String(code || '').trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) fail('Room code not found. Check the code with your host.');
    const cleanName = String(name || '').trim().slice(0, 20);
    if (!cleanName) fail('Enter a display name (up to 20 characters).');
    let player = playerId ? room.players.get(String(playerId)) : null;
    if (player) {
      player.name = cleanName;
      player.socketId = socket.id;
      player.connected = true;
    } else {
      if (room.players.size >= 30) fail('This room is full (30 players maximum).');
      player = {
        id: crypto.randomUUID(), name: cleanName, team: null,
        socketId: socket.id, connected: true
      };
      room.players.set(player.id, player);
    }
    socket.data.player = { code: room.code, id: player.id };
    socket.join(roomChannel(room.code));
    const duplicateName = [...room.players.values()].some((other) => other.id !== player.id && other.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase());
    io.to(hostChannel(room.code)).emit('playerJoined', { id: player.id, name: player.name });
    broadcast(room);
    return { code: room.code, playerId: player.id, duplicateName, state: playerSnapshot(room, player) };
  });

  respond(socket, 'submitAnswer', ({ answer }) => {
    const reference = socket.data.player;
    const room = reference && rooms.get(reference.code);
    const player = room?.players.get(reference.id);
    const question = room?.session?.question;
    if (!player || !player.connected || player.socketId !== socket.id) fail('Join the room before submitting.');
    if (!question || !['playing', 'steal'].includes(question.status) || question.activeTeam !== player.team) fail('Your team is not active right now.');
    if (question.submission) fail('Your team already submitted an answer.');
    const text = String(answer || '').trim().slice(0, 80);
    if (!text) fail('Enter an answer first.');
    question.submission = { text, playerName: player.name };
    broadcast(room);
    return {};
  });

  respond(socket, 'leaveRoom', () => {
    const reference = socket.data.player;
    const room = reference && rooms.get(reference.code);
    const player = room?.players.get(reference.id);
    if (player?.socketId === socket.id) {
      player.connected = false;
      broadcast(room);
    }
    socket.data.player = null;
    if (reference) socket.leave(roomChannel(reference.code));
    return {};
  });

  const hostEvents = {
    startSession: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      if (room.session) fail('End the current session before starting another.');
      if (room.questions.length === 0) fail('Add at least one question before starting.');
      const waiting = [...room.players.values()].filter((player) => !player.team && player.connected);
      const count = Math.min(10, waiting.length) - (Math.min(10, waiting.length) % 2);
      if (count < 4) fail('At least 4 connected waiting players are needed to start.');
      const selected = waiting.slice(0, count);
      const teams = { blue: [], red: [] };
      selected.forEach((player, index) => {
        player.team = index % 2 === 0 ? 'blue' : 'red';
        teams[player.team].push(player.id);
      });
      room.sessionNumber += 1;
      room.session = {
        number: room.sessionNumber,
        status: 'ready',
        questionIndex: -1,
        questionCount: Math.min(3, room.questions.length),
        playerIds: selected.map((player) => player.id),
        teams,
        scores: { blue: 0, red: 0 },
        completedQuestions: 0,
        question: null,
        message: 'Teams are set. Start the first question when ready.'
      };
      return { startedPlayers: count };
    }),
    assignTeams: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      if (!room.session || room.session.status !== 'ready') fail('Teams can only be assigned before the first question.');
      room.session.playerIds.forEach((id, index) => {
        const player = room.players.get(id);
        if (player) player.team = index % 2 === 0 ? 'blue' : 'red';
      });
      room.session.teams.blue = room.session.playerIds.filter((id) => room.players.get(id)?.team === 'blue');
      room.session.teams.red = room.session.playerIds.filter((id) => room.players.get(id)?.team === 'red');
      return {};
    }),
    swapTeam: ({ code, token, playerId, targetId }) => hostAction(socket, { code, token }, (room) => {
      const session = room.session;
      if (!session || session.status !== 'ready') fail('Teams can only be swapped before the first question.');
      const player = room.players.get(playerId);
      if (!player || !session.playerIds.includes(player.id)) fail('Player is not in this session.');
      const target = targetId ? room.players.get(targetId) : room.players.get(session.teams[player.team === 'blue' ? 'red' : 'blue'][0]);
      if (!target || target.team === player.team) fail('Choose a player on the other team to swap with.');
      const oldTeam = player.team;
      player.team = target.team;
      target.team = oldTeam;
      session.teams.blue = session.playerIds.filter((id) => room.players.get(id)?.team === 'blue');
      session.teams.red = session.playerIds.filter((id) => room.players.get(id)?.team === 'red');
      return {};
    }),
    startQuestion: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      if (!room.session || room.session.status !== 'ready' || room.session.questionIndex !== -1) fail('The first question is not ready to start.');
      initializeQuestion(room, 0);
      return {};
    }),
    hostSubmitAnswer: ({ code, token, answer }) => hostAction(socket, { code, token }, (room) => {
      const question = room.session?.question;
      if (!question || !['playing', 'steal'].includes(question.status) || question.submission) fail('No answer can be entered right now.');
      const value = String(answer || '').trim().slice(0, 80);
      if (!value) fail('Enter an answer first.');
      question.submission = { text: value, playerName: 'Host override' };
      return {};
    }),
    resolveAnswer: ({ code, token, answer }) => hostAction(socket, { code, token }, (room) => {
      const question = room.session?.question;
      if (!question || !['playing', 'steal'].includes(question.status)) fail('There is no answer to resolve.');
      resolveAnswer(room, answer || question.submission?.text || '');
      return {};
    }),
    clearSubmission: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      const question = room.session?.question;
      if (!question || !['playing', 'steal'].includes(question.status)) fail('There is no active submission.');
      question.submission = null;
      return {};
    }),
    addStrike: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      if (!room.session?.question || room.session.question.status !== 'playing') fail('A strike can only be added during a regular turn.');
      applyStrike(room);
      return {};
    }),
    skipTimer: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      const question = room.session?.question;
      if (!question || !['playing', 'steal'].includes(question.status)) fail('There is no active timer to skip.');
      if (question.status === 'steal') {
        finishQuestion(room, question.stolenFrom, 'The host ended the steal timer. The original team keeps the points.');
      } else {
        applyStrike(room, 'The host skipped the timer.');
      }
      return {};
    }),
    passControl: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      if (!room.session?.question || room.session.question.status !== 'playing') fail('Control can only pass during a regular turn.');
      beginSteal(room);
      return {};
    }),
    stealAttempt: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      if (!room.session?.question || room.session.question.status !== 'playing') fail('A steal attempt is not available.');
      beginSteal(room);
      return {};
    }),
    nextQuestion: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      const session = room.session;
      if (!session || session.status !== 'question-ended') fail('Finish the current question first.');
      if (session.completedQuestions >= session.questionCount) {
        session.status = 'complete';
        session.message = 'All session questions are complete. End the session to bank these points.';
      } else {
        initializeQuestion(room, session.questionIndex + 1);
      }
      return {};
    }),
    endSession: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      const session = room.session;
      if (!session) fail('There is no active session.');
      if (session.question?.timer) clearTimer(session.question);
      if (session.completedQuestions > 0) {
        room.totals.blue += session.scores.blue;
        room.totals.red += session.scores.red;
      }
      room.history.push({ number: session.number, blue: session.scores.blue, red: session.scores.red, questions: session.completedQuestions });
      for (const id of session.playerIds) {
        const player = room.players.get(id);
        if (player) player.team = null;
      }
      room.session = null;
      return {};
    }),
    removePlayer: ({ code, token, playerId }) => hostAction(socket, { code, token }, (room) => {
      const player = room.players.get(playerId);
      if (!player) fail('Player not found.');
      if (room.session?.playerIds.includes(playerId)) fail('End the session before removing its players.');
      if (player.connected) io.to(player.socketId).emit('playerRemoved', 'The host removed you from the room.');
      room.players.delete(playerId);
      return {};
    }),
    updateQuestions: ({ code, token, questions }) => hostAction(socket, { code, token }, (room) => {
      if (room.session) fail('Questions can only be edited while the room is between sessions.');
      room.questions = validateQuestions(questions);
      return {};
    }),
    resetRoom: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      if (room.session?.question?.timer) clearTimer(room.session.question);
      for (const player of room.players.values()) {
        if (player.connected) io.to(player.socketId).emit('playerRemoved', 'The host reset the room.');
      }
      room.players.clear();
      room.totals = { blue: 0, red: 0 };
      room.sessionNumber = 0;
      room.session = null;
      room.history = [];
      return {};
    })
  };

  for (const [event, handler] of Object.entries(hostEvents)) respond(socket, event, handler);

  socket.on('disconnect', () => {
    const reference = socket.data.player;
    const room = reference && rooms.get(reference.code);
    const player = room?.players.get(reference.id);
    if (player?.socketId === socket.id) {
      player.connected = false;
      broadcast(room);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Christmas Family Feud is ready at http://localhost:${PORT}`);
});