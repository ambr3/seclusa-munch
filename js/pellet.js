/*
 * The fired pellet.
 *
 * Eating an energizer banks a pellet; firing spends one. It leaves along the
 * player's heading, keeps going until it meets a wall, and kills the first ghost
 * it touches on the way. Only one is ever in flight, which is the arcade's rule
 * and also the only one that needs no bookkeeping — a second shot while the
 * first is still travelling is refused rather than queued.
 *
 * It is an Actor so it inherits the sub-tile pixel position the rest of the game
 * runs on. Ghosts really do move at half a pixel per frame on some levels, and a
 * pellet that rounded to the tile grid would pass straight through them.
 */

import { Actor } from "./actor.js";
import { nextIsFloor, vectorOf } from "./direction.js";
import { TILE, MID_TILE } from "./config.js";
import { OUTSIDE } from "./ghost.js";

/**
 * Pixels per frame.
 *
 * Faster than anything else on the board, deliberately: a pellet at ghost speed
 * reads as a third ghost rather than as something being fired, and the whole
 * point is that it arrives before the ghost leaves the tile.
 *
 * Two is the ceiling, not a choice. The loop offers an actor two sub-steps per
 * frame and each accepted one moves a single pixel, so anything above this
 * reads as its value being ignored rather than as extra speed.
 */
const PELLET_SPEED = 2;

/*
 * Sub-steps before a shot gives up, so one down a long corridor ends.
 *
 * Sub-steps, not frames: the play loop offers two per frame and each accepted one
 * decrements, so this is about three seconds of wall clock, not six.
 */
const PELLET_LIFETIME = 60 * 6;

export class Pellet extends Actor {
    constructor(game, tile, dirEnum) {
        super(game);

        this.lifeLeft = PELLET_LIFETIME;

        const vector = vectorOf(dirEnum);
        this.setDir(dirEnum);

        /*
         * Launched into the tile in front of the player, on that tile's centre
         * line. From the player's own pixel it would start overlapped with them
         * and be blocked at once by whatever wall they are standing against —
         * which is every time you fire into a corner, and corners are most of
         * the decisions a pellet gets into.
         */
        this.setPos(
            (tile.x + vector.x) * TILE + MID_TILE.x,
            (tile.y + vector.y) * TILE + MID_TILE.y,
        );
    }

    /** Its own speed, rather than a new row in the arcade's speed table. */
    stepsThisFrame() {
        return PELLET_SPEED;
    }

    /** Straight ahead, one pixel, stopping at the first wall. */
    advance() {
        if (!this.game.maze) return this.stepForward();

        if (this.atMidTile() && !nextIsFloor(this.game.maze, this.tile, this.dirEnum)) {
            return 0;
        }

        this.stepForward();
        return 1;
    }

    update(subStep) {
        const steps = this.stepsThisFrame();
        if (subStep >= steps) return;

        this.frames++;
        if (--this.lifeLeft <= 0) {
            this.game.clearPellet();
            return;
        }

        if (this.advance() === 0) {
            this.game.clearPellet();
            return;
        }

        const ghost = this.ghostInTheWay();
        if (ghost) this.game.pelletKillsGhost(ghost);
    }

    /**
     * The ghost sharing this pellet's tile.
     *
     * Only ghosts out of the house count. A ghost mid-transit is passing
     * through, and shooting it while it is on its way home from being eaten
     * would chain the points for one shot.
     */
    ghostInTheWay() {
        for (const ghost of this.game.ghosts) {
            if (ghost.mode !== OUTSIDE) continue;
            if (ghost.tile.x !== this.tile.x || ghost.tile.y !== this.tile.y) continue;
            return ghost;
        }
        return null;
    }
}
