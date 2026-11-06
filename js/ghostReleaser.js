/*
 * When the ghosts in the house are let out.
 *
 * The house holds three ghosts, and the arcade releases them by counting pellets in two
 * different ways depending on how the level started:
 *
 *   Fresh level   Each ghost has its own count. Pip is out before you have moved, Nix
 *                 after 30 pellets on level 1, Bram after 60 (50 on level 2).
 *   After a death The pellets stay eaten. The ghosts come out on one shared counter
 *                 at 7, 17 and 32 pellets counted from the respawn — slower, and the
 *                 reason dying early in a level costs you the whole house.
 *
 * On top of both, a ghost will be let out if nothing has been eaten for four seconds
 * (three from level 5). It is what stops a player from simply parking: stand still and the
 * house empties anyway.
 */

import { personalDotLimit, releaseTimeout, GLOBAL_DOT_LIMITS } from "./config.js";
import { PACING_HOME } from "./ghost.js";

const PERSONAL = "personal";
const GLOBAL = "global";

export class GhostReleaser {
    constructor(game) {
        this.game = game;
    }

    /** A new level: per-ghost counters, and no pellets eaten yet. */
    onNewLevel() {
        this.mode = PERSONAL;
        this.framesSinceDot = 0;
        this.counts = [0, 0, 0, 0];
    }

    /** A restart after a death: the shared counter, from zero. */
    onRestartLevel() {
        this.mode = GLOBAL;
        this.framesSinceDot = 0;
        this.globalCount = 0;
    }

    onDotEat() {
        this.framesSinceDot = 0;

        if (this.mode === GLOBAL) {
            this.globalCount++;
            return;
        }

        // Charge each pellet to the first ghost still waiting, which is what keeps their
        // counters in step with the order they are let out.
        for (let i = 1; i < 4; i++) {
            if (this.game.ghosts[i].mode === PACING_HOME) {
                this.counts[i]++;
                return;
            }
        }
    }

    update() {
        if (this.releaseFromCounters()) return;
        this.releaseFromTimeout();
    }

    releaseFromCounters() {
        const level = this.game.level;

        if (this.mode === PERSONAL) {
            for (let i = 1; i < 4; i++) {
                const ghost = this.game.ghosts[i];
                if (ghost.mode !== PACING_HOME) continue;
                if (this.counts[i] >= personalDotLimit(level, i)) {
                    ghost.leaveHome();
                    return true;
                }
                // Only the first ghost waiting is considered, so the counters cannot be
                // spent out of order by a ghost that is not ready yet.
                return false;
            }
            return false;
        }

        if (this.globalCount === GLOBAL_DOT_LIMITS[0] && this.game.ghosts[1].mode === PACING_HOME) {
            this.game.ghosts[1].leaveHome();
            return true;
        }
        if (this.globalCount === GLOBAL_DOT_LIMITS[1] && this.game.ghosts[2].mode === PACING_HOME) {
            this.game.ghosts[2].leaveHome();
            return true;
        }
        if (this.globalCount === GLOBAL_DOT_LIMITS[2] && this.game.ghosts[3].mode === PACING_HOME) {
            // Past the last release the counter is done with, and counting resumes per
            // ghost for whatever is still in the house.
            this.globalCount = 0;
            this.mode = PERSONAL;
            this.game.ghosts[3].leaveHome();
            return true;
        }
        return false;
    }

    releaseFromTimeout() {
        if (this.framesSinceDot > releaseTimeout(this.game.level)) {
            this.framesSinceDot = 0;
            for (let i = 1; i < 4; i++) {
                const ghost = this.game.ghosts[i];
                if (ghost.mode === PACING_HOME) {
                    ghost.leaveHome();
                    return;
                }
            }
        } else {
            this.framesSinceDot++;
        }
    }
}