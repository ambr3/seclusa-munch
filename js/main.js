/*
 * Boot.
 *
 * Three things have to be in place before the first frame: the app's typefaces, so the
 * first thing drawn is not a fallback in the wrong size; the canvas, sized by the
 * renderer; and the game object itself.
 *
 * The audio is deliberately *not* built here. It is nine clip downloads the player has not
 * asked for yet, and building them on the first key press or tap instead keeps the page
 * interactive immediately (see input.js).
 */

import { Game } from "./game.js";
import { GameAudio } from "./audio.js";
import { Scores } from "./storage.js";
import { bindInput, bindSoundPreference } from "./input.js";

const canvas = document.getElementById("canvas");
const audio = new GameAudio();

const game = new Game({ canvas, audio, scores: new Scores() });

bindInput(game);
bindSoundPreference(audio);
game.start();

// One place for the page shell to reach the game, beside the mute hook it already has.
window.munchGame = game;

/*
 * A hidden tab still runs the fixed timestep (throttled), and the chase loops re-arm on
 * `ended`, so leaving the page mid-chase used to keep warbling in the background. Pause
 * the simulation and silence the loops until the tab is visible again.
 */
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        if (!game.paused && !game.fade && game.stateName() !== "title") {
            game.paused = true;
            game._pausedByHide = true;
            game.audio.silence();
        }
    } else if (game._pausedByHide) {
        game._pausedByHide = false;
        game.paused = false;
    }
});

/*
 * The typefaces live in theme.css next to the @font-face rules. Waiting for them means
 * the first score drawn is in Sora rather than in the fallback, instead of switching to
 * Sora mid-game while a player is reading their own score.
 */
if (document.fonts && document.fonts.load) {
    for (const face of ['700 8px Sora', '800 11px Sora', '600 8px Sora']) {
        document.fonts.load(face).catch(() => {
            /* the fallback face is fine; nothing depends on these loading */
        });
    }
}