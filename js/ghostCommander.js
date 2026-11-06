/*
 * The scatter/chase rhythm.
 *
 * This is the metronome the whole game runs on. Ghosts are given one of two orders —
 * scatter, meaning run for your corner and stop hunting, or chase, meaning run the
 * targeting rules — and the schedule in config.js swaps between them at fixed times.
 *
 * Every swap also reverses every ghost on the board. That is a deliberate arcade mercy
 * and a genuine tactical tool: eat an energizer and the ghosts reverse, so the second
 * half of a fright is often safer than the first, and a reversal mid-corner can be turned
 * into a free pass.
 *
 */

import { MODE_SCHEDULE, scheduleBand, CHASE, SCATTER } from "./config.js";

export class GhostCommander {
    constructor(game) {
        this.game = game;
        this.reset();
    }

    reset() {
        this.frame = 0;
        this.command = SCATTER;
    }

    /** The order issued at this frame, or undefined if there is none. */
    scheduledCommand(frame) {
        const schedule = MODE_SCHEDULE[scheduleBand(this.game.level)];
        for (const [at, command] of schedule) {
            if (at === frame) return command;
        }
        return undefined;
    }

    update() {
        // While an energizer is active the ghosts are busy being frightened. Advancing the
        // clock through a fright would burn the schedule against a frozen board and hand
        // the player a free scatter afterwards.
        if (this.game.energizer.active) return;

        const next = this.nextCommand();
        if (next !== undefined) {
            this.command = next;
            for (const ghost of this.game.ghosts) ghost.reverse();
        }
        this.frame++;
    }

    nextCommand() {
        return this.scheduledCommand(this.frame);
    }
}