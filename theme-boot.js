/*
 * Seclusa Games — puts the saved palette and night mode on <html> before the first paint.
 *
 * Why this file exists, which is a short story about one attribute.
 *
 * The document declares `<html data-palette="navy" data-theme="light">`, because that is
 * the right answer for a browser with no JavaScript: the light palette. But it is the wrong
 * answer for everyone else, because the real preference lives in localStorage and only a
 * script can read it. theme.js reads it — at the end of the body, where it can bind to
 * elements that exist.
 *
 * So on every load the page painted light first and corrected itself afterwards. The window
 * in between is short on a desktop and not short at all on a phone, where parsing a game
 * registry and two stylesheets can take a beat: a dark-mode device showed a white header,
 * then a black one, and reported that the theme did something weird.
 *
 * This runs instead, and it is deliberately tiny and synchronous. It sets the two
 * attributes the stylesheets key off, and nothing else — it does not bind, persist, or
 * touch the DOM. Being synchronous and in <head>, ahead of the stylesheets, is the whole
 * trick: by the time the first rule that reads `data-theme` can apply, the attribute is
 * already correct, so there is no wrong frame to correct.
 *
 * It duplicates the small amount of logic in theme.js and theme-game.js on purpose. The
 * alternative — moving those files into <head> — breaks them, because they bind to
 * elements that have not been parsed yet.
 */

(function () {
    "use strict";

    var PREF_PREFIX = "ssc.";
    var KEY_THEME_COLOR = PREF_PREFIX + "pref_key_theme_color";
    var KEY_NIGHT_MODE = PREF_PREFIX + "pref_key_night_mode";

    /* Must match PALETTES in theme.js, theme-game.js and games/pacman/theme.js. */
    var DEFAULT_THEME_COLOR = "navy";
    var PALETTES = [
        "orange", "green", "blue", "purple",
        "rose", "teal", "amber", "slate",
        "navy", "indigo", "lime", "crimson"
    ];

    function readPref(key, fallback) {
        try {
            var value = window.localStorage.getItem(key);
            return value === null ? fallback : value;
        } catch (err) {
            /* Private browsing, or storage disabled: the default is the right answer. */
            return fallback;
        }
    }

    var palette = readPref(KEY_THEME_COLOR, DEFAULT_THEME_COLOR);
    if (PALETTES.indexOf(palette) < 0) {
        palette = DEFAULT_THEME_COLOR;
    }

    var mode = readPref(KEY_NIGHT_MODE, "system");
    var dark = mode === "dark";
    if (mode === "system") {
        // `matches` rather than the `addListener` form, and guarded: this is the first
        // thing the page runs, and a browser without matchMedia should get light, not a
        // broken document.
        dark = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }

    var root = document.documentElement;
    root.setAttribute("data-palette", palette);
    root.setAttribute("data-theme", dark ? "dark" : "light");
})();