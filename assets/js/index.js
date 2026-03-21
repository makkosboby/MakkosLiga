(() => {
  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");

  if (menuBtn && mobileMenu) {
    const closeMenu = () => {
      mobileMenu.hidden = true;
      menuBtn.setAttribute("aria-expanded", "false");
    };

    const toggleMenu = () => {
      const willOpen = mobileMenu.hidden;
      mobileMenu.hidden = !willOpen;
      menuBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    };

    menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleMenu();
    });

    mobileMenu.addEventListener("click", (event) => event.stopPropagation());
    mobileMenu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
    window.addEventListener("resize", closeMenu);
  }
})();

const supabaseUrl = "https://kqtzyhmksnjowielrwii.supabase.co";
const supabaseKey = "sb_publishable_vgSmqItheOG3aeOdoNionA_rd-4MTL2";

function isSupabaseReady() {
  return Boolean(window.supabase?.createClient);
}

const supabaseClient = isSupabaseReady()
  ? window.supabase.createClient(supabaseUrl, supabaseKey)
  : null;

const seasonSelect = document.getElementById("seasonSelect");
const tbody = document.getElementById("tbody");
const playerCard = document.getElementById("playerCard");
const playerHint = document.getElementById("playerHint");
const playerContent = document.getElementById("playerContent");
const playerStatsBtn = document.getElementById("playerStatsBtn");
const playerRelationsBtn = document.getElementById("playerRelationsBtn");

const roundSelect = document.getElementById("roundSelect");
const prevRoundBtn = document.getElementById("prevRoundBtn");
const nextRoundBtn = document.getElementById("nextRoundBtn");
const matchesMeta = document.getElementById("matchesMeta");
const matchesList = document.getElementById("matchesList");
const newsWall = document.getElementById("newsWall");

const state = {
  seasons: [],
  selectedSeasonId: null,
  selectedSeasonYear: null,
  selectedPlayerId: null,
  playerCardView: "stats",
  allSeasonMatches: [],
  availableRounds: [],
  selectedRound: null,
  cachedAllMatches: [],
  cachedAllMatchPlayers: [],
  cachedAllPlayers: [],
  cachedSeasonStatsBySeasonId: new Map(),
  matchPlayersByMatchId: new Map(),
  matchPlayersByPlayerId: new Map(),
  matchNamesByMatchId: new Map(),
  playerNameById: new Map(),
  statsBundleCache: new Map(),
  playerProfileCache: new Map(),
  playerFormCache: new Map(),
  cacheDataVersion: 0,
  realtime: {
    seasons: null,
    seasonStats: null,
    matches: null,
    matchPlayers: null,
    announcements: null
  },
  timers: {
    table: null,
    matches: null,
    player: null
  }
};

function schedule(key, fn, delay = 250) {
  if (state.timers[key]) clearTimeout(state.timers[key]);
  state.timers[key] = setTimeout(fn, delay);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatRecord(stat) {
  if (!stat) return "—";
  return `${stat.wins} Gy / ${stat.draws} D / ${stat.losses} V`;
}

function compareBestTeammate(a, b) {
  const aPpm = a.matches ? a.points / a.matches : -1;
  const bPpm = b.matches ? b.points / b.matches : -1;
  if (bPpm !== aPpm) return bPpm - aPpm;
  const aGd = a.matches ? a.goalDiff / a.matches : -999;
  const bGd = b.matches ? b.goalDiff / b.matches : -999;
  if (bGd !== aGd) return bGd - aGd;
  if (b.wins !== a.wins) return b.wins - a.wins;
  return b.matches - a.matches;
}

function compareWorstOpponent(a, b) {
  const aPpm = a.matches ? a.points / a.matches : 999;
  const bPpm = b.matches ? b.points / b.matches : 999;
  if (aPpm !== bPpm) return aPpm - bPpm;
  const aGd = a.matches ? a.goalDiff / a.matches : 999;
  const bGd = b.matches ? b.goalDiff / b.matches : 999;
  if (aGd !== bGd) return aGd - bGd;
  if (b.losses !== a.losses) return b.losses - a.losses;
  return b.matches - a.matches;
}

function createEmptyPlayerStats(player) {
  return {
    playerId: player.id,
    name: player.name,
    matches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
    blackCount: 0,
    whiteCount: 0,
    teammates: new Map(),
    opponents: new Map()
  };
}

function getResultFromTeam(team, blackScore, whiteScore) {
  if (blackScore === whiteScore) return "draw";
  const isBlackWin = blackScore > whiteScore;
  if ((team === "black" && isBlackWin) || (team === "white" && !isBlackWin)) {
    return "win";
  }
  return "loss";
}

function addPairStat(targetMap, otherId, otherName, outcome, goalsFor, goalsAgainst) {
  if (!targetMap.has(otherId)) {
    targetMap.set(otherId, {
      playerId: otherId,
      name: otherName,
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0
    });
  }

  const item = targetMap.get(otherId);
  item.matches += 1;
  item.goalsFor += goalsFor;
  item.goalsAgainst += goalsAgainst;
  item.goalDiff = item.goalsFor - item.goalsAgainst;

  if (outcome === "win") {
    item.wins += 1;
    item.points += 3;
  } else if (outcome === "draw") {
    item.draws += 1;
    item.points += 1;
  } else {
    item.losses += 1;
  }
}

function clearStatsCaches() {
  state.statsBundleCache.clear();
  state.playerProfileCache.clear();
  state.playerFormCache.clear();
  state.cacheDataVersion += 1;
}

function getBundleCacheKey(seasonId) {
  return seasonId == null ? "overall" : `season:${seasonId}`;
}

function buildDataIndexes() {
  state.playerNameById = new Map(state.cachedAllPlayers.map((player) => [player.id, player.name]));
  state.matchPlayersByMatchId = new Map();
  state.matchPlayersByPlayerId = new Map();
  state.matchNamesByMatchId = new Map();

  for (const mp of state.cachedAllMatchPlayers) {
    if (!state.matchPlayersByMatchId.has(mp.match_id)) {
      state.matchPlayersByMatchId.set(mp.match_id, []);
    }
    state.matchPlayersByMatchId.get(mp.match_id).push(mp);

    if (!state.matchPlayersByPlayerId.has(mp.player_id)) {
      state.matchPlayersByPlayerId.set(mp.player_id, []);
    }
    state.matchPlayersByPlayerId.get(mp.player_id).push(mp);
  }

  for (const [matchId, rows] of state.matchPlayersByMatchId.entries()) {
    const blackNames = [];
    const whiteNames = [];

    for (const row of rows) {
      const name = row.tabella?.name || state.playerNameById.get(row.player_id);
      if (!name) continue;
      if (row.team === "black") blackNames.push(name);
      else if (row.team === "white") whiteNames.push(name);
    }

    state.matchNamesByMatchId.set(matchId, {
      black: blackNames.join(", "),
      white: whiteNames.join(", ")
    });
  }
}

function getStatsBundleCached(seasonId = null) {
  const key = getBundleCacheKey(seasonId);
  if (!state.statsBundleCache.has(key)) {
    state.statsBundleCache.set(
      key,
      getFilteredStatsBundle(
        state.cachedAllMatches,
        state.cachedAllMatchPlayers,
        state.cachedAllPlayers,
        seasonId
      )
    );
  }
  return state.statsBundleCache.get(key);
}

function getPlayerProfileCached(seasonId, playerId) {
  const bundleKey = getBundleCacheKey(seasonId);
  const cacheKey = `${state.cacheDataVersion}|${bundleKey}|${playerId}`;
  if (state.playerProfileCache.has(cacheKey)) {
    return state.playerProfileCache.get(cacheKey);
  }

  const bundle = getStatsBundleCached(seasonId);
  const stats = bundle.playerStatsMap.get(playerId) || null;
  if (!stats) {
    state.playerProfileCache.set(cacheKey, null);
    return null;
  }

  const favoriteTeammate = [...stats.teammates.values()].sort(compareBestTeammate)[0] || null;
  const toughestOpponent = [...stats.opponents.values()].sort(compareWorstOpponent)[0] || null;
  const profile = { stats, favoriteTeammate, toughestOpponent };
  state.playerProfileCache.set(cacheKey, profile);
  return profile;
}

function getPlayerRecentFormCached(playerId) {
  const cacheKey = `${state.cacheDataVersion}|overall|${playerId}`;
  if (state.playerFormCache.has(cacheKey)) {
    return state.playerFormCache.get(cacheKey);
  }

  const matchById = new Map(state.cachedAllMatches.map((match) => [match.id, match]));
  const recentRows = [...(state.matchPlayersByPlayerId.get(playerId) || [])]
    .sort((a, b) => {
      const matchA = matchById.get(a.match_id);
      const matchB = matchById.get(b.match_id);
      return new Date(matchB?.created_at || 0) - new Date(matchA?.created_at || 0);
    })
    .slice(0, 5);

  const form = recentRows
    .map((row) => {
      const match = matchById.get(row.match_id);
      if (!match) return null;
      const result = getResultFromTeam(row.team, match.black_score, match.white_score);
      if (result === "draw") return { code: "D", cls: "draw", title: "Döntetlen" };
      return result === "win"
        ? { code: "W", cls: "win", title: "Győzelem" }
        : { code: "L", cls: "loss", title: "Vereség" };
    })
    .filter(Boolean);

  state.playerFormCache.set(cacheKey, form);
  return form;
}

function getFilteredStatsBundle(matches, matchPlayers, players, seasonId = null) {
  const filteredMatches = seasonId
    ? matches.filter((match) => String(match.season_id) === String(seasonId))
    : [...matches];

  const matchIds = new Set(filteredMatches.map((match) => match.id));
  const filteredMP = matchPlayers.filter((mp) => matchIds.has(mp.match_id));
  const playerStatsMap = new Map(players.map((player) => [player.id, createEmptyPlayerStats(player)]));
  const playersById = new Map(players.map((player) => [player.id, player]));
  const matchPlayersByMatch = new Map();

  for (const mp of filteredMP) {
    if (!matchPlayersByMatch.has(mp.match_id)) matchPlayersByMatch.set(mp.match_id, []);
    matchPlayersByMatch.get(mp.match_id).push(mp);
  }

  const pairMap = new Map();
  const h2hMap = new Map();

  for (const match of filteredMatches) {
    const participants = matchPlayersByMatch.get(match.id) || [];
    const blackPlayers = [];
    const whitePlayers = [];

    for (const participant of participants) {
      if (participant.team === "black") blackPlayers.push(participant);
      else if (participant.team === "white") whitePlayers.push(participant);
    }

    for (const mp of participants) {
      const stats = playerStatsMap.get(mp.player_id);
      if (!stats) continue;

      const goalsFor = mp.team === "black" ? match.black_score : match.white_score;
      const goalsAgainst = mp.team === "black" ? match.white_score : match.black_score;
      const result = getResultFromTeam(mp.team, match.black_score, match.white_score);
      const teammates = mp.team === "black" ? blackPlayers : whitePlayers;
      const opponents = mp.team === "black" ? whitePlayers : blackPlayers;

      stats.matches += 1;
      stats.goalsFor += goalsFor;
      stats.goalsAgainst += goalsAgainst;
      stats.goalDiff = stats.goalsFor - stats.goalsAgainst;
      if (mp.team === "black") stats.blackCount += 1;
      if (mp.team === "white") stats.whiteCount += 1;

      if (result === "win") {
        stats.wins += 1;
        stats.points += 3;
      } else if (result === "draw") {
        stats.draws += 1;
        stats.points += 1;
      } else {
        stats.losses += 1;
      }

      for (const teammate of teammates) {
        if (teammate.player_id === mp.player_id) continue;
        const teammateName = teammate.tabella?.name || playersById.get(teammate.player_id)?.name || "Ismeretlen";
        addPairStat(stats.teammates, teammate.player_id, teammateName, result, goalsFor, goalsAgainst);

        const ids = [mp.player_id, teammate.player_id].sort();
        const key = ids.join("|");
        if (!pairMap.has(key)) {
          pairMap.set(key, {
            playerAId: ids[0],
            playerBId: ids[1],
            playerAName: playersById.get(ids[0])?.name || "—",
            playerBName: playersById.get(ids[1])?.name || "—",
            matches: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDiff: 0,
            points: 0
          });
        }
        const pair = pairMap.get(key);
        if (mp.player_id === ids[0]) {
          pair.matches += 0.5;
          pair.goalsFor += goalsFor / 2;
          pair.goalsAgainst += goalsAgainst / 2;
          pair.goalDiff = pair.goalsFor - pair.goalsAgainst;
          if (result === "win") {
            pair.wins += 0.5;
            pair.points += 1.5;
          } else if (result === "draw") {
            pair.draws += 0.5;
            pair.points += 0.5;
          } else {
            pair.losses += 0.5;
          }
        }
      }

      for (const opponent of opponents) {
        const opponentName = opponent.tabella?.name || playersById.get(opponent.player_id)?.name || "Ismeretlen";
        addPairStat(stats.opponents, opponent.player_id, opponentName, result, goalsFor, goalsAgainst);

        const ids = [mp.player_id, opponent.player_id].sort();
        const key = ids.join("|");
        if (!h2hMap.has(key)) {
          h2hMap.set(key, {
            playerAId: ids[0],
            playerBId: ids[1],
            playerAName: playersById.get(ids[0])?.name || "—",
            playerBName: playersById.get(ids[1])?.name || "—",
            matches: 0,
            draws: 0,
            playerAWins: 0,
            playerBWins: 0,
            playerAGoalsFor: 0,
            playerBGoalsFor: 0,
            playerAPoints: 0,
            playerBPoints: 0
          });
        }
        const item = h2hMap.get(key);
        const isA = mp.player_id === ids[0];
        if (isA) {
          item.matches += 1;
          item.playerAGoalsFor += goalsFor;
          item.playerBGoalsFor += goalsAgainst;
          if (result === "win") {
            item.playerAWins += 1;
            item.playerAPoints += 3;
          } else if (result === "draw") {
            item.draws += 1;
            item.playerAPoints += 1;
            item.playerBPoints += 1;
          } else {
            item.playerBWins += 1;
            item.playerBPoints += 3;
          }
        }
      }
    }
  }

  const cleanedPairList = [...pairMap.values()].map((pair) => ({
    ...pair,
    matches: Math.round(pair.matches),
    wins: Math.round(pair.wins),
    draws: Math.round(pair.draws),
    losses: Math.round(pair.losses),
    goalsFor: Math.round(pair.goalsFor),
    goalsAgainst: Math.round(pair.goalsAgainst),
    goalDiff: Math.round(pair.goalDiff),
    points: Math.round(pair.points)
  }));

  return {
    matches: filteredMatches,
    matchPlayers: filteredMP,
    playerStatsMap,
    playerStatsList: [...playerStatsMap.values()],
    pairList: cleanedPairList,
    h2hMap
  };
}

function setPlayerContentHeight() {
  playerContent.style.maxHeight = `${playerContent.scrollHeight}px`;
}

function openPlayerCardIfNeeded() {
  if (!playerCard.classList.contains("is-open")) {
    playerCard.classList.add("is-open");
  }
}

function updatePlayerSwitchUi() {
  playerStatsBtn?.classList.toggle("active", state.playerCardView === "stats");
  playerRelationsBtn?.classList.toggle("active", state.playerCardView === "relations");
}

function setPlayerCardView(view) {
  state.playerCardView = view;
  updatePlayerSwitchUi();
  if (state.selectedPlayerId) {
    void loadPlayerCard(state.selectedPlayerId);
  }
}

function stopRealtime() {
  if (!supabaseClient) return;

  Object.values(state.realtime).forEach((channel) => {
    if (channel) supabaseClient.removeChannel(channel);
  });

  state.realtime = {
    seasons: null,
    seasonStats: null,
    matches: null,
    matchPlayers: null,
    announcements: null
  };
}

function startRealtime() {
  if (!supabaseClient) return;
  stopRealtime();

  state.realtime.seasons = supabaseClient
    .channel("public:seasons-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "seasons" }, async () => {
      const previousSeasonId = state.selectedSeasonId;
      await loadSeasons();
      await loadBaseStatsData();
      await loadTable();
      loadMatches();
      if (state.selectedPlayerId) await loadPlayerCard(state.selectedPlayerId);
      if (previousSeasonId !== state.selectedSeasonId) setTimeout(startRealtime, 150);
    })
    .subscribe();

  state.realtime.seasonStats = supabaseClient
    .channel("public:season-stats-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "season_stats" }, (payload) => {
      const seasonId = payload?.new?.season_id || payload?.old?.season_id;
      if (seasonId && String(seasonId) === String(state.selectedSeasonId)) {
        schedule("table", () => loadTable(true), 200);
      }
    })
    .subscribe();

  state.realtime.matches = supabaseClient
    .channel("public:matches-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, (payload) => {
      const seasonId = payload?.new?.season_id || payload?.old?.season_id;
      if (seasonId && String(seasonId) === String(state.selectedSeasonId)) {
        schedule("matches", async () => {
          await loadBaseStatsData();
          await loadTable(true);
          loadMatches();
          if (state.selectedPlayerId) await loadPlayerCard(state.selectedPlayerId);
        }, 250);
      }
    })
    .subscribe();

  state.realtime.matchPlayers = supabaseClient
    .channel("public:match-players-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "match_players" }, () => {
      schedule("matches", async () => {
        await loadBaseStatsData();
        await loadTable(true);
        loadMatches();
        if (state.selectedPlayerId) await loadPlayerCard(state.selectedPlayerId);
      }, 300);
    })
    .subscribe();

  state.realtime.announcements = supabaseClient
    .channel("public:announcements-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => {
      void loadAnnouncementPublic();
    })
    .subscribe();
}

async function loadBaseStatsData() {
  const [{ data: players, error: playersErr }, { data: matches, error: matchesErr }, { data: matchPlayers, error: mpErr }] = await Promise.all([
    supabaseClient.from("tabella").select("id,name").order("name", { ascending: true }),
    supabaseClient
      .from("matches")
      .select("id,season_id,round,black_score,white_score,created_at")
      .order("created_at", { ascending: false }),
    supabaseClient.from("match_players").select("match_id,player_id,team,tabella(name)")
  ]);

  if (playersErr) console.error(playersErr);
  if (matchesErr) console.error(matchesErr);
  if (mpErr) console.error(mpErr);

  state.cachedAllPlayers = players || [];
  state.cachedAllMatches = matches || [];
  state.cachedAllMatchPlayers = matchPlayers || [];
  buildDataIndexes();
  clearStatsCaches();
}

async function loadAnnouncementPublic() {
  if (!newsWall) return;

  const { data, error } = await supabaseClient
    .from("announcements")
    .select("id, body, is_pinned, updated_at, created_at")
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error(error);
    newsWall.innerHTML = '<div class="news-empty">❌ Üzenőfal hiba</div>';
    return;
  }

  const row = (data || [])[0];
  if (!row) {
    newsWall.innerHTML = '<div class="news-empty">Nincs friss hír.</div>';
    return;
  }

  newsWall.innerHTML = `
    <div class="news-title">
      <img class="news-icon" src="assets/img/info.png" alt="Info">
      <span class="news-meta">${new Date(row.updated_at || row.created_at).toLocaleString("hu-HU")}</span>
    </div>
    <div class="news-body">${escapeHtml(row.body)}</div>
  `;
}

async function loadSeasons() {
  const { data, error } = await supabaseClient
    .from("seasons")
    .select("id,year,is_current")
    .order("year", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  state.seasons = data || [];
  seasonSelect.innerHTML = "";

  for (const season of state.seasons) {
    const option = document.createElement("option");
    option.value = String(season.id);
    option.textContent = `${season.year}${season.is_current ? " (aktuális)" : ""}`;
    seasonSelect.appendChild(option);
  }

  const current = state.seasons.find((season) => season.is_current) || state.seasons[0];
  if (current) {
    state.selectedSeasonId = String(current.id);
    state.selectedSeasonYear = current.year;
    seasonSelect.value = String(current.id);
  }
}

function renderTableRows(rows) {
  const fragment = document.createDocumentFragment();

  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    const name = row.tabella?.name ?? "";
    tr.innerHTML = `
      <td data-label="">${index + 1}</td>
      <td class="name" data-label="Név">
        <button class="link" data-player-id="${row.player_id}">${escapeHtml(name)}</button>
      </td>
      <td data-label="M">${row.matches}</td>
      <td data-label="Gy">${row.wins}</td>
      <td data-label="D">${row.draws}</td>
      <td data-label="V">${row.losses}</td>
      <td data-label="LG">${row.goals_for}</td>
      <td data-label="KG">${row.goals_against}</td>
      <td data-label="GK">${row.goal_diff}</td>
      <td data-label="P"><b>${row.points}</b></td>
    `;
    tr.classList.add("updated");
    fragment.appendChild(tr);
  });

  tbody.replaceChildren(fragment);
}

async function loadTable(forceRefresh = false) {
  const seasonKey = String(state.selectedSeasonId);
  const cachedRows = state.cachedSeasonStatsBySeasonId.get(seasonKey);

  if (!forceRefresh && cachedRows) {
    renderTableRows(cachedRows);
    return cachedRows;
  }

  const { data, error } = await supabaseClient
    .from("season_stats")
    .select("season_id,player_id,matches,wins,draws,losses,goals_for,goals_against,goal_diff,points,tabella(name)")
    .eq("season_id", state.selectedSeasonId)
    .order("points", { ascending: false })
    .order("goal_diff", { ascending: false })
    .order("matches", { ascending: false })
    .order("goals_for", { ascending: false })
    .order("goals_against", { ascending: true });

  if (error) {
    console.error(error);
    return [];
  }

  const rows = data || [];
  state.cachedSeasonStatsBySeasonId.set(seasonKey, rows);
  renderTableRows(rows);
  return rows;
}

async function loadPlayerCard(playerId) {
  state.selectedPlayerId = playerId;
  const firstOpen = !playerCard.classList.contains("is-open");

  if (playerHint) playerHint.style.display = "none";
  openPlayerCardIfNeeded();

  if (!firstOpen) playerContent.classList.add("is-fading");

  playerContent.innerHTML = '<div class="muted">Betöltés…</div>';
  requestAnimationFrame(setPlayerContentHeight);

  const overallProfile = getPlayerProfileCached(null, playerId);
  const seasonProfile = getPlayerProfileCached(state.selectedSeasonId, playerId);

  if (!overallProfile?.stats) {
    playerContent.innerHTML = '<div class="muted">Nincs elérhető adat erről a játékosról.</div>';
    requestAnimationFrame(setPlayerContentHeight);
    playerContent.classList.remove("is-fading");
    return;
  }

  const { stats } = overallProfile;
  const form = getPlayerRecentFormCached(playerId);
  const formHtml = form.length
    ? `<div class="form">${form.map((item) => `<span class="form-badge ${item.cls}" title="${item.title}">${item.code}</span>`).join("")}</div>`
    : '<div class="form-empty">Még nincs elég meccs a formához.</div>';

  const seasonTeammate = seasonProfile?.favoriteTeammate;
  const seasonOpponent = seasonProfile?.toughestOpponent;
  const overallTeammate = overallProfile.favoriteTeammate;
  const overallOpponent = overallProfile.toughestOpponent;

  const headerHtml = `
    <div class="player-card-heading">
      <div class="player-card-name">${escapeHtml(stats.name)}</div>
      <div class="pill">${state.playerCardView === "relations" ? "kapcsolati statisztika" : "összesített statisztika"}</div>
    </div>
  `;

  const statsViewHtml = `
    ${headerHtml}
    <div class="kv">
      <div>Meccsek</div><div><b>${stats.matches}</b></div>
      <div>⚫ Fekete</div><div><b>${stats.blackCount}</b></div>
      <div>⚪ Fehér</div><div><b>${stats.whiteCount}</b></div>
      <div>Lőtt gól</div><div><b>${stats.goalsFor}</b></div>
      <div>Kapott gól</div><div><b>${stats.goalsAgainst}</b></div>
      <div>Győzelem</div><div><b>${stats.wins}</b></div>
      <div>Döntetlen</div><div><b>${stats.draws}</b></div>
      <div>Vereség</div><div><b>${stats.losses}</b></div>
    </div>
    <div class="form-row">
      <div class="form-title">
        <b>Forma</b>
        <span class="muted">utolsó 5 meccs</span>
      </div>
      ${formHtml}
    </div>
  `;

  const relationsViewHtml = `
    ${headerHtml}
    <div class="form-row relation-block first-relation-block">
      <div class="form-title"><b>Best Match</b></div>
      <div class="kv">
        <div>Örökmérleg</div><div><b>${overallTeammate ? escapeHtml(overallTeammate.name) : "—"}</b></div>
        <div>Mérleg</div><div><b>${overallTeammate ? formatRecord(overallTeammate) : "—"}</b></div>
        <div>Aktuális idény</div><div><b>${seasonTeammate ? escapeHtml(seasonTeammate.name) : "—"}</b></div>
        <div>Mérleg</div><div><b>${seasonTeammate ? formatRecord(seasonTeammate) : "—"}</b></div>
      </div>
    </div>
    <div class="form-row relation-block">
      <div class="form-title"><b>Mumus</b></div>
      <div class="kv">
        <div>Örökmérleg</div><div><b>${overallOpponent ? escapeHtml(overallOpponent.name) : "—"}</b></div>
        <div>Mérleg</div><div><b>${overallOpponent ? formatRecord(overallOpponent) : "—"}</b></div>
        <div>Aktuális idény</div><div><b>${seasonOpponent ? escapeHtml(seasonOpponent.name) : "—"}</b></div>
        <div>Mérleg</div><div><b>${seasonOpponent ? formatRecord(seasonOpponent) : "—"}</b></div>
      </div>
    </div>
  `;

  playerContent.innerHTML = state.playerCardView === "relations" ? relationsViewHtml : statsViewHtml;
  requestAnimationFrame(() => {
    setPlayerContentHeight();
    playerContent.classList.remove("is-fading");
  });
}

function loadMatches() {
  state.allSeasonMatches = state.cachedAllMatches
    .filter((match) => String(match.season_id) === String(state.selectedSeasonId))
    .sort((a, b) => {
      if ((b.round ?? 0) !== (a.round ?? 0)) return (b.round ?? 0) - (a.round ?? 0);
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

  matchesMeta.textContent = `${state.allSeasonMatches.length} összesen`;
  state.availableRounds = [...new Set(state.allSeasonMatches.map((match) => match.round))].sort((a, b) => b - a);

  roundSelect.innerHTML = "";
  for (const round of state.availableRounds) {
    const option = document.createElement("option");
    option.value = String(round);
    option.textContent = `${round}. forduló`;
    roundSelect.appendChild(option);
  }

  state.selectedRound = state.availableRounds[0] ?? null;
  if (state.selectedRound !== null) {
    roundSelect.value = String(state.selectedRound);
  }

  if (!state.allSeasonMatches.length) {
    matchesList.innerHTML = '<div class="muted">Ebben a szezonban még nincs meccs.</div>';
    return;
  }

  renderRound();
}

function renderRound() {
  matchesList.innerHTML = "";
  if (state.selectedRound === null) return;

  const fragment = document.createDocumentFragment();
  const matches = state.allSeasonMatches.filter((match) => Number(match.round) === Number(state.selectedRound));

  for (const match of matches) {
    const names = state.matchNamesByMatchId.get(match.id) || { black: "", white: "" };
    const div = document.createElement("div");
    div.className = "match";
    div.innerHTML = `
      <div class="match-top">
        <div class="score">⚫ ${match.black_score} – ${match.white_score} ⚪</div>
      </div>
      <div class="teams"><span>⚫</span> ${escapeHtml(names.black || "—")}</div>
      <div class="teams"><span>⚪</span> ${escapeHtml(names.white || "—")}</div>
    `;
    fragment.appendChild(div);
  }

  matchesList.replaceChildren(fragment);

  const index = state.availableRounds.indexOf(Number(state.selectedRound));
  prevRoundBtn.disabled = index === state.availableRounds.length - 1;
  nextRoundBtn.disabled = index === 0;
}

roundSelect.addEventListener("change", () => {
  state.selectedRound = Number(roundSelect.value);
  renderRound();
});

prevRoundBtn.addEventListener("click", () => {
  const index = state.availableRounds.indexOf(Number(state.selectedRound));
  if (index < state.availableRounds.length - 1) {
    state.selectedRound = state.availableRounds[index + 1];
    roundSelect.value = String(state.selectedRound);
    renderRound();
  }
});

nextRoundBtn.addEventListener("click", () => {
  const index = state.availableRounds.indexOf(Number(state.selectedRound));
  if (index > 0) {
    state.selectedRound = state.availableRounds[index - 1];
    roundSelect.value = String(state.selectedRound);
    renderRound();
  }
});

playerStatsBtn?.addEventListener("click", () => setPlayerCardView("stats"));
playerRelationsBtn?.addEventListener("click", () => setPlayerCardView("relations"));
updatePlayerSwitchUi();

tbody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-player-id]");
  if (!button) return;
  void loadPlayerCard(button.dataset.playerId);
});

seasonSelect.addEventListener("change", async () => {
  state.selectedSeasonId = String(seasonSelect.value);
  const selectedSeason = state.seasons.find((item) => String(item.id) === String(state.selectedSeasonId));
  state.selectedSeasonYear = selectedSeason ? selectedSeason.year : null;

  await loadTable();
  loadMatches();
  if (state.selectedPlayerId) await loadPlayerCard(state.selectedPlayerId);
  startRealtime();
});

(async () => {
  if (!supabaseClient) {
    console.error("A Supabase kliens nem töltődött be.");
    if (newsWall) {
      newsWall.innerHTML = '<div class="news-empty">Az adatkapcsolat most nem elérhető. Frissítsd az oldalt később újra.</div>';
    }
    return;
  }

  await loadSeasons();
  await loadBaseStatsData();
  await loadTable();
  loadMatches();
  await loadAnnouncementPublic();
  startRealtime();
})();
