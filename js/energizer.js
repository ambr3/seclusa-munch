/*
 * Energizers: the fright timer, the flashing, and the score for eating a ghost.
 *
 * Three things share one clock here because they share one rule. Eating an energizer
 * starts a fright; during a fright ghosts turn blue, reverse, and pick turns at random;
 * near the end they flash white and blue; and a ghost eaten during that window is worth
 * 200, then 400, then 800, then 1600, shown on the board for a second while the game
 * freezes. The points only double within one fright — the next energizer starts again at
 * 200, which is why a second energizer is worth eating even after a bad first one.
 *
 * The flash timing is the arcade's odd little formula: flashing begins a fixed number of
 * fourteen-frame cycles before the fright ends, so the flash is a fixed *fraction* of the
 * fright rather than a fixed number of seconds. A six-second fright flashes for much
 * longer than a one-second one, and both flash the same number of times.
 */

import {
    FRIGHT_SECONDS,
    FRIGHT_FLASHES,
    FLASH_INTERVAL,
    GHOST_POINTS,
    GHOST_POINTS_SECONDS
} from "./config.js";

export class Energizer {
    constructor(game) {
        this.game = game;
        this.reset();
    }

    reset() {
        this.game.audio.stopLoop("ghostTurnToBlue");
        this.frame = 0;
        this.active = false;
        this.points = GHOST_POINTS[0];
        this.pointsFramesLeft = 0;
        for (const ghost of this.game.ghosts) ghost.scared = false;
    }

    /** Seconds of fright on this level. Zero from level 17 on. */
    get durationFrames() {
        const level = this.game.level;
        if (level > FRIGHT_SECONDS.length) return 0;
        return FRIGHT_SECONDS[level - 1] * 60;
    }

    /** How many times the ghosts flash before the fright is over. */
    get flashCount() {
        const level = this.game.level;
        if (level > FRIGHT_FLASHES.length) return 0;
        return FRIGHT_FLASHES[level - 1];
    }

    update() {
        if (!this.active) return;

        // Count up, then compare. A six-second fright has to be six hundred and sixty
        // updates: testing before incrementing makes it one frame longer than every other
        // timing in the game, and testing with `===` makes it a frame shorter whenever the
        // timer lands between two integers.
        this.frame++;
        if (this.frame >= this.durationFrames) this.reset();
    }

    activate() {
        this.game.audio.stopLoop("ghostNormalMove");
        this.game.audio.loop("ghostTurnToBlue");

        this.active = true;
        this.frame = 0;
        this.points = GHOST_POINTS[0];

        for (const ghost of this.game.ghosts) ghost.onEnergized();

        // A level with no fright at all: the energizer still counts as eaten, but there
        // is nothing to be frightened of.
        if (this.durationFrames === 0) this.reset();
    }

    /**
     * Whether the ghosts should be drawn white right now.
     *
     * Counts fourteen-frame cycles remaining to the end of the fright, and flashes for as
     * many of the last 2*flashes cycles as there are even ones.
     */
    get flashing() {
        const cyclesLeft = Math.floor((this.durationFrames - this.frame) / FLASH_INTERVAL);
        if (cyclesLeft > 2 * this.flashCount - 1) return false;
        return cyclesLeft % 2 === 0;
    }

    /**
     * A ghost has been eaten: award the value on the board and start its second on screen.
     *
     * Nothing is doubled here. `points` is both the number added to the score and the
     * number the renderer draws for as long as the score is up, so doubling on the way in
     * would put 400 on the first ghost of a fright — and cost the player the bottom of the
     * arcade's ladder entirely. The doubling happens when the score comes off the board.
     */
    addPoints() {
        this.game.addScore(this.points);
        this.pointsFramesLeft = GHOST_POINTS_SECONDS * 60;
    }

    get showingPoints() {
        return this.pointsFramesLeft > 0;
    }

    updatePointsTimer() {
        if (this.pointsFramesLeft <= 0) return;
        this.pointsFramesLeft--;

        // The score has come off the board, so this is the only moment it is safe to move
        // the ladder on. It runs once per eaten ghost: showingPoints gates the one caller,
        // and nothing else can start a second before the first is over.
        if (this.pointsFramesLeft === 0) {
            const index = GHOST_POINTS.indexOf(this.points);
            this.points = GHOST_POINTS[Math.min(index + 1, GHOST_POINTS.length - 1)];
        }
    }
}