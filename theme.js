/*
 * Seclusa Games shell for Seclusa Munch.
 *
 * Owns everything that lives outside the canvas: the header bar, the appearance
 * dialog and the about dialog. The theme itself is CSS — this file only writes the
 * `data-palette` / `data-theme` attributes on <html> and persists the choice.
 *
 * Settings live in the same localStorage namespace as the Solitaire PWA
 * (`ssc.` + the Android preference key names), so both games pick up the same palette,
 * night mode and sound setting.
 */

(function () {
    "use strict";

    var PREF_PREFIX = "ssc.";
    var KEY_THEME_COLOR = PREF_PREFIX + "pref_key_theme_color";
    var KEY_NIGHT_MODE = PREF_PREFIX + "pref_key_night_mode";
    var KEY_SOUND_ENABLED = PREF_PREFIX + "pref_key_sound_enabled";
    var KEY_FIRE_HAND = PREF_PREFIX + "munch-fire-hand";
    /*
     * Older builds stored D-pad side as `ssc.munch-pad-side` / `ssc.pacman-pad-side`.
     * There is no pad now, but the same left/right meaning applies to the FIRE button,
     * so those values are read once as a fallback when the new key is unset.
     */

    /* Must match theme.js and theme-game.js. Pacman carries its own copy of this
       list rather than sharing the launcher's, so the two drift unless edited
       together — see the note in theme-game.js. */
    var DEFAULT_THEME_COLOR = "navy";
    var DEFAULT_NIGHT_MODE = "system";
    var PALETTES = [
        "orange", "green", "blue", "purple",
        "rose", "teal", "amber", "slate",
        "navy", "indigo", "lime", "crimson"
    ];
    var NIGHT_MODES = ["system", "light", "dark"];

    var root = document.documentElement;

    // ------------------------------------------------------------- preferences

    var readPref = function (key, fallback) {
        try {
            var value = window.localStorage.getItem(key);
            return value === null ? fallback : value;
        } catch (err) {
            return fallback;
        }
    };

    var writePref = function (key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (err) {
            /* storage unavailable (private browsing) — the choice just does not persist */
        }
    };

    var prefersDark = function () {
        return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    };

    var resolveIsDark = function (nightMode) {
        if (nightMode == "dark") return true;
        if (nightMode == "light") return false;
        return prefersDark();
    };

    var applyTheme = function (palette, nightMode) {
        if (PALETTES.indexOf(palette) < 0) palette = DEFAULT_THEME_COLOR;
        if (NIGHT_MODES.indexOf(nightMode) < 0) nightMode = DEFAULT_NIGHT_MODE;

        var dark = resolveIsDark(nightMode);
        root.setAttribute("data-palette", palette);
        root.setAttribute("data-theme", dark ? "dark" : "light");

        // Read the active palette's anchor rather than a fixed green literal, so the
        // browser chrome matches whatever palette is in force. See theme.js.
        var themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (themeColorMeta) {
            var anchor = window.getComputedStyle(root)
                .getPropertyValue("--theme-game-select-background").trim();
            themeColorMeta.setAttribute("content", anchor || "#0d2340");
        }
    };

    // -------------------------------------------------------------- menu peek

    /*
     * The score/lives/fruit rows are drawn at the very top and bottom of the canvas, so
     * the chrome slides away after a few idle seconds — the same menu-peek behaviour the
     * Solitaire menu bar has. Pointer movement, or a tap on the top or bottom strip,
     * brings it back.
     */
    var IDLE_DELAY = 3000;
    var WAKE_STRIP = 64;

    // Queried lazily: theme.js is parsed from <head>, before the shell markup exists.
    var shell = function () {
        return document.querySelector(".shell");
    };

    var idleTimer = null;

    var wake = function () {
        var element = shell();
        if (!element) return;
        element.classList.remove("is-idle");
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(function () {
            var current = shell();
            if (current) current.classList.add("is-idle");
        }, IDLE_DELAY);
    };

    var sleep = function () {
        var element = shell();
        if (element) element.classList.add("is-idle");
        window.clearTimeout(idleTimer);
    };

    /*
     * No dialog system here any more.
     *
     * This game used to carry its own scrim/app-bar/doc dialog machinery for an
     * Appearance dialog and an About dialog. Both are gone — the launcher's stage bar
     * now owns Theme, Sound, Fullscreen, How to play and About for every game, and
     * dialogs are built once there. Left in place this was unreachable code holding a
     * second copy of the palette list, which is the same shape of duplication that let
     * this file's palette names drift out of step with the launcher's.
     */

    // ---------------------------------------------------------------------- boot

    var isSoundEnabled = function () {
        return readPref(KEY_SOUND_ENABLED, "true") == "true";
    };

    /*
     * Sound is now a launcher-level pill, so this file no longer writes the preference
     * — it only honours it. `applySound` runs on boot and again whenever the storage
     * event fires, which is what makes the launcher's pill take effect in a game that
     * is already running rather than only on the next visit.
     */
    var applySound = function (enabled) {
        if (window.pacmanShell && window.pacmanShell.setMuted) {
            window.pacmanShell.setMuted(!enabled);
        }
    };

    // ---------------------------------------------------------------------- boot

    var boot = function () {
        var palette = readPref(KEY_THEME_COLOR, DEFAULT_THEME_COLOR);
        var nightMode = readPref(KEY_NIGHT_MODE, DEFAULT_NIGHT_MODE);
        applyTheme(palette, nightMode);

        /*
         * Stay in step with the rest of the app.
         *
         * Every game runs in a same-origin frame (shell.js passes
         * `allow-same-origin`), so the launcher and this game share one copy of
         * the `ssc.` preferences. The `storage` event fires in *other*
         * same-origin documents when one of them writes, so without this
         * listener a palette picked in the launcher — or in any other game —
         * updates the launcher and leaves this game on the palette it booted
         * with.
         *
         * `event.key` is null when storage is cleared wholesale; that also means
         * "fall back to the defaults", so re-apply in that case too.
         *
         * This game keeps its own copy of this file rather than loading
         * ../../theme-game.js because it also owns the pause button. Only this listener
         * is new.
         */
        window.addEventListener("storage", function (event) {
            if (event.key === null || event.key === KEY_THEME_COLOR || event.key === KEY_NIGHT_MODE) {
                applyTheme(
                    readPref(KEY_THEME_COLOR, DEFAULT_THEME_COLOR),
                    readPref(KEY_NIGHT_MODE, DEFAULT_NIGHT_MODE)
                );
            }
            // Sound moved to a launcher-level pill, which writes the preference but
            // cannot reach into this frame. Without this the pill would look broken:
            // the label would flip and the music would keep playing until the player
            // left and re-entered the game.
            if (event.key === null || event.key === KEY_SOUND_ENABLED) {
                applySound(isSoundEnabled());
            }
        });

        // "System" night mode stays live when the OS flips.
        if (window.matchMedia) {
            var query = window.matchMedia("(prefers-color-scheme: dark)");
            var listener = function () {
                if (readPref(KEY_NIGHT_MODE, DEFAULT_NIGHT_MODE) == "system") {
                    applyTheme(readPref(KEY_THEME_COLOR, DEFAULT_THEME_COLOR), "system");
                }
            };
            if (query.addEventListener) query.addEventListener("change", listener);
            else if (query.addListener) query.addListener(listener);

            /*
             * Re-check once loading completes.
             *
             * Same race as theme-game.js, which this file deliberately mirrors: a
             * freshly-created iframe answers `prefers-color-scheme: dark` as false while
             * it is still parsing and true a tick later, so the apply() above pins
             * `data-theme="light"` and no `change` event ever arrives to correct it.
             * Only written when the answer differs, so listeners are not fired twice
             * for a no-op.
             */
            var settle = function () {
                if (readPref(KEY_NIGHT_MODE, DEFAULT_NIGHT_MODE) != "system") return;
                var wanted = prefersDark() ? "dark" : "light";
                if (root.getAttribute("data-theme") !== wanted) {
                    applyTheme(readPref(KEY_THEME_COLOR, DEFAULT_THEME_COLOR), "system");
                }
            };
            if (document.readyState === "complete") {
                settle();
            } else {
                window.addEventListener("load", settle, { once: true });
            }
        }

        wake();

        document.addEventListener("pointermove", wake, { passive: true });
        document.addEventListener(
            "pointerdown",
            function (event) {
                // On touch there is no hover, so the top and bottom strips wake the chrome.
                var edge = event.clientY < WAKE_STRIP;
                var bottom = window.innerHeight - event.clientY < WAKE_STRIP;
                if (edge || bottom) wake();
            },
            { passive: true }
        );

    /*
     * The canvas reveal now lives in the game.
     *
     * theme.css keeps an unsized <canvas> invisible so a 300x150 default cannot flash in
     * the corner on every visit, and the game's renderer adds `canvas-ready` itself as
     * soon as it has sized the canvas. It used to be done from here instead, by watching
     * the width/height attributes — which worked only while the game was a classic script
     * that sized the canvas *after* this file had run. The engine is now ES modules, which
     * are deferred but still execute before DOMContentLoaded, so the canvas was already
     * sized by the time that observer was attached, nothing changed afterwards, and the
     * game's one visible element stayed hidden: the game ran and the screen was black.
     *
     * The game owns the canvas, so the game marks it ready. The block is gone rather than
     * kept as a failsafe, because a failsafe that hides a running game is the worse of
     * the two failures.
     */

        /*
         * The in-game header bar — Sound, Fullscreen, Theme — is gone.
         *
         * All three now live in the launcher's own stage bar, which every game already
         * sits under, so this game no longer carries a second, differently-styled copy
         * of the same three controls. Its title is gone too: the stage bar already names
         * the game you are in.
         *
         * The sound preference is still honoured on boot, and now live via the storage
         * listener above, so the launcher's pill controls this game without a reload.
         */

        // The game builds its audio as soon as it loads, so apply the stored sound
        // setting once the game is up.
        applySound(isSoundEnabled());

        bindPauseButton();
        bindFireButton();
        bindFireHand();
    };

    /*
     * The pause button, for devices with no End key.
     *
     * Call into the game directly. A synthetic KeyboardEvent with keyCode used to
     * travel through the input layer, but WebKit has historically zeroed synthetic
     * keyCode — exactly on the touch devices that need this button. togglePause()
     * already refuses the title screen and mid-fade.
     */
    var bindPauseButton = function () {
        var btn = document.getElementById("pauseBtn");
        if (!btn) return;

        var press = function (e) {
            if (e) e.preventDefault();
            var game = window.munchGame;
            if (game && typeof game.togglePause === "function") game.togglePause();
        };

        btn.addEventListener("pointerdown", press);
        btn.addEventListener("click", function (e) {
            // Assistive tech / keyboard activation: detail === 0 means not a pointer click.
            if (e.detail === 0) press(e);
        });
    };

    /*
     * Fire button — Space on a keyboard, this on a touchscreen.
     *
     * firePellet() already refuses the title screen, empty hand, and a shot already
     * in flight, so a press from the attract screen is a no-op rather than a start.
     */
    var bindFireButton = function () {
        var btn = document.getElementById("fireBtn");
        if (!btn) return;

        var press = function (e) {
            if (e) e.preventDefault();
            var game = window.munchGame;
            if (game && typeof game.firePellet === "function") game.firePellet();
        };

        btn.addEventListener("pointerdown", press);
        btn.addEventListener("click", function (e) {
            if (e.detail === 0) press(e);
        });
    };

    /*
     * FIRE side — right-hand default, left-hand mirror.
     *
     * Same idea as Blocks' hand mode: put the primary thumb control on the side the
     * player prefers. Stored under `ssc.munch-fire-hand`; falls back to the old pad-side
     * keys so a returning left-hand player does not have to set it again.
     */
    var readFireHand = function () {
        var value = readPref(KEY_FIRE_HAND, "");
        if (value === "left" || value === "right") return value;
        var legacy = readPref(PREF_PREFIX + "munch-pad-side", "")
            || readPref(PREF_PREFIX + "pacman-pad-side", "");
        return legacy === "left" ? "left" : "right";
    };

    var applyFireHand = function (hand) {
        hand = hand === "left" ? "left" : "right";
        root.setAttribute("data-fire-hand", hand);
        var leftBtn = document.getElementById("fireHandLeft");
        var rightBtn = document.getElementById("fireHandRight");
        if (leftBtn) leftBtn.setAttribute("aria-pressed", hand === "left" ? "true" : "false");
        if (rightBtn) rightBtn.setAttribute("aria-pressed", hand === "right" ? "true" : "false");
    };

    var setFireHand = function (hand) {
        hand = hand === "left" ? "left" : "right";
        writePref(KEY_FIRE_HAND, hand);
        applyFireHand(hand);
    };

    var bindFireHand = function () {
        applyFireHand(readFireHand());
        var leftBtn = document.getElementById("fireHandLeft");
        var rightBtn = document.getElementById("fireHandRight");
        if (leftBtn) {
            leftBtn.addEventListener("click", function () { setFireHand("left"); });
        }
        if (rightBtn) {
            rightBtn.addEventListener("click", function () { setFireHand("right"); });
        }
    };

    if (document.readyState == "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
