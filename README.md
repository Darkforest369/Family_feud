# Christmas Family Feud

A local-network, multiplayer Family Feud-style game for a class party. The host runs the game on a laptop and projects `/host`; players join from phones using `/play` and the room code. There are no accounts, database, or frontend build steps. Room state and question edits live in server memory and reset when the server stops.

## Run locally

Requirements: Node.js 18 or newer and npm.

```sh
npm install
npm start
```

The host opens [http://localhost:3000/host](http://localhost:3000/host) and selects **Create a room**. The landing page is at [http://localhost:3000/](http://localhost:3000/). The default port is 3000; set `PORT` to use another port.

## Connect phones on the same network

1. Connect the host laptop and all phones to the same Wi-Fi network. A guest Wi-Fi or client-isolated network may prevent devices from reaching one another.
2. Find the laptop's local IPv4 address:
	- **Windows:** run `ipconfig` and look for the IPv4 Address under the active Wi-Fi adapter.
	- **macOS:** open System Settings → Wi-Fi → Details, or run `ipconfig getifaddr en0` in Terminal.
	- **Linux:** run `hostname -I` and use the address for the active Wi-Fi or Ethernet network (often the first address).
3. On each phone, open `http://LAPTOP-IP:3000/play`, for example `http://192.168.1.24:3000/play`.
4. The host displays a five-character room code. Players enter that code and a display name. If the page will not load, allow Node.js through the laptop firewall on the private network and confirm both devices are on the same Wi-Fi.

The host token is kept in that host browser's session storage. Keep the host tab open during play; refreshing it on the same browser reconnects to the room. Rooms are memory-only and disappear when the server process stops.

## Run class sessions

- The room accepts up to 30 players. At least four connected players are required to start a session.
- **Start session** selects the first even number of waiting players, up to 10. For 10 players it assigns five to Blue and five to Red in alternating join order. Odd players and players beyond the first 10 remain waiting. Before the first question, use **Swap team** to exchange a player with someone on the opposite team.
- **Start first question** begins the session. Blue starts question 1, then the starting team alternates. The default session uses three questions, or fewer if the room has fewer than three questions.
- Players may remove themselves from the room between sessions with **Leave room**. The host can also use **Remove** beside waiting players after a session. Then invite the next group and start another session in the same room. For 30 people, run three groups of 10.
- Completed question points are added to that session's Blue/Red score. **End session & bank points** adds the completed question totals to the room's cumulative Blue and Red scores, then returns that session's players to the waiting list. An unfinished question is discarded. Ending before any question is complete adds no points.
- Remove the previous group before inviting the next to keep the room roster clear. **Reset room** clears players, sessions, and scores, but keeps the room's edited questions. Cumulative scores remain until reset or the server stops.

## Host controls and rules

The host sees the full answer list; phones see only revealed answers. The active team has 60 seconds for each regular answer. Answers are compared after lowercasing, trimming, collapsing whitespace, and removing punctuation; matching is exact, with no synonym matching. A correct unrevealed answer reveals its points and keeps control. Wrong, repeated, or timed-out answers add a strike. On three strikes, the other team gets one 45-second steal attempt. A correct steal takes the question's accumulated points; a failed or timed-out steal leaves them with the original team. Revealing every answer ends the question and awards its points to the active team. The host can also add a strike, pass control to a steal, clear a submission, or type and resolve an answer for a disconnected team.

The host can click **Question editor** between sessions to add, edit, delete, and reorder questions and answers. Each question needs at least two unique answers with positive integer points. The built-in Christmas question bank is ready to play. **Export JSON** downloads the current bank; **Import JSON** loads a question array into the editor, and **Save questions** applies it to the room. Question edits apply only to that room and remain in server memory until shutdown.

## Deploy for a class party

### A. Render

1. In Render, choose **New → Web Service → connect repo**.
2. Select the **Node** runtime.
3. Set the build command to `npm install` and the start command to `npm start`.
4. Deploy, then share the service's **HTTPS URL** with the class. Share the public HTTPS address, never a LAN IP.

The free tier sleeps after about 15 minutes idle and can take about 50 seconds to wake. Open the URL about 10 minutes before the party so it is awake when classmates arrive.

### B. Cloudflare Tunnel (no account)

Start the app with `npm install && npm start`, then run:

```sh
cloudflared tunnel --url http://localhost:3000
```

Share the printed `https://*.trycloudflare.com` URL. The URL changes each time the tunnel restarts.

### C. ngrok

Start the app with `npm install && npm start`, then run:

```sh
ngrok http 3000
```

Share the printed HTTPS URL. On the free tier, each classmate must click the **Visit Site** interstitial once. The URL changes each time ngrok restarts.

### Public URL and health check

The app builds its join link and QR code from the current public origin. If a proxy rewrites the request origin, set `PUBLIC_URL` to the public base URL (for example, `https://party.example.com`) so the displayed link and QR code use the externally reachable address. `GET /healthz` returns `200` with `{ "ok": true }` for deployment warm-up and health checks.

| Problem | Check |
|---|---|
| players can't connect | Confirm the URL is HTTPS and public, not a LAN address such as 192.168.x.x. |
| connects then drops | The tunnel may be dead or Render may be asleep. |
| Socket.IO 400 / websocket error | Check for a hardcoded `ws://` URL or missing proxy trust configuration. |