/*
 * Offline cache for this game. The version is the manifest version, so a bump
 * retires the previous cache. GitHub Pages serves this file from the repo root.
 */
const PREFIX = "seclusa-munch-";
const SHELL = [
    "./assets/fonts/dm-sans-latin-400-normal.woff2",
    "./assets/fonts/dm-sans-latin-600-normal.woff2",
    "./assets/fonts/dm-sans-latin-700-normal.woff2",
    "./assets/fonts/sora-latin-600-normal.woff2",
    "./assets/fonts/sora-latin-700-normal.woff2",
    "./assets/fonts/sora-latin-800-normal.woff2",
    "./icon/favicon.png",
    "./icon/icon-192.png",
    "./icon/icon-512.png",
    "./icon/ios_icon.png",
    "./index.html",
    "./js/actor.js",
    "./js/audio.js",
    "./js/config.js",
    "./js/direction.js",
    "./js/elroy.js",
    "./js/energizer.js",
    "./js/fruit.js",
    "./js/game.js",
    "./js/ghost.js",
    "./js/ghostCommander.js",
    "./js/ghostReleaser.js",
    "./js/input.js",
    "./js/main.js",
    "./js/maze.js",
    "./js/mazes.js",
    "./js/pellet.js",
    "./js/player.js",
    "./js/renderer.js",
    "./js/sprites.js",
    "./js/states.js",
    "./js/storage.js",
    "./manifest.json",
    "./mono.css",
    "./offline.html",
    "./seclusa-base.css",
    "./sounds/eating-fruit.mp3",
    "./sounds/eating-ghost.mp3",
    "./sounds/eating.mp3",
    "./sounds/extend.mp3",
    "./sounds/ghost-normal-move.mp3",
    "./sounds/ghost-return-to-home.mp3",
    "./sounds/ghost-turn-to-blue.mp3",
    "./sounds/miss.mp3",
    "./sounds/start-music.mp3",
    "./stand-help.js",
    "./stand.css",
    "./stand.js",
    "./theme-boot.js",
    "./theme.css",
    "./theme.js"
];

let resolved = null;

function resolveCache() {{
    if (resolved) return Promise.resolve(resolved);
    return fetch(new URL("./manifest.json", self.location), {{ cache: "no-store" }})
        .then((res) => res.json())
        .then((data) => {{
            resolved = PREFIX + "v" + data.version;
            return resolved;
        }})
        .catch(() => caches.keys().then((keys) => {{
            resolved = keys.find((key) => key.indexOf(PREFIX) === 0) || (PREFIX + "v0");
            return resolved;
        }}));
}}

self.addEventListener("install", (event) => {{
    event.waitUntil(resolveCache().then((name) => caches.open(name).then((cache) => cache.addAll(SHELL))));
}});

self.addEventListener("activate", (event) => {{
    event.waitUntil(resolveCache().then((name) => caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key.indexOf(PREFIX) === 0 && key !== name).map((key) => caches.delete(key))
    ))));
}});

self.addEventListener("fetch", (event) => {{
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    event.respondWith(resolveCache().then((name) => caches.open(name).then((cache) => fetch(req).then((res) => {{
        if (res && res.ok) cache.put(req, res.clone());
        return res;
    }}).catch(() => cache.match(req).then((hit) => hit || cache.match("./offline.html"))))));
}});
