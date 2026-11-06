/*
 * The game itself: what is being played, and the loop that runs it.
 *
 * The simulation runs at a fixed 60Hz regardless of the display, because the arcade does
 * and because every rule in config.js is expressed in frames — a ghost's speed is a
 * sixteen-frame pattern, a fright is 360 frames, the release timeout is four seconds. A
 * variable timestep would make the same game run at different speeds on different
 * machines, which is exactly the thing this project is trying not to do.
 *
 * A fixed timestep still needs a frame budget: if a tab has been in the background for a
 * minute, catching up would mean simulating thousands of frames at once. So the loop
 * updates as many frames as the clock allows, up to a cap of three, and quietly loses the
 * rest. Losing a few frames is invisible; freezing for ten seconds is not.
 */

import { FRAME_MS, MAX_FRAME_SKIP, STARTING_LIVES, EXTRA_LIFE_SCORE, stepSize, chromeColor } from "./config.js";
import { UP, LEFT, DOWN, RIGHT, nextIsFloor, vectorOf } from "./direction.js";
import { Player } from "./player.js";
import { Ghost } from "./ghost.js";
import { GhostCommander } from "./ghostCommander.js";
import { GhostReleaser } from "./ghostReleaser.js";
import { ElroyTimer } from "./elroy.js";
import { Energizer } from "./energizer.js";
import { Pellet } from "./pellet.js";
import { Fruit } from "./fruit.js";
import { Renderer } from "./renderer.js";
import { createStates } from "./states.js";

const KEY = {
    ENTER: 13,
    ESC: 27,
    SPACE: 32,
    END: 35,
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40
};

const DIRECTION_KEYS = {
    [KEY.LEFT]: LEFT,
    [KEY.UP]: UP,
    [KEY.RIGHT]: RIGHT,
    [KEY.DOWN]: DOWN
};

/** States where the arrows steer rather than press start. */
const STEERING_STATES = ["play", "ready"];

export class Game {
    constructor({ canvas, audio, scores }) {
        this.canvas = canvas;
        this.audio = audio;
        this.scores = scores;

        this.level = 1;
        this.extraLives = STARTING_LIVES;
        this.score = 0;
        this.highScore = scores.get();
        this.extraLifeGiven = false;

        this.maze = null;
        this.flashLevel = false;
        this.paused = false;
        this.fade = null;
        this.animFrame = 0;

        this.renderer = new Renderer(canvas);

        this.player = new Player(this);
        this.ghosts = [0, 1, 2, 3].map((index) => new Ghost(this, index));
        // Draw and update order is the arcade's memory order: the ghosts, then the player.
        this.actors = [...this.ghosts, this.player];

        this.commander = new GhostCommander(this);
        this.releaser = new GhostReleaser(this);
        this.elroy = new ElroyTimer(this);
        this.energizer = new Energizer(this);
        this.fruit = new Fruit(this);

        /** The pellet in flight, or null. Never more than one. */
        this.pellet = null;

        this.states = createStates(this);
        this.state = null;
        this.setState(this.states.title);

        this.lastFrameTime = undefined;
        this.accumulator = 0;
        this.frame = this.frame.bind(this);
    }

    // ----------------------------------------------------------------- loop

    start() {
        // Two loops running at once would be two updates per frame for every rule in the
        // game, and the frame budget is what keeps a backgrounded tab from catching up.
        if (this.running) return;
        this.running = true;
        window.requestAnimationFrame(this.frame);
    }

    frame(now) {
        if (!this.running) return;
        window.requestAnimationFrame(this.frame);

        if (this.lastFrameTime === undefined) this.lastFrameTime = now - FRAME_MS;

        const elapsed = Math.min(now - this.lastFrameTime, MAX_FRAME_SKIP * FRAME_MS);
        this.lastFrameTime = now;
        this.accumulator += elapsed;

        while (this.accumulator >= FRAME_MS) {
            this.accumulator -= FRAME_MS;
            this.update();
        }

        this.draw();
    }

    update() {
        this.animFrame++;

        if (this.fade) {
            this.updateFade();
            return;
        }

        if (this.paused) return;
        this.state.update();
    }

    draw() {
        this.renderer.beginFrame();

        if (this.fade) {
            const fade = this.fade;
            const progress = fade.frame / fade.duration;
            if (progress < 0.5) {
                fade.from.draw();
                this.renderer.overlay(progress * 2);
            } else {
                fade.to.draw();
                this.renderer.overlay((1 - progress) * 2);
            }
        } else {
            this.state.draw();
        }

        if (this.paused) {
            const ctx = this.renderer.ctx;
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);
            this.renderer.drawMessage("PAUSED", chromeColor(), 17);
        }
    }

    /**
     * Steps a fade along: the first half runs the old state, the second half the new one,
     * and the new state is initialised exactly at the midpoint so that it appears already
     * built as the screen comes back.
     */
    updateFade() {
        const fade = this.fade;
        fade.frame++;

        if (fade.frame < fade.half) {
            if (fade.continueUpdate) fade.from.update();
        } else if (fade.frame === fade.half) {
            fade.to.enter();
        } else if (fade.frame < fade.duration) {
            if (fade.continueUpdate) fade.to.update();
        } else {
            this.fade = null;
            if (fade.to.leave) fade.to.leave();
        }
    }

    // -------------------------------------------------------------- states

    setState(state) {
        this.fade = null;
        if (this.state && this.state.leave) this.state.leave();
        this.state = state;
        state.enter();
    }

    /**
     * Moves to another state, optionally fading through black on the way.
     *
     * The fade keeps simulating the state it is leaving, so a death animation does not
     * freeze mid-step while the screen goes dark, and it hands over exactly once at the
     * end however many frames it was given.
     */
    switchState(name, fadeFrames = 0) {
        const next = this.states[name];
        if (!next) return;

        this.audio.silence();
        this.paused = false;

        if (this.state && fadeFrames > 0) {
            this.state.leave?.();
            this.fade = {
                from: this.state,
                to: next,
                duration: fadeFrames,
                half: Math.floor(fadeFrames / 2),
                frame: 0,
                continueUpdate: true
            };
            this.state = next;
            return;
        }

        this.setState(next);
    }

    // ------------------------------------------------------------ scoring

    addScore(points) {
        this.score += points;

        // One extra Munch, awarded once, at 10,000. The arcade checked for this on the
        // way past rather than by comparing against a stored flag, so crossing the line
        // with a fruit is enough — and crossing it twice is not.
        if (!this.extraLifeGiven && this.score >= EXTRA_LIFE_SCORE) {
            this.extraLifeGiven = true;
            this.extraLives++;
            this.audio.play("extend");
            this.renderer.drawLives(this);
        }

        this.scores.submit(this.score);
        this.highScore = this.scores.get();
    }

    // --------------------------------------------------------------- setup

    /** Starts a game from level one. */
    startGame() {
        this.highScore = this.scores.get();
        this.score = 0;
        this.extraLives = STARTING_LIVES;
        this.extraLifeGiven = false;
        this.level = 0;

        this.switchState("readyLevel", 60);
    }

    /**
     * Pausing stops the simulation and the soundtrack together.
     *
     * The loops are the game's own idea of what is happening, and a chase warbling on under
     * a PAUSED overlay is both wrong and the first thing a player reports as a bug. They
     * come back on their own: the play loop asks for the right one every frame, and
     * silence() clears the record of which loops it thinks are running.
     */
    togglePause() {
        if (this.fade) return;
        // A manual pause overrides the tab-hide pause, so coming back to the tab does
        // not unpause a game the player stopped on purpose.
        this._pausedByHide = false;
        this.paused = !this.paused;
        if (this.paused) this.audio.silence();
    }

    resize() {
        this.renderer.resize();
        if (this.maze) this.renderer.drawMap(this);
    }

    /** Speed lookup, so a ghost leaving the house can use level 1's pattern mid-level. */
    stepSizeFor(level, pattern, tick) {
        return stepSize(level, pattern, tick);
    }

    // -------------------------------------------------------------- input

    /**
     * A key going down. Returns true if the game consumed it.
     *
     * There is no menu to navigate: the title screen starts the game on any key, and
     * everywhere else the arrows steer. That check is the whole of the input model, and
     * it is why the shell's pause button — which sends a synthetic End key — cannot do
     * anything from the title screen, and why a swipe before the game starts is only ever
     * read as the tap that starts it.
     */
    onKeyDown(code) {
        if (this.fade) return true;

        if (this.state === this.states.title) {
            this.startGame();
            return true;
        }

        const direction = DIRECTION_KEYS[code];
        if (direction !== undefined) {
            if (STEERING_STATES.includes(this.stateName())) this.player.setInputDir(direction);
            return true;
        }

        if (code === KEY.SPACE) {
            this.firePellet();
            return true;
        }

        if (code === KEY.END) {
            this.togglePause();
            return true;
        }

        return false;
    }

    onKeyUp(code) {
        const direction = DIRECTION_KEYS[code];
        if (direction !== undefined) this.player.clearInputDir(direction);
    }

    /**
     * Spend a banked pellet, if there is one and the shot has somewhere to go.
     *
     * Refused rather than queued while one is already in flight, and refused
     * while the player is against a wall in their own direction of travel: the
     * pellet would be born inside that wall and the press would read as broken.
     */
    firePellet() {
        const player = this.player;
        if (this.pellet || player.heldPellets <= 0) return false;
        if (this.stateName() !== "play") return false;
        if (player.dirEnum === undefined) return false;

        /*
         * Two tiles, not one, and both from the player's own tile.
         *
         * A pellet is launched into the tile in front of the player, on that tile's
         * centre line, so the first thing it does on its first sub-step is ask whether
         * the tile *beyond* that is floor. Checking only the tile it spawns in allows
         * a shot that is born already touching a wall, which is cleared on the first
         * sub-step of the *next* frame -- invisible, pellet spent, at every corridor end
         * and in every energizer pocket. That is what made the control read as dead.
         */
        const vector = vectorOf(player.dirEnum);
        if (!nextIsFloor(this.maze, player.tile, player.dirEnum)) return false;
        const spawn = { x: player.tile.x + vector.x, y: player.tile.y + vector.y };
        if (!nextIsFloor(this.maze, spawn, player.dirEnum)) return false;

        player.heldPellets--;
        this.pellet = new Pellet(this, player.tile, player.dirEnum);
        return true;
    }

    clearPellet() {
        this.pellet = null;
    }

    /** The pellet reached a ghost: the arcade's points, and the ghost goes home. */
    pelletKillsGhost(ghost) {
        this.pellet = null;
        this.energizer.addPoints();
        ghost.onEaten();
    }

    stateName() {
        for (const [name, state] of Object.entries(this.states)) {
            if (state === this.state) return name;
        }
        return null;
    }

    /** A click or tap. */
    onPointerDown() {
        if (this.state === this.states.title) {
            this.startGame();
            return;
        }

        // Anywhere else, a tap fires and releases a held direction.
        //
        // Both, not either. Releasing is the touch equivalent of letting go of
        // the arrow key and is what stops a swipe from sticking; firing is what
        // the same gesture is bound to on a device with no space bar. Firing
        // first means the shot leaves along the direction the swipe just set,
        // which is what the gesture reads as meaning.
        this.firePellet();
        this.player.clearInputDir();
    }
}

export { KEY, DIRECTION_KEYS };