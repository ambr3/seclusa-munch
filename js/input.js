/*
 * Input: keyboard, mouse, touch.
 *
 * Three sources, one set of game calls. On a touchscreen, swiping is the only steering
 * control: there is no on-screen pad. The page shell's pause button dispatches a synthetic
 * End key, which arrives here as an ordinary keyboard event and is therefore the real
 * control by construction — it cannot drift out of step with the keyboard, and cannot do
 * anything the keyboard could not.
 *
 * A swipe is a steering gesture rather than a click: the direction is registered once a
 * finger has travelled far enough, the anchor moves to where it got to, and another
 * direction can be registered from there. That is what makes a fast swipe across the maze
 * turn twice rather than once, and it is why a pad was worth removing.
 *
 * Pointer events that start inside the page shell belong to the shell, not the game — a
 * thumb reaching for the pause button must not throw the maze in that direction. The
 * swipe handlers are also passive, on purpose: there is nothing to preventDefault for. A
 * touch on this page never becomes a scroll — the viewport does not scroll — and the click
 * the browser synthesises afterwards is what tells a tap from a swipe, not something to be
 * suppressed.
 */

import { LEFT, RIGHT, UP, DOWN } from "./direction.js";

/**
 * Finger travel, in pixels, before a swipe counts as a direction.
 *
 * This was 4px, which was tuned when a pad also existed and a misread swipe cost nothing
 * — the pad was right there. It is the only gesture on a touch device now, so the cost of
 * being wrong is different in both directions: too low and a finger resting on the glass
 * drifts into a turn, and the click that would have been a tap is swallowed with it, so
 * the game starts steering instead of starting; too high and a quick flick across a gap
 * does not register at all.
 *
 * 10px sits between the two. A deliberate swipe is tens of pixels, and a thumb resting
 * still is not 10px of drift, so the gesture that fires is a gesture the player meant.
 */
const SWIPE_THRESHOLD = 10;

export function bindInput(game) {
    /*
     * Build the audio on the first real interaction.
     *
     * Nine clip downloads at page load is nine requests the player did not ask for,
     * competing with the module graph for whatever connection there is — which is most of
     * what "the game takes ages to load" was. Doing it here rather than at construction
     * also means the first play() comes from a gesture, which is what the browser's
     * autoplay rule requires.
     */
    const unlock = () => {
        game.audio.unlock();
        window.removeEventListener("keydown", unlock);
        window.removeEventListener("pointerdown", unlock);
        document.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("keydown", unlock);
    window.addEventListener("pointerdown", unlock);
    document.addEventListener("touchstart", unlock, { passive: true });

    window.addEventListener("keydown", (event) => {
        if (game.onKeyDown(event.keyCode)) event.preventDefault();
    });

    window.addEventListener("keyup", (event) => {
        if (game.onKeyUp(event.keyCode)) event.preventDefault();
    });

    const canvas = game.canvas;

    let anchorX = 0;
    let anchorY = 0;
    /*
     * Whether the touch in progress has already steered.
     *
     * The browser follows every touch sequence with a synthesised click, a swipe included.
     * Passing that on to the game as a tap would undo the swipe on the very next frame —
     * before the player has moved a pixel — because a tap is what releases a held
     * direction. So the click after a swipe is swallowed, and only a click with no swipe
     * behind it is the tap. Set here rather than cleared on touchend, which fires first.
     */
    let swiped = false;

    canvas.addEventListener("click", (event) => {
        if (swiped) {
            swiped = false;
            return;
        }
        game.onPointerDown(event);
    });

    const isShellEvent = (event) => {
        const target = event && event.target;
        return !!(target && target.closest && target.closest("[data-ui-chrome]"));
    };

    const touchStart = (event) => {
        if (isShellEvent(event)) return;
        swiped = false;
        if (event.touches.length !== 1) {
            touchCancel(event);
            return;
        }
        anchorX = event.touches[0].pageX;
        anchorY = event.touches[0].pageY;
    };

    const touchMove = (event) => {
        if (isShellEvent(event)) return;
        if (event.touches.length !== 1) {
            touchCancel(event);
            return;
        }

        const dx = event.touches[0].pageX - anchorX;
        const dy = event.touches[0].pageY - anchorY;
        if (dx * dx + dy * dy < SWIPE_THRESHOLD * SWIPE_THRESHOLD) return;

        anchorX += dx;
        anchorY += dy;
        swiped = true;

        if (Math.abs(dx) >= Math.abs(dy)) {
            game.player.setInputDir(dx > 0 ? RIGHT : LEFT);
        } else {
            game.player.setInputDir(dy > 0 ? DOWN : UP);
        }
    };

    const touchCancel = () => {
        anchorX = 0;
        anchorY = 0;
    };

    document.addEventListener("touchstart", touchStart, { passive: true });
    document.addEventListener("touchmove", touchMove, { passive: true });
    document.addEventListener("touchend", touchCancel, { passive: true });
    document.addEventListener("touchcancel", touchCancel, { passive: true });

    window.addEventListener("resize", () => game.resize());
    window.addEventListener("orientationchange", () => game.resize());
}

/*
 * Sound follows the app's shared preference.
 *
 * The launcher writes `ssc.pref_key_sound_enabled` in another same-origin frame; the
 * storage event is how a change made there reaches a game that is already running, so the
 * pill works without a reload. The `key === null` case is storage being cleared wholesale,
 * which means "back to the defaults" rather than "nothing to do".
 */
const SOUND_KEY = "ssc.pref_key_sound_enabled";

export function bindSoundPreference(audio) {
    window.pacmanAudio = audio;

    const readSound = () => {
        try {
            return localStorage.getItem(SOUND_KEY) !== "false";
        } catch (err) {
            return true;
        }
    };

    audio.setMuted(!readSound());

    window.addEventListener("storage", (event) => {
        if (event.key === null || event.key === SOUND_KEY) audio.setMuted(!readSound());
    });
}