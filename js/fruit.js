/*
 * The bonus fruit.
 *
 * It appears below the ghost house after seventy pellets and again a hundred later, sits
 * for nine seconds, and is worth whatever is on the ladder for the current level. The
 * ladder is the arcade's own spacing — cherry, strawberry, then two levels each — which is
 * what makes the row along the bottom of the screen a progress bar rather than decoration.
 *
 * There is no wandering fruit here. Ms. Pac-Man bounced its bonus around the board on one
 * of four routes; that game is not in this build, and carrying its pathing would be
 * carrying a road to nowhere.
 */

import { TILE, MID_TILE, FRUIT_SECONDS, FRUIT_POINTS_SECONDS, FRUIT_DOT_LIMITS, FRUIT_LADDER, FRUIT_BY_LEVEL } from "./config.js";

export class Fruit {
    constructor(game) {
        this.game = game;
        this.pixel = { x: 0, y: 0 };
        this.framesLeft = 0;
        this.scoreFramesLeft = 0;
        /** The bonus for each level played, for the row along the bottom of the screen. */
        this.history = {};
        this.onNewLevel();
    }

    /** The fruit this level. */
    fruitForLevel(level) {
        const index = Math.min(Math.max(level, 1), FRUIT_BY_LEVEL.length);
        return FRUIT_LADDER[FRUIT_BY_LEVEL[index - 1]];
    }

    onNewLevel() {
        this.current = this.fruitForLevel(this.game.level);
        clearTimeout(this.soundsTimer);
        this.framesLeft = 0;
        this.scoreFramesLeft = 0;

        // The bottom strip shows the last seven levels' fruit, so a player can see what is
        // still to come.
        this.history = {};
        for (let level = Math.max(1, this.game.level - 6); level <= this.game.level; level++) {
            this.history[level] = this.fruitForLevel(level);
        }
    }

    reset() {
        clearTimeout(this.soundsTimer);
        this.framesLeft = 0;
        this.scoreFramesLeft = 0;
    }

    get isPresent() {
        return this.framesLeft > 0;
    }

    get isScorePresent() {
        return this.scoreFramesLeft > 0;
    }

    onDotEat() {
        if (this.isPresent) return;
        if (this.game.maze.dotsEaten === FRUIT_DOT_LIMITS[0] || this.game.maze.dotsEaten === FRUIT_DOT_LIMITS[1]) {
            this.spawn();
        }
    }

    spawn() {
        // Directly under the ghost house.
        this.pixel.x = 14 * TILE - 1;
        this.pixel.y = 20 * TILE + MID_TILE.y;
        this.framesLeft = FRUIT_SECONDS * 60;
    }

    update() {
        if (this.scoreFramesLeft > 0) this.scoreFramesLeft--;
        if (this.framesLeft > 0) this.framesLeft--;
    }

    /**
     * Eaten. The score stays up for two seconds, like the arcade's.
     *
     * The ghost loops are silenced for the length of the clip and picked up again after it,
     * so the fruit does not land on top of the chase — which means a timer rather than
     * another call into the loop. It is the one timer this file owns, so it is cancelled
     * whenever the fruit state is cleared: a fruit eaten in the last half second before a
     * death would otherwise wake up in the middle of READY! and start the chase loop over a
     * board nobody is on.
     */
    testCollide() {
        if (!this.isPresent) return false;

        const player = this.game.player;
        if (Math.abs(player.pixel.y - this.pixel.y) > MID_TILE.y) return false;
        if (Math.abs(player.pixel.x - this.pixel.x) > MID_TILE.x) return false;

        this.game.addScore(this.current.points);
        this.game.audio.eatenFruit();

        clearTimeout(this.soundsTimer);
        this.soundsTimer = setTimeout(() => this.game.ghosts[0].playSounds(), 500);

        this.framesLeft = 0;
        this.scoreFramesLeft = FRUIT_POINTS_SECONDS * 60;
        return true;
    }
}