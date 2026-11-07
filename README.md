# Christmas Family Feud

A multiplayer Christmas Family Feud-style game for a class party. The host opens the game on a tablet or computer and projects the host screen; players join from their phones using the room code or QR link. There are no accounts or database. Room state and question edits live in server memory and reset when the service restarts.

## Deploy on Render (no terminal needed)

1. Make sure the latest code is pushed to GitHub.
2. Sign in to Render at [dashboard.render.com](https://dashboard.render.com) using GitHub.
3. Click **New → Web Service** and connect this repository.
4. Render should detect Node.js. Confirm **Build Command** is `npm install`, **Start Command** is `npm start`, and **Plan** is **Free**.
5. Click **Create Web Service** and wait for the first deploy to finish.
6. Copy the service URL in the form `https://<your-service>.onrender.com`. This is the game URL.
7. Open that URL on the host tablet or computer, select **Host a Game**, and create a room. Share the room code or displayed QR link with players.

## Free tier warning

Render free web services spin down after 15 minutes of inactivity and can take about 1 minute to wake. For a class party, open the game URL 5–10 minutes before starting. Optionally, use a free uptime pinger such as UptimeRobot to request `/healthz` every 14 minutes during the party to keep the service awake.

## Run class sessions

- The room accepts up to 30 players. At least four connected players are required to start a session.
- **Start session** selects the first even number of waiting players, up to 10. For 10 players it assigns five to Blue and five to Red in alternating join order. Odd players and players beyond the first 10 remain waiting. Before the first question, use **Swap team** to exchange a player with someone on the opposite team.
- **Start first question** begins the session. Blue starts question 1, then the starting team alternates. The default session uses three questions, or fewer if the room has fewer than three questions.
- Players may remove themselves from the room between sessions with **Leave room**. The host can also use **Remove** beside waiting players after a session. Then invite the next group and start another session in the same room. For 30 people, run three groups of 10.
- Completed question points are added to that session's Blue/Red score. **End session & bank points** adds the completed question totals to the room's cumulative Blue and Red scores, then returns that session's players to the waiting list. An unfinished question is discarded. Ending before any question is complete adds no points.
- Remove the previous group before inviting the next to keep the room roster clear. **Reset room** clears players, sessions, and scores, but keeps the room's edited questions. Cumulative scores remain until reset or the service restarts.

To play alone, select **Enable Testing Mode (Solo Play)** before creating the room. Testing Mode lets the host start with fewer than four waiting players; if no players are connected, it adds temporary simulated Blue and Red players. During an active turn, use **Simulate Answer** to submit for the active team. The answer remains pending exactly like a phone submission until the host clicks an answer tile or adds a strike.

## Host controls and rules

The host sees the full answer list; phones see only revealed answers. There are no timers: the host controls the pace. Every player submission stays pending for host judgment, including exact matches. The host clicks an unrevealed answer tile to award its points, or adds a strike; on three strikes, the other team gets one steal attempt and the host can fail it with the same strike control. A correct steal takes the question's accumulated points; a failed steal leaves them with the original team. Revealing every answer ends the question and awards its points to the active team. The host can also pass control to a steal or type and resolve an answer for a disconnected team.

The host can click **Question editor** between sessions to add, edit, delete, and reorder questions and answers. Each question needs at least two unique answers with positive integer points. The built-in Christmas question bank is ready to play. **Export JSON** downloads the current bank; **Import JSON** loads a question array into the editor, and **Save questions** applies it to the room. Question edits apply only to that room and remain in server memory until the service restarts.

## Troubleshooting

| Problem | Check |
|---|---|
| Players get 401 or cannot connect | Confirm they are using the Render HTTPS URL, not a local-network address or `localhost`. |
| Service is slow to load after a break | It may have spun down; wait about 1 minute for it to wake, or use an uptime pinger. |
| Socket.IO connection error | Confirm Socket.IO is using the page's origin and that Express proxy trust is enabled. |

## Current round and presentation behavior

These notes supersede the older fixed question-count, score-banking, and typed-answer instructions above. Each round plays every question in the current room question bank. Round scores start at zero and do not carry into later rounds; ending a round records its score in round history and resets the live score. During play, the host reveals answers by clicking tiles. All player submissions remain pending for the host to judge with a tile click or strike, regardless of whether the input exactly matches an answer.

Open `/presentation?room=CODE` in a second window for a read-only projector view, or use **Open presentation** from the host room. The view mirrors question reveals and round scoring, and shows the final score after the host selects **Show Final Score**.
