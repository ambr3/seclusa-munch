/*
 * Sound.
 *
 * The clips are the arcade recordings, re-encoded by James Freeman for the original
 * remake, and they are driven the same way the board drove them: a handful of one-shots
 * and four loops that switch over depending on what is happening on the maze. Which loop
 * is playing is therefore a function of game state — ghosts outside, ghosts going home,
 * ghosts frightened, the player eating — and the engine asks for a loop every time that state
 * changes rather than starting and stopping sounds at each event.
 *
 * Two constraints shape this file. The browser will not play audio before the player has
 * touched the page, so every play() is allowed to fail silently; and the launcher's sound
 * control lives in another frame and cannot reach into this one, so it works through the
 * localStorage preference plus the `storage` event, ending up at setMuted().
 */

const CLIPS = {
    eating: { file: "sounds/eating.mp3", volume: 0.5 },
    // Named for what they are rather than what they do: `eatenGhost` and `eatenFruit`
    // below are methods, and an instance property of the same name would shadow them.
    ghostEaten: { file: "sounds/eating-ghost.mp3", volume: 1 },
    fruitEaten: { file: "sounds/eating-fruit.mp3", volume: 1 },
    ghostReturnToHome: { file: "sounds/ghost-return-to-home.mp3", volume: 1 },
    ghostTurnToBlue: { file: "sounds/ghost-turn-to-blue.mp3", volume: 0.5 },
    ghostNormalMove: { file: "sounds/ghost-normal-move.mp3", volume: 1 },
    startMusic: { file: "sounds/start-music.mp3", volume: 1 },
    die: { file: "sounds/miss.mp3", volume: 1 },
    extend: { file: "sounds/extend.mp3", volume: 1 }
};

/** One clip, playable once or looping. */
class Track {
    constructor(url, volume) {
        this.baseVolume = volume;
        this.element = new Audio(url);
        this.element.volume = volume;
        this.element.load();
        this.looping = false;
        this.muted = false;

        // Looping by re-arming on `ended` rather than setting the element's own loop
        // flag: the clips are edited to start and stop cleanly, and this way stopping a
        // loop can also leave it parked at the start for next time. The `looping` guard
        // matters: a one-shot is not looping, and re-arming it would play it for ever.
        this.onEnded = () => {
            if (this.looping) this.playSound(true);
        };
        this.element.addEventListener("ended", this.onEnded);
    }

    play(keepPosition) {
        this.stopLoop(keepPosition);
        this.playSound(keepPosition);
    }

    playSound(keepPosition) {
        if (this.muted) return;
        if (!keepPosition && !this.element.paused) this.element.currentTime = 0;
        try {
            const started = this.element.play();
            if (started && started.catch) started.catch(() => {});
        } catch (err) {
            /* autoplay refused, or the tab is backgrounded */
        }
    }

    startLoop(keepPosition) {
        if (this.looping) return;
        this.looping = true;
        this.playSound(keepPosition);
    }

    stopLoop(keepPosition) {
        this.looping = false;
        this.element.pause();
        if (!keepPosition) this.element.currentTime = 0;
    }

    setMuted(muted) {
        if (this.muted === muted) return;
        this.muted = muted;
        this.element.volume = muted ? 0 : this.baseVolume;
        if (muted) this.stopLoop(true);
    }
}

export class GameAudio {
    constructor() {
        // Nothing is created here on purpose — see unlock().
        this.clips = {};
        this.muted = false;
        /** Which loops the game believes are running, so a start is not issued twice. */
        this.looping = {};
    }

    /**
     * Builds the tracks, once, on the first key press or tap.
     *
     * Constructing them at load time starts nine downloads the moment the page opens, on
     * a connection that may be slow, and the player cannot do anything until those have
     * finished competing with everything else. Nine parallel requests for audio the player
     * has not asked for yet is a poor trade for "the game appears immediately".
     *
     * This also happens to be where the browser's autoplay rule is satisfied: a play()
     * called from a real gesture is allowed through, one called from a timer is not.
     */
    unlock() {
        if (Object.keys(this.clips).length) return;
        for (const [name, clip] of Object.entries(CLIPS)) {
            this.clips[name] = new Track(clip.file, clip.volume);
            this.clips[name].setMuted(this.muted);
        }
    }

    track(name) {
        return this.clips[name];
    }

    /** True once the clips exist — everything below is a no-op until they do. */
    get ready() {
        return Object.keys(this.clips).length > 0;
    }

    /** The clip for an eaten ghost: stop everything else first, as the board did. */
    eatenGhost() {
        this.silence(true);
        const clip = this.track("ghostEaten");
        if (clip) clip.play();
    }

    /** The clip for an eaten fruit. */
    eatenFruit() {
        this.silence(true);
        const clip = this.track("fruitEaten");
        if (clip) clip.play();
    }

    /** One-shot, by name: `play("startMusic")`. No-op before the clips are built. */
    play(name) {
        const clip = this.track(name);
        if (clip) clip.play();
    }

    /**
     * Stops every loop, leaving one-shots alone when `keepPosition` is true.
     *
     * Called whenever the game changes state — a level starting, a ghost
     * being eaten — because a loop left running over silence is the classic symptom of a
     * soundtrack that has drifted away from the game.
     */
    silence(keepPosition) {
        for (const clip of Object.values(this.clips)) clip.stopLoop(keepPosition);

        // The bookkeeping goes with them. This is the one place a loop is stopped without
        // going through stopLoop(), so leaving `looping` set would make every later loop()
        // for that name a no-op — and the game asks for a loop from a state change rather
        // than at the moment the sound should start, so the sound would never come back.
        for (const name of Object.keys(this.looping)) this.looping[name] = false;
    }

    /** Just the ghost loops, for a ghost leaving the house. */
    ghostReset(keepPosition) {
        for (const name of ["ghostNormalMove", "ghostReturnToHome", "ghostTurnToBlue"]) {
            this.stopLoop(name, keepPosition);
        }
    }

    /**
     * Starts or stops one of the four loops. No-op before the clips exist, which is the
     * whole point of building them late: the game asks for a loop from its first frame
     * and there is simply nothing to play yet.
     */
    loop(name, keepPosition) {
        const clip = this.track(name);
        if (!clip) return;
        if (this.looping[name]) return;
        this.looping[name] = true;
        clip.startLoop(keepPosition);
    }

    /** Stops a loop, and records that it is stopped. */
    stopLoop(name, keepPosition) {
        this.looping[name] = false;
        const clip = this.track(name);
        if (clip) clip.stopLoop(keepPosition);
    }

    setMuted(muted) {
        this.muted = muted;
        for (const clip of Object.values(this.clips)) clip.setMuted(muted);

        // Muting a track stops whatever loop it was carrying, so the record of which loops
        // are running has to be cleared with it — otherwise unmuting would leave the game
        // believing they are still going and it would never ask for them again.
        if (muted) for (const name of Object.keys(this.looping)) this.looping[name] = false;
    }
}

// The launcher's sound pill writes a preference in another frame and cannot call in here,
// so this is the one door it has. Kept for the same reason the original had it.
window.pacmanShell = {
    setMuted: (muted) => {
        if (window.pacmanAudio) window.pacmanAudio.setMuted(muted);
    }
};