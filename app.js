const tracks = Array.isArray(window.TRACKS) ? window.TRACKS : [];
const siteMeta = window.MUSIC_VAULT_META || {};

const state = {
  query: "",
  tag: "all",
  sort: "title",
  view: localStorage.getItem("musicVault:view") || "grid",
  currentId: localStorage.getItem("musicVault:currentId") || null,
};

const $ = (selector) => document.querySelector(selector);
const template = $("#trackCardTemplate");
const trackGrid = $("#trackGrid");
const audio = $("#audioPlayer");

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

function allTags() {
  return [...new Set(tracks.flatMap((track) => track.tags || []))].sort((a, b) => a.localeCompare(b));
}

function lyricsToText(lyrics) {
  if (Array.isArray(lyrics)) return lyrics.join("\n");
  return String(lyrics || "");
}

function isoDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
}

function absoluteUrl(path) {
  if (!path) return undefined;
  return new URL(path, location.href).href;
}

function matches(track) {
  const haystack = [track.title, track.artist, track.album, track.description, lyricsToText(track.lyrics), ...(track.tags || []), ...(track.genres || [])]
    .map(normalize)
    .join(" ");
  const queryOk = haystack.includes(normalize(state.query));
  const tagOk = state.tag === "all" || (track.tags || []).includes(state.tag);
  return queryOk && tagOk;
}

function sorted(list) {
  return [...list].sort((a, b) => {
    if (state.sort === "artist") return `${a.artist} ${a.title}`.localeCompare(`${b.artist} ${b.title}`);
    if (state.sort === "newest") return String(b.date || "").localeCompare(String(a.date || ""));
    if (state.sort === "duration") return (b.duration || 0) - (a.duration || 0);
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function filteredTracks() {
  return sorted(tracks.filter(matches));
}

function setStats(list) {
  $("#trackCount").textContent = `${tracks.length} tracks`;
  const total = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
  $("#totalDuration").textContent = formatDuration(total);
  $("#resultLabel").textContent = `${list.length}件表示`;
}

function renderTags() {
  const tagList = $("#tagList");
  tagList.replaceChildren();

  ["all", ...allTags()].forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tag${state.tag === tag ? " active" : ""}`;
    button.textContent = tag === "all" ? "All" : `#${tag}`;
    button.addEventListener("click", () => {
      state.tag = tag;
      render();
    });
    tagList.append(button);
  });
}

function trackCover(track) {
  return track.cover || "assets/covers/default.svg";
}

function renderTracks() {
  const list = filteredTracks();
  trackGrid.className = `track-grid${state.view === "list" ? " list" : ""}`;
  trackGrid.replaceChildren();

  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "該当する曲がありません。検索条件を減らしてください。人類は条件を増やしすぎる。";
    trackGrid.append(empty);
    setStats(list);
    return;
  }

  list.forEach((track) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = track.id;
    node.classList.toggle("playing", track.id === state.currentId);
    node.querySelector(".cover").src = trackCover(track);
    node.querySelector(".cover").alt = `${track.title} cover`;
    node.querySelector("h3").textContent = track.title || "Untitled";
    node.querySelector(".artist").textContent = track.artist || "Unknown Artist";
    node.querySelector(".description").textContent = track.description || "";
    node.querySelector(".duration").textContent = formatDuration(track.duration);
    node.querySelector(".date").textContent = track.date || "";
    node.querySelector(".schema-url").content = absoluteUrl(track.path) || "";
    node.querySelector(".schema-duration").content = isoDuration(track.duration) || "";
    node.querySelector(".schema-album").content = track.album || "";
    node.querySelector(".schema-date").content = track.date || "";

    const tagBox = node.querySelector(".tags");
    (track.tags || []).forEach((tag) => {
      const span = document.createElement("span");
      span.textContent = `#${tag}`;
      tagBox.append(span);
    });

    node.querySelector(".play-hitarea").addEventListener("click", () => playTrack(track.id));
    trackGrid.append(node);
  });

  setStats(list);
}

function setCurrent(track) {
  if (!track) return;
  state.currentId = track.id;
  localStorage.setItem("musicVault:currentId", track.id);

  $("#currentCover").src = trackCover(track);
  $("#nowPlayingLabel").textContent = "Now playing";
  $("#currentTitle").textContent = track.title || "Untitled";
  $("#currentMeta").textContent = `${track.artist || "Unknown Artist"}${track.album ? ` / ${track.album}` : ""}`;

  if (audio.src !== new URL(track.path, location.href).href) {
    audio.src = track.path;
  }

  renderLyrics(track);
  updateDocumentSchema(track);
}

function renderLyrics(track) {
  const panel = $("#lyricsPanel");
  const text = $("#lyricsText");
  const lyrics = lyricsToText(track.lyrics).trim();

  if (!lyrics) {
    panel.hidden = true;
    text.textContent = "";
    return;
  }

  text.textContent = lyrics;
  panel.hidden = false;
}

function buildTrackSchema(track) {
  const schema = {
    "@type": "MusicRecording",
    "@id": `${location.href.split("#")[0]}#track-${track.id}`,
    name: track.title || "Untitled",
    byArtist: {
      "@type": "MusicGroup",
      name: track.artist || "Unknown Artist"
    },
    url: absoluteUrl(track.path),
    image: absoluteUrl(trackCover(track)),
    duration: isoDuration(track.duration),
    datePublished: track.date || undefined,
    inAlbum: track.album ? { "@type": "MusicAlbum", name: track.album } : undefined,
    genre: track.genres || track.tags || undefined,
    description: track.description || undefined,
    audio: track.path ? {
      "@type": "AudioObject",
      contentUrl: absoluteUrl(track.path),
      encodingFormat: track.path.split(".").pop() || undefined
    } : undefined,
    lyrics: track.lyricsUrl ? {
      "@type": "CreativeWork",
      url: absoluteUrl(track.lyricsUrl)
    } : (lyricsToText(track.lyrics).trim() ? {
      "@type": "CreativeWork",
      text: lyricsToText(track.lyrics).trim()
    } : undefined)
  };

  Object.keys(schema).forEach((key) => schema[key] === undefined && delete schema[key]);
  return schema;
}

function updateDocumentSchema(currentTrack) {
  const script = $("#schemaOrgJsonLd");
  if (!script) return;

  const baseUrl = siteMeta.url || location.href.split("#")[0];
  const playlist = {
    "@context": "https://schema.org",
    "@type": "MusicPlaylist",
    name: siteMeta.name || document.title || "Music Vault",
    description: siteMeta.description || document.querySelector('meta[name="description"]')?.content,
    url: baseUrl,
    inLanguage: siteMeta.language || document.documentElement.lang || "ja",
    creator: siteMeta.creator ? { "@type": "Person", name: siteMeta.creator } : undefined,
    numTracks: tracks.length,
    track: tracks.map(buildTrackSchema),
    mainEntity: currentTrack ? buildTrackSchema(currentTrack) : undefined
  };

  Object.keys(playlist).forEach((key) => playlist[key] === undefined && delete playlist[key]);
  script.textContent = JSON.stringify(playlist, null, 2);
}

function playTrack(id) {
  const track = tracks.find((item) => item.id === id);
  if (!track) return;
  setCurrent(track);
  audio.play().catch(() => {
    // ブラウザの自動再生制限。クリック起点なら通常は通る。
  });
  renderTracks();
}

function playNext() {
  const list = filteredTracks();
  if (list.length === 0) return;
  const index = list.findIndex((track) => track.id === state.currentId);
  const next = list[(index + 1) % list.length];
  playTrack(next.id);
}

function shuffle() {
  const list = filteredTracks();
  if (list.length === 0) return;
  const pool = list.filter((track) => track.id !== state.currentId);
  const target = pool[Math.floor(Math.random() * pool.length)] || list[0];
  playTrack(target.id);
}

function renderViewButtons() {
  $("#gridViewBtn").classList.toggle("active", state.view === "grid");
  $("#listViewBtn").classList.toggle("active", state.view === "list");
}

function render() {
  renderTags();
  renderViewButtons();
  renderTracks();
}

$("#searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderTracks();
});

$("#sortSelect").addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderTracks();
});

$("#gridViewBtn").addEventListener("click", () => {
  state.view = "grid";
  localStorage.setItem("musicVault:view", state.view);
  render();
});

$("#listViewBtn").addEventListener("click", () => {
  state.view = "list";
  localStorage.setItem("musicVault:view", state.view);
  render();
});

$("#shuffleBtn").addEventListener("click", shuffle);
$("#copyLyricsBtn").addEventListener("click", async () => {
  const button = $("#copyLyricsBtn");
  const text = $("#lyricsText").textContent;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  button.textContent = "Copied";
  setTimeout(() => {
    button.textContent = "Copy";
  }, 900);
});
audio.addEventListener("ended", playNext);

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, select, textarea")) return;
  if (event.key === " ") {
    event.preventDefault();
    if (audio.src) audio.paused ? audio.play() : audio.pause();
  }
  if (event.key.toLowerCase() === "s") shuffle();
});

const initialTrack = tracks.find((track) => track.id === state.currentId) || tracks[0];
if (initialTrack) setCurrent(initialTrack);
else updateDocumentSchema(null);
render();
