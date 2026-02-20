// GridIron Live Extension Popup

const ESPN_LOGO_URL = 'https://a.espncdn.com/i/teamlogos/nfl/500/';

document.addEventListener('DOMContentLoaded', async () => {
  const { siteUrl, cronSecret } = await chrome.storage.sync.get(['siteUrl', 'cronSecret']);
  const baseUrl = siteUrl ? siteUrl.replace(/\/$/, '') : '';

  // ── Status dot ────────────────────────────────────
  const statusDot = document.getElementById('status-dot');
  if (baseUrl && cronSecret) {
    statusDot.classList.add('connected');
  }

  // ── Footer links ──────────────────────────────────
  document.getElementById('link-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('link-site').addEventListener('click', (e) => {
    e.preventDefault();
    if (baseUrl) {
      chrome.tabs.create({ url: baseUrl });
    } else {
      chrome.runtime.openOptionsPage();
    }
  });

  // ── Last ping info ────────────────────────────────
  const { lastPing, lastAction, lastError } = await chrome.storage.local.get([
    'lastPing', 'lastAction', 'lastError',
  ]);

  document.getElementById('last-ping').textContent = lastPing
    ? formatTimeAgo(new Date(lastPing))
    : '—';
  document.getElementById('last-action').textContent = lastAction ?? '—';

  if (lastError) {
    document.getElementById('last-error-row').style.display = 'flex';
    document.getElementById('last-error').textContent = lastError;
  }

  // ── Fetch current game ────────────────────────────
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/api/game/current`);
      if (res.ok) {
        const data = await res.json();
        if (data.currentGame) {
          showCurrentGame(data);
        }
        // Show season info
        if (data.seasonNumber) {
          document.getElementById('season-text').textContent =
            `Season ${data.seasonNumber} — Week ${data.currentWeek} (${data.seasonStatus?.replace(/_/g, ' ') ?? 'unknown'})`;
          const totalWeeks = 22;
          const pct = Math.min(100, Math.round((data.currentWeek / totalWeeks) * 100));
          document.getElementById('season-progress').style.width = `${pct}%`;
        }
      }
    } catch { /* ignore */ }
  }

  // ── Simulate Now button ───────────────────────────
  document.getElementById('btn-simulate').addEventListener('click', async () => {
    const btn = document.getElementById('btn-simulate');
    btn.textContent = 'Simulating...';
    btn.disabled = true;

    try {
      const res = await fetch(`${baseUrl}/api/simulate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json().catch(() => ({}));
      btn.textContent = data.action ?? 'Done!';

      await chrome.storage.local.set({
        lastPing: new Date().toISOString(),
        lastAction: data.action ?? 'manual',
        lastError: res.ok ? null : `HTTP ${res.status}`,
      });

      setTimeout(() => {
        btn.textContent = 'Simulate Now';
        btn.disabled = false;
      }, 2000);
    } catch (err) {
      btn.textContent = 'Error';
      setTimeout(() => {
        btn.textContent = 'Simulate Now';
        btn.disabled = false;
      }, 2000);
    }
  });

  // ── Jumbotron controls ────────────────────────────
  document.getElementById('btn-jumbotron-send').addEventListener('click', async () => {
    const message = document.getElementById('jumbotron-text').value.trim();
    const type = document.getElementById('jumbotron-type').value;
    const duration = parseInt(document.getElementById('jumbotron-duration').value, 10) || 30;

    if (!message) return;

    const btn = document.getElementById('btn-jumbotron-send');
    btn.textContent = 'Sending...';

    try {
      const res = await fetch(`${baseUrl}/api/admin/jumbotron`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, type, durationSeconds: duration }),
      });

      if (res.ok) {
        btn.textContent = 'Sent!';
        document.getElementById('jumbotron-text').value = '';
      } else {
        btn.textContent = 'Failed';
      }
    } catch {
      btn.textContent = 'Error';
    }

    setTimeout(() => { btn.textContent = 'Send'; }, 2000);
  });

  document.getElementById('btn-jumbotron-clear').addEventListener('click', async () => {
    const btn = document.getElementById('btn-jumbotron-clear');
    btn.textContent = 'Clearing...';

    try {
      await fetch(`${baseUrl}/api/admin/jumbotron`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${cronSecret}` },
      });
      btn.textContent = 'Cleared!';
    } catch {
      btn.textContent = 'Error';
    }

    setTimeout(() => { btn.textContent = 'Clear All'; }, 2000);
  });
});

// ── Helpers ─────────────────────────────────────────

function showCurrentGame(data) {
  const game = data.currentGame;
  if (!game) return;

  const section = document.getElementById('current-game');
  section.style.display = 'block';

  const awayAbbr = game.awayTeam?.abbreviation ?? '???';
  const homeAbbr = game.homeTeam?.abbreviation ?? '???';

  document.getElementById('away-logo').src = `${ESPN_LOGO_URL}${awayAbbr.toLowerCase()}.png`;
  document.getElementById('home-logo').src = `${ESPN_LOGO_URL}${homeAbbr.toLowerCase()}.png`;
  document.getElementById('away-abbr').textContent = awayAbbr;
  document.getElementById('home-abbr').textContent = homeAbbr;
  document.getElementById('away-score').textContent = game.awayScore ?? 0;
  document.getElementById('home-score').textContent = game.homeScore ?? 0;

  const statusEl = document.getElementById('game-status');
  if (game.status === 'broadcasting') {
    statusEl.textContent = 'LIVE';
    statusEl.style.color = '#ef4444';
  } else if (game.status === 'completed') {
    statusEl.textContent = 'FINAL';
    statusEl.style.color = 'rgba(255,255,255,0.4)';
  } else {
    statusEl.textContent = game.status?.toUpperCase() ?? '';
  }
}

function formatTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return date.toLocaleDateString();
}
