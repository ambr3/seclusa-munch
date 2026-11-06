/*
 * A ghost.
 *
 * A ghost is the arcade's decision maker, and it decides in one place only: at the
 * instant it passes the centre line of a tile, it picks the open direction whose next
 * tile is closest to a target tile. Everything else — the house, the reversals, the
 * frightened flailing — is a state machine around that one decision.
 *
 * The four differ only in how they choose their target, and those four rules are the
 * arcade's, unchanged. The names are this game's:
 *
 *   Rook   goes straight for the player's tile. Unwavering, which is why it is the one
 *          that gets dangerous.
 *   Pip    goes for the tile four ahead of the player — and the board had a bug that also
 *          aimed four up and four *left* when the player faced up. It is kept, because it
 *          is the single most famous behaviour in the game: Nix measures from that wrong
 *          square, so his turns are wrong in a specific, learnable way.
 *   Nix    doubles the vector from Rook to the square two ahead of the player. He is the
 *          only ghost who depends on another ghost, so he can be led around deliberately.
 *   Bram   chases while more than eight tiles away and gives up when he gets close, which
 *          reads as a ghost that loses his nerve.
 *
 * `targetTile` and `faceDirEnum` are the two pieces of state that make this look like
 * behaviour rather than a reaction: the target is set a whole tile early and the new
 * heading is committed at the centre line, so a ghost visibly squares up to a corner
 * before it turns it.
 */

import { TILE, PATTERN, GHOST_PLAN, SCATTER, DOOR_PIXEL } from "./config.js";
import { Actor } from "./actor.js";
import {
    UP,
    LEFT,
    DOWN,
    RIGHT,
    reverseOf,
    openTiles,
    turnClosestToTarget
} from "./direction.js";

/** Ghost states. The names are the arcade's, more or less. */
export const OUTSIDE = "outside";
export const EATEN = "eaten";
export const GOING_HOME = "goingHome";
export const ENTERING_HOME = "enteringHome";
export const PACING_HOME = "pacing";
export const LEAVING_HOME = "leavingHome";

/** Bram's give-up distance, in tiles. */
const CLYDE_COWARD_DISTANCE_SQUARED = 64;

export class Ghost extends Actor {
    constructor(game, index) {
        super(game);

        const plan = GHOST_PLAN[index];
        this.index = index;
        this.name = plan.name;
        this.color = plan.color;
        this.corner = plan.corner;
        this.startDir = plan.startDir;
        this.startPixel = plan.startPixel;
        this.startMode = plan.startMode;
        this.arriveHomeMode = plan.arriveHomeMode;

        this.pattern = PATTERN.GHOST;
        this.targetTile = { x: 0, y: 0 };
        this.targetPixel = { x: 0, y: 0 };
        this.faceDirEnum = this.startDir;

        /** Pending instructions, applied at the next tile centre. */
        this.sigReverse = false;
        this.sigLeaveHome = false;

        this.mode = this.startMode;
        this.scared = false;
        this.elroy = 0;
    }

    reset() {
        this.sigReverse = false;
        this.sigLeaveHome = false;
        this.mode = this.startMode;
        this.scared = false;
        this.elroy = 0;
        this.game.audio.ghostReset();
        super.reset();
        this.faceDirEnum = this.dirEnum;
    }

    /** Whether this ghost still has eyes, i.e. is out on the board or heading home. */
    get isVisible() {
        return this.mode !== EATEN;
    }

    /** Whether only its eyes should be drawn. */
    get isEyesOnly() {
        return this.mode === GOING_HOME || this.mode === ENTERING_HOME;
    }

    // ------------------------------------------------------------- commands

    reverse() {
        this.sigReverse = true;
    }

    leaveHome() {
        this.playSounds();
        this.sigLeaveHome = true;
    }

    /**
     * Eaten. The ghost is frozen here for a second while its points are shown, then
     * switched to "going home" by the play loop — so the freeze cannot be used to skip
     * the trip back.
     */
    goHome() {
        this.game.audio.eatenGhost();
        this.mode = EATEN;
    }

    /** Called when the player eats an energizer: turn around, and be scared unless in transit. */
    onEnergized() {
        this.reverse();
        if (this.mode !== GOING_HOME && this.mode !== ENTERING_HOME) {
            this.scared = true;
        }
    }

    onEaten() {
        this.goHome();
        this.scared = false;
    }

    /**
     * Which looping sound should be playing, given what the four ghosts are doing.
     *
     * One loop for the chase, one for the eyes going home, and the frightened warble
     * belongs to the energizer. Recomputed whenever a ghost changes state, because the
     * browser will happily leave a loop running over silence forever otherwise.
     */
    playSounds() {
        const ghosts = this.game.ghosts;
        let outside = 0;
        let goingHome = 0;
        for (const ghost of ghosts) {
            if (ghost.mode === OUTSIDE) outside++;
            if (ghost.mode === GOING_HOME) goingHome++;
        }

        if (goingHome > 0) {
            this.game.audio.stopLoop("ghostNormalMove");
            this.game.audio.loop("ghostReturnToHome");
            return;
        }
        this.game.audio.stopLoop("ghostReturnToHome");

        if (outside > 0) {
            if (!this.scared) this.game.audio.loop("ghostNormalMove");
        } else {
            this.game.audio.stopLoop("ghostNormalMove");
        }
    }

    // ---------------------------------------------------------------- speed

    /**
     * Ghosts slow down in the tunnel for the whole game, at every level.
     *
     * This is what makes the tunnel a tool rather than a shortcut: it is the one place a
     * chase can be lost, and it works against the ghosts for as long as the game lasts.
     */
    slowsInTunnel() {
        return true;
    }

    stepsThisFrame() {
        const game = this.game;

        if (this.mode === GOING_HOME || this.mode === ENTERING_HOME) {
            return 2; // eyes are the fastest thing on the board
        }
        if (this.mode === LEAVING_HOME || this.mode === PACING_HOME) {
            return game.stepSizeFor(1, PATTERN.GHOST_TUNNEL, this.frames);
        }

        let pattern = PATTERN.GHOST;
        if (game.maze.isTunnelTile(this.tile.x, this.tile.y) && this.slowsInTunnel()) {
            pattern = PATTERN.GHOST_TUNNEL;
        } else if (this.scared) {
            pattern = PATTERN.GHOST_FRIGHT;
        } else if (this.elroy === 1) {
            pattern = PATTERN.ELROY1;
        } else if (this.elroy === 2) {
            pattern = PATTERN.ELROY2;
        }

        return game.stepSizeFor(game.level || 1, pattern, this.frames);
    }

    // -------------------------------------------------------------- steering

    /**
     * The ghost house, which is a small state machine of its own.
     *
     * The four states cover: walking back from the board (going home), dropping through
     * the door and sidestepping onto its own seat (entering home), bobbing up and down
     * while it waits (pacing), and leaving. Pacing ghosts turn at the exact pixel rows of
     * the house floor rather than at tile centres, because the house is half a tile tall
     * and there is no tile centre to aim at.
     */
    steerHome() {
        const maze = this.game.maze;
        const door = maze.doorTile;

        switch (this.mode) {
            case GOING_HOME:
                if (this.tile.x === door.x && this.tile.y === door.y) {
                    if (this.pixel.x === DOOR_PIXEL.x) {
                        this.mode = ENTERING_HOME;
                        this.playSounds();
                        this.setDir(DOWN);
                    } else {
                        this.setDir(RIGHT);
                    }
                    this.faceDirEnum = this.dirEnum;
                }
                break;

            case ENTERING_HOME:
                if (this.pixel.y === maze.homeBottomPixel) {
                    if (this.pixel.x === this.startPixel.x) {
                        this.setDir(UP);
                        this.mode = this.arriveHomeMode;
                    } else {
                        this.setDir(this.startPixel.x < this.pixel.x ? LEFT : RIGHT);
                    }
                    this.faceDirEnum = this.dirEnum;
                }
                break;

            case PACING_HOME:
                if (this.sigLeaveHome) {
                    this.sigLeaveHome = false;
                    this.mode = LEAVING_HOME;
                    if (this.pixel.x === DOOR_PIXEL.x) {
                        this.setDir(UP);
                    } else {
                        this.setDir(this.pixel.x < DOOR_PIXEL.x ? RIGHT : LEFT);
                    }
                } else if (this.pixel.y === maze.homeTopPixel) {
                    this.setDir(DOWN);
                } else if (this.pixel.y === maze.homeBottomPixel) {
                    this.setDir(UP);
                }
                this.faceDirEnum = this.dirEnum;
                break;

            case LEAVING_HOME:
                if (this.pixel.x === DOOR_PIXEL.x) {
                    if (this.pixel.y === DOOR_PIXEL.y) {
                        // Every ghost turns left out of the door, on every maze.
                        this.mode = OUTSIDE;
                        this.setDir(LEFT);
                    } else {
                        this.setDir(UP);
                    }
                    this.faceDirEnum = this.dirEnum;
                }
                break;
        }
    }

    steer() {
        this.steerHome();

        if (this.mode !== OUTSIDE && this.mode !== GOING_HOME) return;

        // On the centre line: take the heading that was decided a tile ago.
        if (this.atMidTile()) {
            if (this.sigReverse) {
                this.faceDirEnum = reverseOf(this.dirEnum);
                this.sigReverse = false;
            }
            this.setDir(this.faceDirEnum);
            return;
        }

        // One pixel past it: decide what the next heading will be.
        if (!this.justPassedMidTile()) return;

        const nextTile = { x: this.tile.x + this.dir.x, y: this.tile.y + this.dir.y };
        const open = openTiles(this.game.maze, nextTile, this.dirEnum);

        if (this.scared) {
            // No target, no plan: a frightened ghost picks any open turn at random.
            this.faceDirEnum = this.randomOpen(open);
            return;
        }

        if (this.mode === GOING_HOME) {
            const door = this.game.maze.doorTile;
            this.targetTile.x = door.x;
            this.targetTile.y = door.y;
        } else if (!this.elroy && this.game.commander.command === SCATTER) {
            const owner = this;
            this.targetTile.x = owner.corner.x;
            this.targetTile.y = owner.corner.y;
        } else {
            this.setTarget();
        }

        // A ghost heading home is not allowed the map's turn restrictions, which exist
        // only to shape how the chase plays out.
        if (this.mode !== GOING_HOME) {
            this.game.maze.applyTurnConstraints(nextTile, open, this.dirEnum);
        }

        this.faceDirEnum = turnClosestToTarget(nextTile, this.targetTile, open);
    }

    /** The open directions in enum order, so a frightened ghost is still reproducible. */
    randomOpen(open) {
        const directions = [UP, LEFT, DOWN, RIGHT];
        let start = Math.floor(Math.random() * 4);
        for (let i = 0; i < 4; i++) {
            const dir = directions[(start + i) % 4];
            if (open[dir]) return dir;
        }
        return this.dirEnum;
    }

    /** Picks this ghost's chase target and mirrors it in pixels for the renderer. */
    setTarget() {
        const pac = this.game.player;
        const step = { x: pac.dir.x, y: pac.dir.y };

        switch (this.index) {
            case 0: // Rook
                this.targetTile.x = pac.tile.x;
                this.targetTile.y = pac.tile.y;
                this.targetPixel.x = pac.pixel.x;
                this.targetPixel.y = pac.pixel.y;
                break;

            case 1: // Pip, with the overflow bug that aims up-and-left.
                this.targetTile.x = pac.tile.x + 4 * step.x - (pac.dirEnum === UP ? 4 : 0);
                this.targetTile.y = pac.tile.y + 4 * step.y;
                this.targetPixel.x = pac.pixel.x + 4 * step.x * TILE - (pac.dirEnum === UP ? 4 * TILE : 0);
                this.targetPixel.y = pac.pixel.y + 4 * step.y * TILE;
                break;

            case 2: { // Nix, measured from Rook's tile through Pip's target.
                const aheadX = pac.tile.x + 2 * step.x - (pac.dirEnum === UP ? 2 : 0);
                const aheadY = pac.tile.y + 2 * step.y;
                const rook = this.game.ghosts[0];
                this.targetTile.x = rook.tile.x + 2 * (aheadX - rook.tile.x);
                this.targetTile.y = rook.tile.y + 2 * (aheadY - rook.tile.y);
                break;
            }

            case 3: { // Bram: brave at range, a coward up close.
                const dx = pac.tile.x - (this.tile.x + this.dir.x);
                const dy = pac.tile.y - (this.tile.y + this.dir.y);
                if (dx * dx + dy * dy >= CLYDE_COWARD_DISTANCE_SQUARED) {
                    this.targetTile.x = pac.tile.x;
                    this.targetTile.y = pac.tile.y;
                    this.targetPixel.x = pac.pixel.x;
                    this.targetPixel.y = pac.pixel.y;
                } else {
                    this.targetTile.x = this.corner.x;
                    this.targetTile.y = this.corner.y;
                }
                break;
            }
        }
    }
}