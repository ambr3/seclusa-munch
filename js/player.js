/*
 * The player — Munch.
 *
 * Two arcade details are doing most of the work here, and both are counter-intuitive:
 *
 *   1. He is *slower* while eating. The speed table has separate rows for eating and not
 *      eating, and the difference is the little hesitation as each pellet goes down. It
 *      is also why a level takes as long as it does: with the drag removed the same maze
 *      clears in a third of the time.
 *
 *   2. He turns before he reaches the middle of a tile. A direction is held in `nextDir`
 *      and applied the instant the tile ahead opens up, so a player who presses a
 *      direction slightly early still gets the turn. It is what makes the controls feel
 *      responsive while everything else in the game is strictly deterministic.
 */

import {
    TILE, MID_TILE, PATTERN, PLAYER_NAME, PLAYER_COLOR, PELLET_POINTS, ENERGIZER_POINTS,
    HELD_PELLETS_MAX
} from "./config.js";
import { Actor } from "./actor.js";
import { nextIsFloor, LEFT } from "./direction.js";

const sign = (n) => (n < 0 ? -1 : n > 0 ? 1 : 0);

export class Player extends Actor {
    constructor(game) {
        super(game);
        this.name = PLAYER_NAME;
        this.color = PLAYER_COLOR;

        this.nextDirEnum = LEFT;
        this.inputDirEnum = undefined;
        this.stopped = false;

        /** Frames still to spend swallowing the last pellet. */
        this.eatPauseFramesLeft = 0;

        /** Pellets in the bank, spent one per shot. */
        this.heldPellets = 0;

        /** The tile of the last thing eaten, so it is not eaten twice while standing still. */
        this.lastMeal = { x: -1, y: -1 };

        this.startDir = LEFT;
        this.startPixel = { x: 14 * TILE - 1, y: 26 * TILE + MID_TILE.y };
    }

    reset() {
        this.nextDirEnum = this.startDir;
        this.inputDirEnum = undefined;
        this.stopped = false;
        this.eatPauseFramesLeft = 0;
        this.heldPellets = 0;
        this.lastMeal.x = -1;
        this.lastMeal.y = -1;
        super.reset();
    }

    setInputDir(dirEnum) {
        this.inputDirEnum = dirEnum;
    }

    clearInputDir(dirEnum) {
        if (dirEnum === undefined || this.inputDirEnum === dirEnum) {
            this.inputDirEnum = undefined;
        }
    }

    /**
     * Which speed row to read.
     *
     * A getter rather than a field, because it has to follow the fright timer: the arcade
     * speeds the player up slightly during a fright, and a value set once at construction
     * would mean he never is.
     */
    get pattern() {
        return this.game.energizer.active ? PATTERN.PAC_FRIGHT : PATTERN.PAC;
    }

    /**
     * The chomp: one frame per two steps.
     *
     * Closed whenever he is standing still. The step counter freezes when the player stops,
     * so without this he holds whatever frame he happened to stop on — against a wall,
     * usually the widest one, which reads as damage rather than as a character waiting to
     * turn. The arcade freezes too, but its widest frame is a third of a circle; ours is
     * wide enough that freezing on it looks like something is missing.
     */
    getMouthFrame() {
        if (this.stopped) return 0;
        return Math.floor(this.steps / 2) % 4;
    }

    /**
     * One pixel of movement, with cornering.
     *
     * Moving diagonally is not something the actors do: a step moves along the axis of
     * travel and *also* nudges one pixel towards the centre of the corridor. That drift
     * is what lets the player round a corner without stopping, and why he never sits off
     * centre in a straight run. He also refuses to move further than the middle of a tile
     * if the next one is a wall, which is the entire wall-collision rule.
     */
    advance() {
        if (!this.game.maze) return this.stepForward();

        const axis = this.dir.x !== 0 ? "x" : "y";
        const across = this.dir.x !== 0 ? "y" : "x";

        const blocked = this.atMidTile() && !nextIsFloor(this.game.maze, this.tile, this.dirEnum);
        this.stopped = this.stopped || blocked;

        if (!this.stopped) {
            this.pixel[axis] += this.dir[axis];
            this.pixel[across] += sign(this.distToMid[across]);
        }

        this.commitPos();
        return this.stopped ? 0 : 1;
    }

    steer() {
        if (this.inputDirEnum === undefined) {
            if (this.stopped) this.setDir(this.nextDirEnum);
        } else {
            const wanted = nextIsFloor(this.game.maze, this.tile, this.inputDirEnum);
            if (wanted) {
                this.setDir(this.inputDirEnum);
                this.nextDirEnum = this.inputDirEnum;
                this.stopped = false;
            } else if (!this.stopped) {
                // Remember it, and take the turn as soon as the way opens up.
                this.nextDirEnum = this.inputDirEnum;
            }
        }

        if (this.stopped) this.game.audio.stopLoop("eating");
    }

    update(subStep) {
        const steps = this.stepsThisFrame();
        if (subStep >= steps) return;

        if (this.eatPauseFramesLeft > 0) {
            // The drag is spent on the frame's last sub-step, so it lasts exactly one
            // frame however fast the actor is moving.
            if (subStep === steps - 1) this.eatPauseFramesLeft--;
            return;
        }

        super.update(subStep);
        this.eat();
    }

    eat() {
        const maze = this.game.maze;
        const eaten = maze.eat(this.tile.x, this.tile.y);
        if (!eaten) {
            // Leaving a pellet behind stops the eating loop when he moves off it.
            if (maze.getTile(this.tile.x, this.tile.y) === " " && !this.ateHere()) {
                this.game.audio.stopLoop("eating");
            }
            return;
        }

        this.lastMeal.x = this.tile.x;
        this.lastMeal.y = this.tile.y;

        // The maze is drawn once into an offscreen canvas and blitted every frame, so
        // eating has to reach into that canvas. Without this the pellets stay on the
        // screen for ever and the game looks completely broken while behaving perfectly.
        this.game.renderer.erasePellet(this.tile.x, this.tile.y);

        // A pellet costs one frame, an energizer three.
        this.eatPauseFramesLeft = eaten === "." ? 1 : 3;

        this.game.audio.loop("eating");
        this.game.addScore(eaten === "." ? PELLET_POINTS : ENERGIZER_POINTS);
        this.game.releaser.onDotEat();
        this.game.fruit.onDotEat();

        if (eaten === "o") {
            this.game.energizer.activate();
            // An energizer is also a pellet in the bank. Kept separately from
            // the fright above: the fright runs out on its own clock and can
            // expire with a pellet still held, and a level too high for any
            // fright still banks one.
            this.heldPellets = Math.min(HELD_PELLETS_MAX, this.heldPellets + 1);
        }
    }

    /** Whether the current tile is the one that was just eaten, standing still or not. */
    ateHere() {
        return this.lastMeal.x === this.tile.x && this.lastMeal.y === this.tile.y;
    }
}