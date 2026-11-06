/*
 * Menu for a standalone Seclusa game.
 *
 * The collection launcher used to own Theme, Sound, How to play, About and
 * Fullscreen. This file is that menu for one game. Copy text comes from
 * stand-help.js (window.STAND_COPY). Preferences stay on the same ssc. keys
 * the games already read, and a storage event is dispatched in this document
 * so a game that only listens for other-tab writes still hears the change.
 */
(function () {
    "use strict";

    var copy = window.STAND_COPY || {};
    var KEY_SOUND = "ssc.pref_key_sound_enabled";
    var KEY_NIGHT = "ssc.pref_key_night_mode";
    var KEY_COLOR = "ssc.pref_key_theme_color";
    var NIGHTS = ["system", "light", "dark"];
    var PALETTES = [
        "orange", "green", "blue", "purple",
        "rose", "teal", "amber", "slate",
        "navy", "indigo", "lime", "crimson"
    ];
    var settingsButton = null;
    var cacheState = "pending";

    function read(key, fallback) {
        try {
            var value = localStorage.getItem(key);
            return value === null ? fallback : value;
        } catch (err) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (err) {
            return;
        }
        try {
            window.dispatchEvent(new StorageEvent("storage", {
                key: key,
                newValue: value,
                storageArea: localStorage
            }));
        } catch (err) {
            /* older browsers */
        }
        if (window.SeclusaGameTheme && typeof window.SeclusaGameTheme.apply === "function") {
            window.SeclusaGameTheme.apply();
        }
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function choice(label, pressed, onClick) {
        var button = el("button", null, label);
        button.type = "button";
        button.setAttribute("aria-pressed", pressed ? "true" : "false");
        button.addEventListener("click", onClick);
        return button;
    }

    var sheet = null;
    var scrim = null;

    function close() {
        var returnFocus = sheet && sheet.contains(document.activeElement);
        if (sheet) sheet.remove();
        if (scrim) scrim.remove();
        sheet = null;
        scrim = null;
        if (returnFocus && settingsButton) settingsButton.focus();
    }

    function open() {
        if (sheet) {
            close();
            return;
        }
        scrim = el("div", "stand-scrim");
        scrim.addEventListener("click", close);
        sheet = el("div", "stand-sheet");
        sheet.setAttribute("role", "dialog");
        sheet.setAttribute("aria-modal", "true");
        sheet.setAttribute("aria-label", "App settings");

        var closeBtn = el("button", "stand-close", "Close");
        closeBtn.type = "button";
        closeBtn.addEventListener("click", close);
        sheet.appendChild(closeBtn);

        sheet.appendChild(el("h2", null, "Sounds"));
        var soundOn = read(KEY_SOUND, "true") !== "false";
        var soundRow = el("div", "stand-row");
        soundRow.appendChild(choice(soundOn ? "Sounds on" : "Sounds off", soundOn, function () {
            write(KEY_SOUND, soundOn ? "false" : "true");
            close();
            open();
        }));
        sheet.appendChild(soundRow);

        sheet.appendChild(el("h2", null, "Theme"));
        var night = read(KEY_NIGHT, "system");
        var nightRow = el("div", "stand-row");
        NIGHTS.forEach(function (mode) {
            var label = mode.charAt(0).toUpperCase() + mode.slice(1);
            nightRow.appendChild(choice(label, night === mode, function () {
                write(KEY_NIGHT, mode);
                close();
                open();
            }));
        });
        sheet.appendChild(nightRow);

        sheet.appendChild(el("h2", null, "Color"));
        var palette = read(KEY_COLOR, "navy");
        var paletteRow = el("div", "stand-row");
        PALETTES.forEach(function (name) {
            var label = name.charAt(0).toUpperCase() + name.slice(1);
            paletteRow.appendChild(choice(label, palette === name, function () {
                write(KEY_COLOR, name);
                close();
                open();
            }));
        });
        sheet.appendChild(paletteRow);

        sheet.appendChild(el("h2", null, "Saved score"));
        var scoreRow = el("div", "stand-row");
        var clearBtn = choice("Clear saved score", false, function () {
            if (clearBtn.getAttribute("aria-pressed") !== "true") {
                clearBtn.textContent = "Confirm clear";
                clearBtn.setAttribute("aria-pressed", "true");
                return;
            }
            var game = window.munchGame;
            if (game && game.scores && typeof game.scores.clear === "function") {
                game.scores.clear();
                game.highScore = 0;
            }
            close();
        });
        scoreRow.appendChild(clearBtn);
        sheet.appendChild(scoreRow);

        if (cacheState === "failed") {
            sheet.appendChild(el("p", null, "Offline copy unavailable. The game still runs while this page is open."));
        }

        sheet.appendChild(el("h2", null, "How to play"));
        (copy.rules || []).forEach(function (line) {
            sheet.appendChild(el("p", null, line));
        });

        sheet.appendChild(el("h2", null, "About"));
        (copy.about || []).forEach(function (line) {
            sheet.appendChild(el("p", null, line));
        });

        sheet.appendChild(el("h2", null, "Fullscreen"));
        var full = el("div", "stand-row");
        var fullOn = !!(document.fullscreenElement || document.webkitFullscreenElement);
        full.appendChild(choice(fullOn ? "Fullscreen on" : "Fullscreen off", fullOn, function () {
            var node = document.documentElement;
            var active = document.fullscreenElement || document.webkitFullscreenElement;
            var done = active
                ? (document.exitFullscreen || document.webkitExitFullscreen)
                : (node.requestFullscreen || node.webkitRequestFullscreen);
            if (done) {
                Promise.resolve(done.call(active ? document : node)).catch(function () {});
            }
            close();
        }));
        sheet.appendChild(full);

        document.body.appendChild(scrim);
        document.body.appendChild(sheet);
        closeBtn.focus();
    }

    function boot() {
        var button = el("button", "stand-more", "App settings");
        settingsButton = button;
        button.type = "button";
        button.setAttribute("aria-label", "App settings");
        if (copy.corner) button.setAttribute("data-corner", copy.corner);
        button.addEventListener("click", open);
        document.body.appendChild(button);
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") close();
        });
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("./sw.js").then(function () {
                cacheState = "ready";
            }, function () {
                cacheState = "failed";
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
