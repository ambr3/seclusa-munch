/*
 * Elroy: Rook as the level's rubber band.
 *
 * As the maze empties, Rook is promoted twice. Elroy 1 he moves faster; Elroy 2 faster
 * again, and at Elroy 1 and 2 he ignores the scatter order altogether — the targeting
 * rules only apply while `elroy` is 0, which is why an Elroy Rook will cross the maze
 * corner to corner and leave a frightened ghost sitting in his own corner.
 *
 * The thresholds are in pellets *left*, listed per level in config.js, so Elroy arrives
 * sooner in progress terms as the levels get faster. One rule is easy to miss: after a
 * death, Rook is not Elroy again until Bram has left the house. Without it, a
 * restart on a nearly-empty maze would hand the player an Elroy Rook immediately.
 */

import { elroyDotsEaten } from "./config.js";
import { PACING_HOME } from "./ghost.js";

export class ElroyTimer {
    constructor(game) {
        this.game = game;
    }

    onNewLevel() {
        this.waitingForBram = false;
    }

    onRestartLevel() {
        this.waitingForBram = true;
    }

    update() {
        if (this.waitingForBram) {
            if (this.game.ghosts[3].mode !== PACING_HOME) this.waitingForBram = false;
        }

        const rook = this.game.ghosts[0];
        if (this.waitingForBram) {
            rook.elroy = 0;
            return;
        }

        const maze = this.game.maze;
        rook.elroy =
            maze.dotsEaten >= elroyDotsEaten(this.game.level, 2, maze.totalPellets)
                ? 2
                : maze.dotsEaten >= elroyDotsEaten(this.game.level, 1, maze.totalPellets)
                  ? 1
                  : 0;
    }
}