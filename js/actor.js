/*
 * Position, heading, and speed — everything the player and the four ghosts have in common.
 *
 * An actor's position is kept in pixels rather than tiles, because that is the only way
 * to reproduce the arcade's sub-tile speeds: ghosts really do move at half a pixel per
 * frame on some levels, which a tile-based engine cannot express at all. The tile, the
 * offset within the tile, and the distance to the tile's centre line are all derived from
 * the pixel position and recomputed on every move, because they are asked for constantly
 * and are what decide where an actor is allowed to turn.
 */

import { TILE, MID_TILE, stepSize } from "./config.js";
import { vectorOf, UP, LEFT, DOWN, RIGHT } from "./direction.js";

export class Actor {
    constructor(game) {
        this.game = game;

        this.dirEnum = undefined;
        this.dir = { x: 0, y: 0 };
        this.pixel = { x: 0, y: 0 };
        this.tile = { x: 0, y: 0 };
        this.tilePixel = { x: 0, y: 0 };
        this.distToMid = { x: 0, y: 0 };

        /** Frame counter, and the odometer behind the mouth animation. */
        this.frames = 0;
        this.steps = 0;
    }

    setDir(dirEnum) {
        this.dirEnum = dirEnum;
        const vector = vectorOf(dirEnum);
        this.dir.x = vector.x;
        this.dir.y = vector.y;
    }

    setPos(x, y) {
        this.pixel.x = x;
        this.pixel.y = y;
        this.commitPos();
    }

    /** Recomputes everything that follows from the pixel position. */
    commitPos() {
        if (this.game.maze) this.game.maze.teleport(this);

        this.tile.x = Math.floor(this.pixel.x / TILE);
        this.tile.y = Math.floor(this.pixel.y / TILE);

        this.tilePixel.x = this.positiveModulo(this.pixel.x, TILE);
        this.tilePixel.y = this.positiveModulo(this.pixel.y, TILE);

        this.distToMid.x = MID_TILE.x - this.tilePixel.x;
        this.distToMid.y = MID_TILE.y - this.tilePixel.y;
    }

    positiveModulo(value, modulus) {
        return ((value % modulus) + modulus) % modulus;
    }

    /** True once the actor is exactly on the centre line of its tile. */
    atMidTile() {
        return this.distToMid.x === 0 && this.distToMid.y === 0;
    }

    /** True just after passing the centre line, which is when a ghost picks its next turn. */
    justPassedMidTile() {
        return (
            (this.dirEnum === RIGHT && this.tilePixel.x === MID_TILE.x + 1) ||
            (this.dirEnum === LEFT && this.tilePixel.x === MID_TILE.x - 1) ||
            (this.dirEnum === UP && this.tilePixel.y === MID_TILE.y - 1) ||
            (this.dirEnum === DOWN && this.tilePixel.y === MID_TILE.y + 1)
        );
    }

    /** Moves one pixel forward, ignoring walls. Subclasses decide whether to. */
    stepForward() {
        this.setPos(this.pixel.x + this.dir.x, this.pixel.y + this.dir.y);
        return 1;
    }

    /** Pixels to move this frame, from the speed table for this actor's pattern. */
    stepsThisFrame() {
        return stepSize(this.game.level, this.pattern, this.frames);
    }

    /**
     * Advances the actor by one sub-step.
     *
     * The arcade runs two sub-steps per frame and the speed table says how many pixels to
     * cover, so each actor is offered two chances to move and takes as many as its speed
     * allows. A step that is refused (a wall, or the eating drag) returns 0 and the
     * odometer does not advance, which is what keeps the animation in step with the rule.
     */
    update(subStep) {
        const steps = this.stepsThisFrame();
        if (subStep >= steps) return;

        this.steps += this.advance();
        this.steer();
    }

    advance() {
        return this.stepForward();
    }

    /** Called after every successful move. Decides whether the actor changes heading. */
    steer() {
        /* subclasses override */
    }

    /** Back to the start of the level. */
    reset() {
        this.setDir(this.startDir);
        this.setPos(this.startPixel.x, this.startPixel.y);
        this.frames = 0;
        this.steps = 0;
    }
}
