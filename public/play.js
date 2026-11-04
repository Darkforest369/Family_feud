(() => {
  const socket = io();
  const $ = (selector) => document.querySelector(selector);
  const connection = $('#player-connection');
  let state = null;
  let timerInterval = null;
  let joining = false;

  function showError(text) {
    const target = $('#player-view').hidden ? $('#join-error') : $('#player-notice');
    target.textContent = text;
    target.hidden = !text;
  }

  function join(code, name, playerId = '') {
    if (joining) return;
    joining = true;
    if (!socket.connected) socket.connect();
    socket.emit('joinRoom', { code, name, playerId }, (result) => {
      joining = false;
      if (!result?.ok) {
        showError(result?.error || 'Could not join this room.');
        return;
      }
      sessionStorage.setItem('feudPlayerCode', result.code);
      sessionStorage.setItem('feudPlayerId', result.playerId);
      sessionStorage.setItem('feudPlayerName', name);
      $('#join-panel').hidden = true;
      $('#player-view').hidden = false;
      if (result.duplicateName) showError('Another player is using that name. You can still join; your team assignments stay separate.');
      else showError('');
      render(result.state);
    });
  }

  function render(nextState) {
    state = nextState;
    $('#join-panel').hidden = true;
    $('#player-view').hidden = false;
    $('#player-room-code').textContent = `ROOM ${state.code}`;
    $('#waiting-name').textContent = `Hi, ${state.player.name}.`;
    $('#waiting-blue').textContent = state.totals.blue;
    $('#waiting-red').textContent = state.totals.red;
    $('#game-blue').textContent = state.totals.blue;
    $('#game-red').textContent = state.totals.red;

    const question = state.session?.question;
    const assigned = Boolean(state.player.team);
    const inSession = assigned && state.session?.teams?.[state.player.team]?.includes(state.player.id);
    const shouldWait = !state.session || !inSession || !question;
    $('#player-waiting').hidden = !shouldWait;
    $('#player-game').hidden = shouldWait;
    const waitingMessage = !state.session
      ? 'Waiting for the host to start'
      : state.session.status === 'complete'
        ? 'Session complete. Waiting for the host to finish.'
        : inSession && state.session.status === 'ready'
          ? 'Teams are set. The host will start the first question.'
          : 'Session in progress. Waiting for the next group.';
    $('.waiting-message').textContent = waitingMessage;
    const waitingTeam = $('#waiting-team');
    waitingTeam.hidden = !assigned;
    waitingTeam.className = `waiting-team ${state.player.team || ''}`;
    waitingTeam.textContent = assigned ? `${state.player.team.toUpperCase()} TEAM` : '';
    if (shouldWait) {
      if (timerInterval) clearInterval(timerInterval);
      return;
    }

    $('#team-badge').className = `team-badge ${state.player.team}`;
    $('#team-badge').textContent = `${state.player.team.toUpperCase()} TEAM`;
    $('#player-session-label').textContent = `SESSION ${state.session.number} · QUESTION ${state.session.questionIndex + 1} OF ${state.session.questionCount}`;
    $('#player-question').textContent = question.text;
    const isActive = question.activeTeam === state.player.team && ['playing', 'steal'].includes(question.status);
    const hasSubmission = question.submissionReceived;
    const status = $('#player-turn-status');
    status.className = 'player-turn-status';
    if (question.status === 'ended') {
      status.textContent = 'Question complete. All answers are now revealed.';
      status.classList.add('inactive');
    } else if (question.status === 'steal' && isActive) {
      status.textContent = hasSubmission ? 'Steal answer submitted. The host is resolving it.' : 'Your team has the steal: discuss and submit one answer.';
      status.classList.add('steal');
    } else if (isActive) {
      status.textContent = hasSubmission ? 'Answer submitted. Your team is locked in.' : 'Your team is active — discuss and submit one answer.';
    } else {
      status.textContent = question.status === 'steal' ? 'The other team is making its steal attempt.' : `${question.activeTeam.toUpperCase()} team is answering. Discuss together.`;
      status.classList.add('inactive');
    }
    const answerBoard = $('#player-answer-board');
    answerBoard.innerHTML = question.board.map((answer, index) => `<div class="answer-tile ${answer.revealed ? 'revealed' : ''}"><span class="answer-index">${String(index + 1).padStart(2, '0')}</span>${answer.revealed ? `<span class="answer-copy">${Feud.escape(answer.text)}</span><span class="answer-points">${answer.points}</span>` : '<span class="answer-hidden"></span><span class="answer-points">• • •</span>'}</div>`).join('');
    const canSubmit = isActive && !hasSubmission;
    $('#answer-form').hidden = !canSubmit;
    $('#answer-locked').hidden = !(isActive && hasSubmission && question.status !== 'ended');
    const result = $('#player-result');
    result.hidden = !question.result;
    if (question.result) {
      const strikes = question.strikes[state.player.team] || 0;
      result.textContent = `${question.result} ${strikes} strike${strikes === 1 ? '' : 's'} for your team. Question points: ${question.accumulated}.`;
    }
    Feud.countdown(question.deadline, $('#player-timer'));
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => Feud.countdown(question.deadline, $('#player-timer')), 250);
  }

  $('#join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const code = $('#room-input').value.trim().toUpperCase();
    const name = $('#name-input').value.trim().slice(0, 20);
    showError('');
    join(code, name);
  });
  $('#room-input').addEventListener('input', (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  });
  $('#answer-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const answer = $('#answer-input').value.trim();
    if (!answer) return;
    const button = $('#answer-form button');
    button.disabled = true;
    socket.emit('submitAnswer', { answer }, (result) => {
      button.disabled = false;
      if (!result?.ok) {
        showError(result?.error || 'Answer could not be submitted.');
      } else {
        $('#answer-input').value = '';
        showError('');
      }
    });
  });
  $('#leave-room').addEventListener('click', () => {
    if (state) socket.emit('leaveRoom', {}, () => {});
    ['feudPlayerCode', 'feudPlayerId', 'feudPlayerName'].forEach((key) => sessionStorage.removeItem(key));
    state = null;
    $('#player-view').hidden = true;
    $('#join-panel').hidden = false;
    showError('');
  });

  socket.on('connect', () => {
    Feud.setConnection(connection, true);
    const code = sessionStorage.getItem('feudPlayerCode');
    const playerId = sessionStorage.getItem('feudPlayerId');
    const name = sessionStorage.getItem('feudPlayerName');
    if (code && playerId && name) join(code, name, playerId);
  });
  socket.on('disconnect', () => Feud.setConnection(connection, false));
  socket.on('playerState', render);
  socket.on('playerRemoved', (message) => {
    ['feudPlayerCode', 'feudPlayerId', 'feudPlayerName'].forEach((key) => sessionStorage.removeItem(key));
    state = null;
    $('#player-view').hidden = true;
    $('#join-panel').hidden = false;
    showError(message);
  });
  socket.on('connect_error', () => Feud.setConnection(connection, false));
})();