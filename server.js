const crypto = require('node:crypto');
const express = require('express');
const http = require('node:http');
const path = require('node:path');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const rooms = new Map();

const christmasQuestions = [
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

const defaultQuestions = [
  {
    question: 'Name a pizza topping.',
    answers: [
      { text: 'Pepperoni', points: 30 }, { text: 'Mushrooms', points: 20 },
      { text: 'Sausage', points: 18 }, { text: 'Extra cheese', points: 14 },
      { text: 'Olives', points: 10 }, { text: 'Peppers', points: 8 }
    ]
  },
  {
    question: 'Name something found in a classroom.',
    answers: [
      { text: 'Desks', points: 25 }, { text: 'Chalkboard', points: 22 },
      { text: 'Books', points: 20 }, { text: 'Pencils', points: 15 },
      { text: 'Computer', points: 10 }, { text: 'Clock', points: 8 }
    ]
  },
  {
    question: 'Name a household chore.',
    answers: [
      { text: 'Doing dishes', points: 25 }, { text: 'Vacuuming', points: 22 },
      { text: 'Laundry', points: 20 }, { text: 'Taking out trash', points: 15 },
      { text: 'Dusting', points: 10 }, { text: 'Mopping', points: 8 }
    ]
  },
  {
    question: 'Name something people bring to a picnic.',
    answers: [
      { text: 'Sandwiches', points: 25 }, { text: 'Drinks', points: 22 },
      { text: 'Blanket', points: 18 }, { text: 'Chips', points: 15 },
      { text: 'Fruit', points: 12 }, { text: 'Dessert', points: 8 }
    ]
  },
  {
    question: 'Name an animal you might see at a zoo.',
    answers: [
      { text: 'Lion', points: 25 }, { text: 'Elephant', points: 22 },
      { text: 'Monkey', points: 18 }, { text: 'Giraffe', points: 15 },
      { text: 'Tiger', points: 12 }, { text: 'Penguin', points: 8 }
    ]
  },
  {
    question: 'Name something you do before going to bed.',
    answers: [
      { text: 'Brush teeth', points: 25 }, { text: 'Change clothes', points: 22 },
      { text: 'Read', points: 18 }, { text: 'Set an alarm', points: 15 },
      { text: 'Wash face', points: 12 }, { text: 'Check phone', points: 8 }
    ]
  },
  {
    question: 'Name a popular breakfast food.',
    answers: [
      { text: 'Eggs', points: 25 }, { text: 'Cereal', points: 22 },
      { text: 'Toast', points: 18 }, { text: 'Pancakes', points: 15 },
      { text: 'Bacon', points: 12 }, { text: 'Oatmeal', points: 8 }
    ]
  },
  {
    question: 'Name something you might pack for a day trip.',
    answers: [
      { text: 'Water bottle', points: 25 }, { text: 'Snacks', points: 22 },
      { text: 'Phone', points: 18 }, { text: 'Jacket', points: 15 },
      { text: 'Sunscreen', points: 12 }, { text: 'Camera', points: 8 }
    ]
  }
];

const easterQuestions = [
  {
    question: 'Name an Easter candy.',
    answers: [
      { text: 'Chocolate eggs', points: 25 }, { text: 'Jelly beans', points: 22 },
      { text: 'Chocolate bunny', points: 20 }, { text: 'Peeps', points: 15 },
      { text: 'Cadbury Creme Egg', points: 10 }, { text: 'Marshmallow eggs', points: 8 }
    ]
  },
  {
    question: 'Name an animal associated with Easter.',
    answers: [
      { text: 'Bunny', points: 35 }, { text: 'Chick', points: 25 },
      { text: 'Lamb', points: 15 }, { text: 'Duckling', points: 10 },
      { text: 'Chicken', points: 8 }, { text: 'Butterfly', points: 7 }
    ]
  },
  {
    question: 'Name something you do on Easter.',
    answers: [
      { text: 'Eat a meal with family', points: 25 }, { text: 'Egg hunt', points: 22 },
      { text: 'Go to church', points: 18 }, { text: 'Give candy', points: 15 },
      { text: 'Decorate eggs', points: 12 }, { text: 'Visit relatives', points: 8 }
    ]
  },
  {
    question: 'Name a color of an Easter egg.',
    answers: [
      { text: 'Pink', points: 22 }, { text: 'Blue', points: 20 },
      { text: 'Yellow', points: 18 }, { text: 'Purple', points: 16 },
      { text: 'Green', points: 14 }, { text: 'Orange', points: 10 }
    ]
  },
  {
    question: 'Name something you might find in an Easter basket.',
    answers: [
      { text: 'Chocolate', points: 25 }, { text: 'Jelly beans', points: 22 },
      { text: 'Toy', points: 18 }, { text: 'Stuffed bunny', points: 15 },
      { text: 'Plastic eggs', points: 12 }, { text: 'Books', points: 8 }
    ]
  },
  {
    question: 'Name something used to decorate Easter eggs.',
    answers: [
      { text: 'Dye', points: 28 }, { text: 'Paint', points: 22 },
      { text: 'Markers', points: 18 }, { text: 'Stickers', points: 14 },
      { text: 'Glitter', points: 10 }, { text: 'Crayons', points: 8 }
    ]
  },
  {
    question: 'Name a food served at Easter dinner.',
    answers: [
      { text: 'Ham', points: 28 }, { text: 'Potatoes', points: 22 },
      { text: 'Lamb', points: 18 }, { text: 'Deviled eggs', points: 14 },
      { text: 'Carrots', points: 10 }, { text: 'Rolls', points: 8 }
    ]
  },
  {
    question: 'Name a place children look for Easter eggs.',
    answers: [
      { text: 'In the yard', points: 25 }, { text: 'In the garden', points: 22 },
      { text: 'Under a bush', points: 18 }, { text: 'Behind a tree', points: 15 },
      { text: 'In the house', points: 12 }, { text: 'In a basket', points: 8 }
    ]
  }
];

const themeRegistry = {
  default: { id: 'default', name: 'Default', title: 'Family Feud', defaultQuestions },
  christmas: { id: 'christmas', name: 'Christmas', title: 'Christmas Feud', defaultQuestions: christmasQuestions },
  easter: { id: 'easter', name: 'Easter', title: 'Easter Feud', defaultQuestions: easterQuestions }
};

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/presentation', (req, res) => res.sendFile(path.join(__dirname, 'public', 'presentation.html')));
app.get('/host', (req, res) => res.redirect(302, '/#host'));
app.get('/play', (req, res) => res.redirect(302, '/#join'));
app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));
app.get('/config', (req, res) => res.json({ publicUrl: process.env.PUBLIC_URL || null }));
app.get('/qr.svg', async (req, res, next) => {
  try {
    const joinUrl = new URL(String(req.query.url || ''));
    const base = new URL(process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`);
    if (!['http:', 'https:'].includes(joinUrl.protocol) || joinUrl.origin !== base.origin || !joinUrl.searchParams.has('room')) {
      return res.status(400).send('Invalid join URL.');
    }
    const svg = await QRCode.toString(joinUrl.toString(), { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
    res.type('svg').send(svg);
  } catch (error) {
    next(error);
  }
});

function roomChannel(code) { return `room:${code}`; }
function hostChannel(code) { return `host:${code}`; }
function presentationChannel(code) { return `presentation:${code}`; }

function safeQuestions(questions) {
  return questions.map((item) => ({
    question: item.question,
    answers: item.answers.map((answer) => ({ ...answer }))
  }));
}

function hostSnapshot(room) {
  const session = room.session;
  return {
    code: room.code,
    themeId: room.themeId,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      team: player.team,
      connected: player.connected,
      played: room.playedPlayerIds.has(player.id),
      waiting: !session || !session.playerIds.includes(player.id)
    })),
    questions: room.questions,
    roundScores: room.roundScores,
    roundHistory: room.roundHistory,
    sessionNumber: room.sessionNumber,
    history: room.history,
    session: session ? {
      number: session.number,
      status: session.status,
      questionIndex: session.questionIndex,
      questionCount: session.questionCount,
      playerIds: session.playerIds,
      teams: session.teams,
      scores: room.roundScores,
      completedQuestions: session.completedQuestions,
      submissionLog: session.submissionLog,
      question: session.question ? {
        text: session.question.text,
        answers: session.question.answers,
        revealed: session.question.revealed,
        revealedBy: session.question.revealedBy,
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
        const revealedBy = revealed ? (current.revealedBy[index] ?? null) : null;
        return { revealed, text: revealed ? answer.text : null, points: revealed ? answer.points : null, revealedBy };
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
    themeId: room.themeId,
    player: { id: player.id, name: player.name, team: player.team, connected: player.connected },
    roundScores: room.roundScores,
    session: session ? {
      number: session.number,
      status: session.status,
      questionIndex: session.questionIndex,
      questionCount: session.questionCount,
      scores: room.roundScores,
      teams: session.teams,
      message: session.message,
      question
    } : null
  };
}

function presentationSnapshot(room) {
  const session = room.session;
  return {
    code: room.code,
    themeId: room.themeId,
    roundScores: room.roundScores,
    sessionNumber: room.sessionNumber,
    serverTime: Date.now(),
    session: session ? {
      number: session.number,
      status: session.status,
      questionIndex: session.questionIndex,
      questionCount: session.questionCount,
      finalScoreShown: Boolean(session.finalScoreShown),
      question: session.question ? {
        text: session.question.text,
        answers: session.question.answers.map((answer, index) => {
          const revealed = session.question.revealed.includes(index) || session.question.status === 'ended';
          return {
            revealed,
            text: revealed ? answer.text : null,
            points: revealed ? answer.points : null,
            revealedBy: revealed ? (session.question.revealedBy[index] ?? null) : null
          };
        }),
        status: session.question.status,
        activeTeam: session.question.activeTeam,
        strikes: session.question.strikes,
        deadline: session.question.deadline,
        stolenFrom: session.question.stolenFrom
      } : null
    } : null
  };
}

function broadcast(room) {
  const hostView = hostSnapshot(room);
  io.to(hostChannel(room.code)).emit('hostState', hostView);
  io.to(presentationChannel(room.code)).emit('presentationState', presentationSnapshot(room));
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
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\p{P}\p{S}]/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeExactAnswer(value) {
  return String(value || '').toLowerCase().trim().replace(/\p{P}/gu, '').replace(/\s+/g, ' ');
}

function recordSubmission(room, submission, result, points = 0, note = '') {
  const session = room.session;
  if (!session) return;
  const questionNumber = session.questionIndex + 1;
  let group = session.submissionLog[session.submissionLog.length - 1];
  if (!group || group.questionNumber !== questionNumber) {
    group = { questionNumber, questionText: session.question?.text || '', entries: [] };
    session.submissionLog.push(group);
  }
  group.entries.push({
    timestamp: submission.submittedAt || Date.now(),
    team: submission.team || session.question?.activeTeam || 'blue',
    playerName: submission.playerName || '—',
    rawInput: submission.text || '',
    result,
    points,
    note
  });
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
  if (awardTeam) room.roundScores[awardTeam] += question.accumulated;
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
      failSteal(room, 'Time expired. The original team keeps the points.', 'Timed out');
    } else {
      recordSubmission(room, latest.submission || {
        text: '',
        team: latest.activeTeam,
        playerName: '—',
        submittedAt: Date.now()
      }, 'Timed out');
      applyStrike(room, 'Time expired.');
    }
    broadcast(room);
  }, seconds * 1000);
}

function beginSteal(room) {
  const question = room.session.question;
  if (question.submission) {
    recordSubmission(room, question.submission, 'Wrong', 0, 'Control passed before resolution.');
  }
  question.status = 'steal';
  question.stolenFrom = question.activeTeam;
  question.activeTeam = question.activeTeam === 'blue' ? 'red' : 'blue';
  question.submission = null;
  question.stealSubmitted = false;
  startTimer(room, 45, 'steal');
}

function revealUnclaimedAnswers(question) {
  question.answers.forEach((_, index) => {
    if (!question.revealed.includes(index)) {
      question.revealed.push(index);
      question.revealedBy[index] = null;
    }
  });
}

function failSteal(room, result = 'The steal was missed. The original team keeps the points.', submissionResult = 'Failed steal') {
  const question = room.session.question;
  if (question.submission) recordSubmission(room, question.submission, submissionResult);
  else if (submissionResult === 'Timed out') {
    recordSubmission(room, {
      text: '',
      team: question.activeTeam,
      playerName: '—',
      submittedAt: Date.now()
    }, submissionResult);
  }
  revealUnclaimedAnswers(question);
  finishQuestion(room, question.stolenFrom, result);
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

function awardMatch(room, submission, index) {
  const session = room.session;
  const question = session.question;
  const answer = question.answers[index];
  recordSubmission(room, submission, submission.playerName === 'host selection' ? 'Correct (host judgment)' : 'Correct', answer.points);
  question.revealed.push(index);
  question.revealedBy[index] = question.activeTeam;
  question.accumulated += answer.points;
  question.submission = null;
  if (question.status === 'steal') {
    revealUnclaimedAnswers(question);
    finishQuestion(room, question.activeTeam, `${answer.text} is correct. ${question.activeTeam === 'blue' ? 'Blue' : 'Red'} steals ${question.accumulated} points.`);
    return;
  }
  question.result = `${answer.text} is correct for ${answer.points} points.`;
  if (question.revealed.length === question.answers.length) {
    finishQuestion(room, question.activeTeam, 'All answers revealed. Points awarded.');
  } else {
    startTimer(room, 60, 'answer');
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
    revealedBy: Array(source.answers.length).fill(null),
    strikes: { blue: 0, red: 0 },
    accumulated: 0,
    activeTeam: startingTeam,
    status: 'playing',
    submission: null,
    stealSubmitted: false,
    deadline: null,
    timer: null,
    turn: 'answer',
    result: '',
    stolenFrom: null
  };
  session.submissionLog.push({
    questionNumber: index + 1,
    questionText: source.question,
    entries: []
  });
  startTimer(room, 60, 'answer');
}

function validateQuestions(value) {
  if (!Array.isArray(value) || value.length > 100) fail('Provide no more than 100 questions.');
  return value.map((item, index) => {
    const question = item?.question;
    if (typeof question !== 'string' || !question.trim() || question.length > 180) fail(`Question ${index + 1} needs question text (up to 180 characters).`);
    if (!Array.isArray(item.answers) || item.answers.length < 2 || item.answers.length > 12) {
      fail(`Question ${index + 1} needs 2 to 12 answers.`);
    }
    const answers = item.answers.map((answer, answerIndex) => {
      const text = answer?.text;
      const points = Number(answer?.points);
      if (typeof text !== 'string' || !text.trim() || text.length > 80 || !Number.isInteger(points) || points < 1 || points > 10000) {
        fail(`Question ${index + 1}, answer ${answerIndex + 1}: enter answer text (up to 80 characters) and positive integer points.`);
      }
      if (!normalizeAnswer(text)) fail(`Question ${index + 1}, answer ${answerIndex + 1}: include at least one letter or number.`);
      return { text, points };
    });
    if (new Set(answers.map((answer) => normalizeAnswer(answer.text))).size !== answers.length) {
      fail(`Question ${index + 1} has duplicate answers.`);
    }
    return { question, answers };
  });
}

function createRoom(requestedThemeId) {
  let code;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  do {
    code = [...crypto.randomBytes(5)].map((byte) => alphabet[byte % alphabet.length]).join('');
  } while (rooms.has(code));
  const themeId = Object.hasOwn(themeRegistry, requestedThemeId) ? requestedThemeId : 'default';
  const theme = themeRegistry[themeId];
  const room = {
    code,
    // Theme is immutable for this room's lifetime, including Reset room.
    themeId,
    hostToken: crypto.randomBytes(24).toString('hex'),
    players: new Map(),
    playedPlayerIds: new Set(),
    questions: safeQuestions(theme.defaultQuestions),
    roundScores: { blue: 0, red: 0 },
    roundHistory: [],
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
      if (socket.data.presentation && event !== 'presentationJoin') fail('Presentation sockets are read-only.');
      const result = await handler(payload);
      if (typeof callback === 'function') callback({ ok: true, ...result });
    } catch (error) {
      if (typeof callback === 'function') callback({ ok: false, error: error.message || 'Action failed.' });
    }
  });
}

io.on('connection', (socket) => {
  respond(socket, 'createRoom', ({ themeId } = {}) => {
    const room = createRoom(themeId);
    socket.join(roomChannel(room.code));
    socket.join(hostChannel(room.code));
    return { code: room.code, token: room.hostToken, state: hostSnapshot(room) };
  });

  respond(socket, 'hostSync', ({ code, token }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.hostToken !== token) fail('Host token mismatch or room no longer exists.');
    socket.join(roomChannel(room.code));
    socket.join(hostChannel(room.code));
    socket.emit('hostState', hostSnapshot(room));
    return { state: hostSnapshot(room) };
  });

  respond(socket, 'hostLeave', ({ code, token }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.hostToken !== token) fail('Host token mismatch or room no longer exists.');
    if (room.session) fail('End the active session before leaving the room.');
    socket.leave(roomChannel(room.code));
    socket.leave(hostChannel(room.code));
    return {};
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
    socket.emit('playerState', playerSnapshot(room, player));
    broadcast(room);
    return { code: room.code, playerId: player.id, duplicateName, state: playerSnapshot(room, player) };
  });

  respond(socket, 'presentationJoin', ({ code }) => {
    const roomCode = String(code || '').trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) fail('Room code not found. Check the code with your host.');
    socket.data.presentation = true;
    socket.data.presentationCode = room.code;
    socket.join(presentationChannel(room.code));
    const state = presentationSnapshot(room);
    socket.emit('presentationState', state);
    return { state };
  });

  respond(socket, 'submitAnswer', ({ answer }) => {
    const reference = socket.data.player;
    const room = reference && rooms.get(reference.code);
    const player = room?.players.get(reference.id);
    const question = room?.session?.question;
    if (!player || !player.connected || player.socketId !== socket.id) fail('Join the room before submitting.');
    if (question?.stealSubmitted && question.stolenFrom && question.activeTeam === player.team) fail('Steal already submitted.');
    if (!question || !['playing', 'steal'].includes(question.status) || question.activeTeam !== player.team) fail('Your team is not active right now.');
    if (question.status === 'steal' && question.stealSubmitted) fail('Steal already submitted.');
    if (question.submission) fail('Your team already submitted an answer.');
    const text = String(answer ?? '').slice(0, 80);
    if (!text.trim()) fail('Enter an answer first.');
    const submission = { text, playerName: player.name, team: player.team, submittedAt: Date.now() };
    question.submission = submission;
    if (question.status === 'steal') question.stealSubmitted = true;
    // Auto-reveal only on exact normalized match for speed. All non-exact judgment is the host's manual click; this eliminates the typo/plural confirm dialog which was too slow and error-prone at party scale.
    const exactIndex = question.answers.findIndex((candidate, index) =>
      !question.revealed.includes(index) &&
      normalizeExactAnswer(candidate.text) === normalizeExactAnswer(text));
    if (exactIndex >= 0) awardMatch(room, submission, exactIndex);
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
      if (room.questions.length === 0) fail('Add at least 1 question in the Question Editor before starting a round.');
      const waiting = [...room.players.values()].filter((player) => !player.team && player.connected);
      const count = Math.min(10, waiting.length) - (Math.min(10, waiting.length) % 2);
      if (count < 4) fail('At least 4 connected waiting players are needed to start.');
      const selected = waiting.slice(0, count);
      room.roundScores = { blue: 0, red: 0 };
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
        questionCount: room.questions.length,
        playerIds: selected.map((player) => player.id),
        teams,
        completedQuestions: 0,
        submissionLog: [],
        question: null,
        finalScoreShown: false,
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
    revealAnswer: ({ code, token, index }) => hostAction(socket, { code, token }, (room) => {
      const question = room.session?.question;
      if (!question || !['playing', 'steal'].includes(question.status)) fail('Answers can only be revealed during an active question.');
      if (!Number.isInteger(index) || index < 0 || index >= question.answers.length) fail('Choose a valid answer.');
      if (question.revealed.includes(index)) return {};
      const answer = question.answers[index];
      const submission = question.submission || {
        text: answer.text,
        playerName: 'host selection',
        team: question.activeTeam,
        submittedAt: Date.now()
      };
      awardMatch(room, submission, index);
      return {};
    }),
    addStrike: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      const question = room.session?.question;
      if (!question || !['playing', 'steal'].includes(question.status)) fail('A strike can only be added during an active turn.');
      if (question.status === 'steal') {
        failSteal(room);
      } else {
        if (question.submission) recordSubmission(room, question.submission, 'Wrong', 0, 'Strike added by host.');
        applyStrike(room);
      }
      return {};
    }),
    skipTimer: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      const question = room.session?.question;
      if (!question || !['playing', 'steal'].includes(question.status)) fail('There is no active timer to skip.');
      if (question.status === 'steal') {
        failSteal(room, 'The host ended the steal timer. The original team keeps the points.', 'Timed out');
      } else {
        recordSubmission(room, question.submission || { team: question.activeTeam, playerName: '—', text: '', submittedAt: Date.now() }, 'Timed out');
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
      if (!session || session.status !== 'question-ended' || session.questionIndex >= session.questionCount - 1) fail('No next question is available.');
      initializeQuestion(room, session.questionIndex + 1);
      return {};
    }),
    showFinalScore: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      const session = room.session;
      if (!session || session.status !== 'question-ended' || session.questionIndex !== session.questionCount - 1) {
        fail('The final score is available after the last question ends.');
      }
      session.status = 'complete';
      session.finalScoreShown = true;
      session.message = 'All session questions are complete. End the round to bank these points.';
      return {};
    }),
    endSession: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      const session = room.session;
      if (!session) fail('There is no active session.');
      if (session.question) {
        clearTimer(session.question);
        if (session.question.submission) {
          recordSubmission(room, session.question.submission, 'Wrong', 0, 'Session ended before resolution.');
        }
      }
      const frozenScores = { blue: room.roundScores.blue, red: room.roundScores.red };
      if (session.completedQuestions > 0) {
        room.roundHistory.push({
          roundNumber: session.number,
          blue: frozenScores.blue,
          red: frozenScores.red,
          questionCount: session.completedQuestions,
          completedAt: new Date().toISOString()
        });
      }
      room.roundScores = { blue: 0, red: 0 };
      for (const id of session.playerIds) {
        const player = room.players.get(id);
        if (player) {
          player.team = null;
          room.playedPlayerIds.add(id);
        }
      }
      room.history.push({
        number: session.number,
        blue: frozenScores.blue,
        red: frozenScores.red,
        questions: session.completedQuestions,
        submissionLog: session.submissionLog
      });
      room.session = null;
      return {};
    }),
    removePlayer: ({ code, token, playerId }) => hostAction(socket, { code, token }, (room) => {
      const player = room.players.get(playerId);
      if (!player) fail('Player not found.');
      if (room.session?.playerIds.includes(playerId)) fail('End the session before removing its players.');
      if (player.connected) io.to(player.socketId).emit('playerRemoved', 'The host removed you from the room.');
      room.players.delete(playerId);
      room.playedPlayerIds.delete(playerId);
      return {};
    }),
    removeAllPlayedPlayers: ({ code, token }) => hostAction(socket, { code, token }, (room) => {
      if (room.session) fail('End the session before removing played players.');
      for (const playerId of room.playedPlayerIds) {
        const player = room.players.get(playerId);
        if (player?.connected) io.to(player.socketId).emit('playerRemoved', 'The host removed the played group from the room.');
        room.players.delete(playerId);
      }
      const removed = room.playedPlayerIds.size;
      room.playedPlayerIds.clear();
      return { removed };
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
      room.playedPlayerIds.clear();
      room.roundScores = { blue: 0, red: 0 };
      room.roundHistory = [];
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
  console.log(`Family Feud server is listening on port ${PORT}.`);
});