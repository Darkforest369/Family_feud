(() => {
  const socket = io();
  const $ = (selector) => document.querySelector(selector);
  const themeTitles = {
    default: 'Family Feud',
    christmas: 'Christmas Feud',
    easter: 'Easter Feud'
  };
  const themeNames = {
    default: 'Default',
    christmas: 'Christmas',
    easter: 'Easter'
  };
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const presentationKey = 'feudPresentationCode';
  const routeRoom = () => {
    const hashQuery = window.location.hash.includes('?')
      ? window.location.hash.slice(window.location.hash.indexOf('?') + 1)
      : '';
    return new URLSearchParams(window.location.search).get('room') ||
      new URLSearchParams(hashQuery).get('room') ||
      localStorage.getItem(presentationKey) || '';
  };
  let roomCode = routeRoom().trim().toUpperCase();
  if (roomCode) localStorage.setItem(presentationKey, roomCode);
  let publicBase = window.location.origin;
  let hasJoined = false;
  let renderedQuestionKey = '';
  let previousStrikes = { blue: 0, red: 0 };
  let previousAudioQuestionKey = '';
  let previousAudioStrikes = null;
  let previousAudioRevealed = null;
  let audioContext = null;

  function playTone(startFrequency, endFrequency, duration, waveform, delay = 0, volume = 0.16) {
    if (!audioContext || audioContext.state !== 'running') return;
    const startTime = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  function playCorrectSound() {
    playTone(660, 880, 0.22, 'sine', 0);
    playTone(880, 1175, 0.28, 'sine', 0.1, 0.12);
  }

  function playStrikeSound() {
    playTone(220, 95, 0.32, 'sawtooth', 0, 0.13);
  }

  function enableAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const button = $('#presentation-sound-enable');
    if (!AudioContext) {
      button.textContent = 'Audio is not supported in this browser';
      button.disabled = true;
      return;
    }
    try {
      audioContext ||= new AudioContext();
      audioContext.resume().then(() => {
        button.hidden = true;
      }).catch((error) => {
        console.error('Could not enable presentation audio.', error);
        button.textContent = 'Tap to enable presentation sounds';
      });
    } catch (error) {
      console.error('Could not initialize presentation audio.', error);
      button.textContent = 'Tap to enable presentation sounds';
    }
  }

  function playStateSounds(state, question) {
    const session = state.session;
    const questionKey = question && session
      ? `${session.number}:${session.questionIndex}`
      : '';
    const strikes = question
      ? {
        blue: Number(question.strikes?.blue) || 0,
        red: Number(question.strikes?.red) || 0
      }
      : null;
    const revealed = question?.answers?.map((answer) => Boolean(answer.revealed)) || null;
    if (questionKey !== previousAudioQuestionKey) {
      previousAudioQuestionKey = questionKey;
      previousAudioStrikes = strikes;
      previousAudioRevealed = revealed;
      return;
    }
    if (strikes && previousAudioStrikes &&
      (strikes.blue > previousAudioStrikes.blue || strikes.red > previousAudioStrikes.red)) {
      playStrikeSound();
    }
    if (question && revealed && previousAudioRevealed &&
      question.answers.some((answer, index) =>
        answer.revealed && !previousAudioRevealed[index] &&
        ['blue', 'red'].includes(answer.revealedBy)
      )) {
      playCorrectSound();
    }
    previousAudioStrikes = strikes;
    previousAudioRevealed = revealed;
  }

  function applyTheme(themeId) {
    const id = Object.hasOwn(themeTitles, themeId) ? themeId : 'default';
    document.documentElement.dataset.theme = id;
    document.title = themeTitles[id];
    document.querySelectorAll('[data-theme-title]').forEach((element) => {
      element.textContent = themeTitles[id];
    });
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim();
    return id;
  }

  function updateJoinInfo(code) {
    $('#presentation-room-code').textContent = code;
    const joinUrl = new URL('/', publicBase || window.location.origin);
    joinUrl.searchParams.set('room', code);
    $('#presentation-join-url').href = joinUrl.toString();
    $('#presentation-join-url').textContent = joinUrl.toString();
    $('#presentation-qr-image').src = `/qr.svg?url=${encodeURIComponent(joinUrl.toString())}`;
  }

  function showError(message) {
    const error = $('#presentation-error');
    error.textContent = message;
    error.hidden = !message;
  }

  function renderStrikes(question) {
    const strikes = question?.strikes || { blue: 0, red: 0 };
    const maxStrikes = question?.maxStrikes ?? 3;
    ['blue', 'red'].forEach((team) => {
      const count = Math.max(0, Math.min(maxStrikes, Number(strikes[team]) || 0));
      const element = $(`#presentation-${team}-strikes`);
      element.setAttribute('aria-label', `${team.toUpperCase()} team: ${count} of ${maxStrikes} strikes`);
      element.innerHTML = Array.from({ length: maxStrikes }, (_, index) => {
        const isStrike = index < count;
        const animate = isStrike && count > previousStrikes[team] && index === count - 1;
        return `<span class="${isStrike ? 'strike-on' : ''}${animate ? ' strike-arrive' : ''}" aria-hidden="true">${isStrike ? '×' : '○'}</span>`;
      }).join('');
      previousStrikes[team] = count;
    });
  }

  function renderTurn(question) {
    const isActive = Boolean(question && ['playing', 'steal'].includes(question.status));
    const activeTeam = question?.activeTeam;
    const activeTeamBanner = $('#presentation-active-team');

    document.querySelector('.score-blue').classList.toggle('is-active', isActive && activeTeam === 'blue');
    document.querySelector('.score-blue').classList.toggle('is-inactive', isActive && activeTeam !== 'blue');
    document.querySelector('.score-red').classList.toggle('is-active', isActive && activeTeam === 'red');
    document.querySelector('.score-red').classList.toggle('is-inactive', isActive && activeTeam !== 'red');

    activeTeamBanner.hidden = !isActive;
    activeTeamBanner.className = `presentation-active-team${isActive ? ` ${activeTeam}` : ''}${question?.status === 'steal' ? ' steal' : ''}`;
    activeTeamBanner.textContent = !isActive ? '' : question.status === 'steal'
      ? `STEAL ATTEMPT: ${activeTeam.toUpperCase()} TEAM`
      : `${activeTeam.toUpperCase()} TEAM IS ANSWERING`;
  }

  function render(state) {
    hasJoined = true;
    $('#presentation-reconnecting').hidden = true;
    showError('');
    roomCode = state.code;
    localStorage.setItem(presentationKey, roomCode);
    const themeId = applyTheme(state.themeId);
    $('#presentation-theme-name').textContent = themeNames[themeId];
    updateJoinInfo(roomCode);
    const scores = state.roundScores || { blue: 0, red: 0 };
    const questionNumber = state.session ? Number(state.session.questionIndex ?? 0) + 1 : 0;
    $('#presentation-blue-score').textContent = scores.blue;
    $('#presentation-red-score').textContent = scores.red;
    $('#presentation-question-number').textContent = questionNumber;

    const question = state.session?.question;
    playStateSounds(state, question);
    renderStrikes(question);
    renderTurn(question);

    if (state.session?.finalScoreShown) {
      $('#presentation-game').hidden = true;
      const finalScore = $('#presentation-final');
      finalScore.hidden = false;
      const winner = scores.blue === scores.red ? 'tie' : scores.blue > scores.red ? 'blue' : 'red';
      finalScore.className = `presentation-final${winner === 'tie' ? '' : ` ${winner}-wins`}`;
      $('#presentation-final-blue-score').textContent = scores.blue;
      $('#presentation-final-red-score').textContent = scores.red;
      $('#presentation-final-blue').classList.toggle('is-winner', winner === 'blue');
      $('#presentation-final-blue').classList.toggle('is-loser', winner === 'red');
      $('#presentation-final-red').classList.toggle('is-winner', winner === 'red');
      $('#presentation-final-red').classList.toggle('is-loser', winner === 'blue');
      return;
    }

    $('#presentation-final').hidden = true;
    $('#presentation-game').hidden = false;
    const questionText = question?.text || 'Waiting for the host to start a question';
    const questionKey = state.session
      ? `${state.session.number}:${state.session.questionIndex}`
      : '';
    const answerBoard = $('#presentation-answer-board');
    const isSameQuestion = renderedQuestionKey === questionKey;
    const previousRevealed = new Set(
      [...answerBoard.querySelectorAll('.presentation-answer-tile.revealed')]
        .map((tile) => tile.dataset.answerIndex)
    );
    $('#presentation-question').textContent = questionText;
    renderedQuestionKey = questionKey;
    const submissionBox = $('#presentation-submission');
    submissionBox.hidden = !question?.submission;
    submissionBox.className = `presentation-submission${question?.submission ? ` ${question.submission.team}` : ''}`;
    submissionBox.textContent = question?.submission
      ? `${question.submission.team.toUpperCase()} TEAM SUBMITTED: "${question.submission.text}"`
      : '';
    answerBoard.innerHTML = (question?.answers || []).map((answer, index) => {
      const ownerClass = answer.revealedBy === 'blue' ? 'blue'
        : answer.revealedBy === 'red' ? 'red'
          : 'unmatched';
      const animateReveal = answer.revealed && isSameQuestion && !previousRevealed.has(String(index));
      const classes = answer.revealed
        ? `answer-tile presentation-answer-tile revealed ${ownerClass}${animateReveal ? ' presentation-reveal-pending' : ''}`
        : 'answer-tile presentation-answer-tile';
      return `<div class="${classes}" data-answer-index="${index}">
        <span class="answer-index">${index + 1}</span>
        <div class="presentation-answer-flipper">
          <div class="presentation-answer-face">
            ${animateReveal || !answer.revealed
              ? '<span class="presentation-answer-placeholder" aria-label="Hidden answer">?</span>'
              : `<span class="answer-copy">${escape(answer.text)}</span><span class="answer-points">${answer.points}</span>`}
          </div>
        </div>
      </div>`;
    }).join('');

    answerBoard.querySelectorAll('.presentation-reveal-pending').forEach((tile) => {
      const flipper = tile.querySelector('.presentation-answer-flipper');
      const answer = question.answers[Number(tile.dataset.answerIndex)];
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) {
        flipper.innerHTML = `<div class="presentation-answer-face"><span class="answer-copy">${escape(answer.text)}</span><span class="answer-points">${answer.points}</span></div>`;
        tile.classList.remove('presentation-reveal-pending');
        return;
      }

      flipper.addEventListener('transitionend', (event) => {
        if (event.propertyName !== 'transform' || !tile.classList.contains('presentation-reveal-pending')) return;
        flipper.innerHTML = `<div class="presentation-answer-face"><span class="answer-copy">${escape(answer.text)}</span><span class="answer-points">${answer.points}</span></div>`;
        tile.classList.remove('presentation-reveal-pending');
        tile.classList.remove('presentation-reveal-turning');
      }, { once: true });
      requestAnimationFrame(() => tile.classList.add('presentation-reveal-turning'));
    });
  }

  function join() {
    if (!roomCode) {
      showError('Open this page with a room code, or join a room from the host page.');
      $('#presentation-reconnecting').hidden = true;
      return;
    }
    socket.emit('presentationJoin', { code: roomCode }, (result) => {
      if (!result?.ok) {
        hasJoined = false;
        $('#presentation-reconnecting').hidden = true;
        showError(result?.error || 'Could not join this room.');
        return;
      }
      if (result.state) render(result.state);
    });
  }

  fetch('/config')
    .then((response) => {
      if (!response.ok) throw new Error('Could not load public URL settings.');
      return response.json();
    })
    .then((config) => {
      if (config.publicUrl) publicBase = config.publicUrl;
      if (roomCode) updateJoinInfo(roomCode);
    })
    .catch((error) => console.error(error));

  socket.on('presentationState', render);
  socket.on('connect', () => {
    $('#presentation-reconnecting').hidden = false;
    join();
  });
  socket.on('disconnect', () => {
    $('#presentation-reconnecting').hidden = false;
  });
  socket.on('connect_error', () => {
    $('#presentation-reconnecting').hidden = false;
    if (!hasJoined) showError('Unable to connect. Retrying…');
  });
  if (!roomCode) showError('Open this page with a room code, or join a room from the host page.');
  $('#presentation-sound-enable').addEventListener('click', enableAudio);
})();
