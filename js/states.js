/*
 * The states of play, and the timings between them.
 *
 * A state is three functions and nothing else: what to set up when it starts, what to do
 * on each frame, and what to draw. The game holds exactly one of them at a time, and every
 * transition between them is a deliberate pause with its own length — four seconds of
 * READY! before a life, a second of stillness while an eaten ghost's score is on the
 * board, a flash of the maze before the next one. Those pauses are not polish. They are
 * the arcade's rhythm, and they are what make the last pellet of a level feel like an
 * event rather than a frame.
 *
 * Two of them are scripted rather than looped — the death and the finished level — because
 * both are a fixed sequence of frames with art at specific moments, and a table of
 * "what happens on frame N" reads better than a pile of counters for the same thing.
 */

import {
    PLAYER_COLOR,
    chromeColor,
    READY_FRAMES,
    DEATH_FREEZE_FRAMES,
    DEATH_ANIM_FRAMES,
    FINISH_FLASH_START,
    FINISH_FLASH_PERIOD,
    FINISH_FLASH_COUNT,
    GAME_OVER_FRAMES,
    TILE
} from "./config.js";
import { OUTSIDE, EATEN, GOING_HOME, ENTERING_HOME } from "./ghost.js";
import { mazeForLevel } from "./mazes.js";
import { Maze } from "./maze.js";
import { drawPacman } from "./sprites.js";
import { PROMPT_FONT, MAP_WIDTH } from "./renderer.js";

export function createStates(game) {
    const renderer = game.renderer;
    const states = {};

    // ------------------------------------------------------------ level setup

    /** Builds the maze for the next level and resets everything a level owns. */
    function startLevel() {
        game.level++;
        game.maze = new Maze(mazeForLevel());
        game.maze.reset();
        game.fruit.onNewLevel();

        renderer.drawMap(game);

        game.releaser.onNewLevel();
        game.elroy.onNewLevel();
    }

    /**
     * A lost life. The maze stays as it was — pellets already eaten stay eaten — and the
     * ready state puts Munch and the ghosts back on their start tiles. Refilling the maze
     * here replayed the level from the first pellet while lives were still left.
     */
    function restartLevel() {
        game.extraLives--;

        renderer.drawMap(game);

        // The house releases on the slower shared counter after a death, and Elroy waits
        // for Bram, which is what makes dying on a nearly-empty maze cost something.
        game.releaser.onRestartLevel();
        game.elroy.onRestartLevel();
    }

    function resetActors() {
        for (const actor of game.actors) actor.reset();
        game.commander.reset();
        game.fruit.reset();
        game.energizer.reset();
    }

    // ------------------------------------------------------------------ title

    states.title = {
        enter() {
            this.frame = 0;
            game.audio.silence();
            game.maze = null;
        },

        update() {
            this.frame++;
        },

        /*
         * The title screen.
         *
         * There is no menu here, and that is the point: the game is one game, so there is
         * nothing to choose. The name, the cast, the record, and a prompt — any key starts.
         *
         * The earlier version had a list with PLAY, PLAY TURBO and a game picker, and it
         * cost more than it was worth twice over. The first Enter a player pressed did
         * nothing visible, so they pressed it again, and the line that finally started the
         * game was whichever they landed on — which is how a game running at the arcade's
         * own speed gets reported as running at a hundred miles an hour.
         */
        draw() {
            const ctx = renderer.ctx;

            /*
             * Context setup, which the wordmark used to do on its way past.
             *
             * Removing the name took out the only code in this state that configured the
             * canvas context, so every prompt below inherited whatever alignment the last
             * state left behind and drew from `MAP_WIDTH / 2` rightwards instead of
             * centred on it -- PRESS START and the control hints both visibly off to one
             * side and running off the board. Measuring the text said they fitted; they
             * did not, because nothing was centring them.
             */
            ctx.textAlign = "center";
            ctx.textBaseline = "top";

            /*
             * No name and no mark.
             *
             * Both used to be here and both have gone, because the launcher's bar says
             * `SECLUSA MUNCH` for as long as this game is open. That is the copy worth
             * keeping: it does not vanish the moment a key is pressed, so for the whole
             * game the name was somewhere other than where the attract screen put it,
             * and the two were free to disagree. The mark went with it for the same
             * reason -- it was a second, larger copy of the app's identity sitting under
             * a bar that already carries it.
             *
             * What is left is the cast and how to start, which is all an attract screen
             * was ever for.
             */

            // The cast, lined up and animating, as every attract screen ever has done: the
            // player at the left of the row, the four ghosts to his right, all on one line.
            //
            // Row 10 rather than the 12 it used to, so the block sits centred once the
            // wordmark above it is gone: roughly ten empty rows above and ten below,
            // rather than the top third of the screen being empty and the rest crowded.
            const frame = game.animFrame;
            const rowCentre = 10 * TILE + 4;
            const rowLeft = MAP_WIDTH / 2 - 50;
            drawPacman(ctx, rowLeft, rowCentre, 3, Math.floor(frame / 6) % 4, { color: PLAYER_COLOR });
            for (const ghost of game.ghosts) renderer.drawGhostAt(ctx, ghost, frame, rowLeft, rowCentre);

            // The prompt blinks, because a static one reads as a label rather than an
            // invitation — and because a blinking line is what an arcade attract screen
            // would have had. It is up for twice as long as it is down, so a glance lands
            // on it more often than not.
            if (Math.floor(this.frame / 30) % 3 !== 2) {
                ctx.font = PROMPT_FONT;
                ctx.fillStyle = chromeColor();
                ctx.fillText("PRESS START", MAP_WIDTH / 2, 14 * TILE);
            }

            ctx.font = PROMPT_FONT;
            ctx.fillStyle = chromeColor("dim");
            /*
             * The controls this device has, not the controls the arcade had.
             *
             * There is no on-screen pad, so on a touchscreen "ARROWS" names keys that do
             * not exist and "END" names a key the device has never had. The same
             * `pointer: coarse` question the shell's CSS asks decides which line to draw.
             */
            const touch = typeof matchMedia === "function"
                && (matchMedia("(pointer: coarse)").matches || matchMedia("(hover: none)").matches);
            ctx.fillText(
                touch
                    ? "TAP TO START  \u00b7  SWIPE TO STEER  \u00b7  TAP TO FIRE"
                    : "ARROWS/SWIPE  \u00b7  SPACE FIRES  \u00b7  END PAUSES",
                MAP_WIDTH / 2,
                18 * TILE
            );

            if (game.highScore > 0) {
                ctx.fillStyle = chromeColor("dim");
                ctx.fillText("BEST " + game.highScore, MAP_WIDTH / 2, 21 * TILE);
            }
        }
    };

    // ------------------------------------------------------------------ ready

    states.ready = {
        enter() {
            game.audio.play("startMusic");
            resetActors();
            this.frames = 0;
        },

        update() {
            if (this.frames >= READY_FRAMES) {
                game.switchState("play");
                return;
            }
            this.frames++;
        },

        draw() {
            renderer.blitMap();
            renderer.drawScore(game);
            renderer.drawBankedPellets(game);
            renderer.drawActors(game);
            renderer.drawEnergizers(game);
            renderer.drawReady();
        }
    };

    // ------------------------------------------------------------------- play

    states.play = {
        enter() {
            this.pointsFreeze = false;
        },

        update() {
            const ghosts = game.ghosts;

            /*
             * The second a ghost is eaten the game stops for one second to show the points.
             * Only the eyes keep moving, because they are the one thing the player has to
             * see: where the rest of the house is.
             */
            if (game.energizer.showingPoints) {
                for (let subStep = 0; subStep < 2; subStep++) {
                    for (const ghost of ghosts) {
                        if (ghost.mode === GOING_HOME || ghost.mode === ENTERING_HOME) ghost.update(subStep);
                    }
                }
                game.energizer.updatePointsTimer();
                return;
            }

            // And when the points go, the ghosts actually start travelling.
            for (const ghost of ghosts) {
                if (ghost.mode === EATEN) ghost.mode = GOING_HOME;
            }
            ghosts[0].playSounds();

            game.releaser.update();
            game.commander.update();
            game.elroy.update();
            game.fruit.update();
            game.energizer.update();

            for (let subStep = 0; subStep < 2; subStep++) {
                game.player.update(subStep);
                game.fruit.testCollide();

                if (game.maze.allEaten()) {
                    game.audio.play("extend");
                    game.switchState("finish");
                    return;
                }

                // Collision is tested on both sides of the ghost's move as well as
                // between them. The arcade only tested once a frame and could let the player
                // and a ghost swap tiles without meeting; this does not.
                if (this.testCollision()) return;
                for (const ghost of ghosts) ghost.update(subStep);
                if (this.testCollision()) return;

                // After the ghosts, so a pellet that reaches a ghost this
                // sub-step is tested against where the ghost actually ended up.
                if (game.pellet) game.pellet.update(subStep);
            }

            for (const actor of game.actors) actor.frames++;
        },

        /**
         * The player against the four ghosts. Returns true if something happened, which stops
         * the rest of this frame's movement dead.
         */
        testCollision() {
            const pac = game.player;
            for (const ghost of game.ghosts) {
                if (ghost.mode !== OUTSIDE) continue;
                if (ghost.tile.x !== pac.tile.x || ghost.tile.y !== pac.tile.y) continue;

                if (ghost.scared) {
                    game.energizer.addPoints();
                    ghost.onEaten();
                } else {
                    game.switchState("dead");
                }
                return true;
            }
            return false;
        },

        draw() {
            renderer.blitMap();
            renderer.drawScore(game);
            renderer.drawBankedPellets(game);
            renderer.drawEnergizers(game);
            renderer.drawFruit(game);
            renderer.drawActors(game);
            renderer.drawPellet(game);
        }
    };

    // ------------------------------------------------------------------- dead

    states.dead = {
        enter() {
            this.frame = 0;
            /*
             * A shot in flight is lost with the life.
             *
             * Nothing else clears it: only the pellet itself clears, on a wall or on a
             * ghost, and the play loop that would advance it is not running in this state.
             * So it sat frozen through the death, was never drawn here, and then carried
             * on across the board on the next life -- while also refusing every shot,
             * because `firePellet()` will not start a second one.
             */
            game.clearPellet();
            game.audio.play("die");
        },

        update() {
            this.frame++;

            // The ghosts keep shuffling in the background of the first second, which is
            // the only reason they are still moving when the death animation starts.
            if (this.frame < DEATH_FREEZE_FRAMES) {
                for (const ghost of game.ghosts) ghost.frames++;
                return;
            }

            if (this.frame >= DEATH_FREEZE_FRAMES + DEATH_ANIM_FRAMES + 45) {
                // One life is spent by the restart; the last death goes to game over.
                game.switchState(game.extraLives > 1 ? "readyRestart" : "gameOver");
            }
        },

        draw() {
            const ctx = renderer.ctx;
            renderer.blitMap();
            renderer.drawScore(game);
            renderer.drawBankedPellets(game);

            if (this.frame < DEATH_FREEZE_FRAMES) {
                renderer.drawFruit(game);
                renderer.drawActors(game);
                return;
            }

            // Past the freeze, the ghosts are gone: the arcade isolates the player alone and
            // then takes him apart.
            if (this.frame < DEATH_FREEZE_FRAMES + DEATH_ANIM_FRAMES) {
                const t = (this.frame - DEATH_FREEZE_FRAMES) / DEATH_ANIM_FRAMES;
                renderer.drawDeath(game, t);
                return;
            }

            // The last beat is the burst, held for a moment before the screen moves on.
            renderer.drawDeath(game, 1);
        }
    };

    // ----------------------------------------------------------------- finish

    states.finish = {
        enter() {
            this.frame = 0;
            /*
             * A shot in flight is lost with the level, for the same reason it is lost on
             * death -- and this is the harder of the two to notice.
             *
             * The `allEaten()` check above returns out of `play.update()` *before* the line
             * that advances a pellet, so finishing on the same frame you fired leaves the
             * pellet alive. Nothing else clears it: the finish screen never draws one, and
             * `startLevel()` replaces `game.maze` out from under it. So it sat frozen
             * through READY!, then resumed travelling across a board it was never fired
             * on -- taking ghosts for points nobody shot at, while refusing every press
             * because `firePellet()` will not put two in the air.
             */
            game.clearPellet();
        },

        update() {
            this.frame++;
            if (this.frame >= FINISH_FLASH_START + FINISH_FLASH_PERIOD * FINISH_FLASH_COUNT) {
                game.switchState("readyLevel", 60);
            }
        },

        draw() {
            const since = this.frame - FINISH_FLASH_START;
            const flashing = since >= 0 && Math.floor(since / FINISH_FLASH_PERIOD) % 2 === 0;

            game.flashLevel = flashing;
            if (flashing) renderer.drawMap(game);

            renderer.blitMap();
            renderer.drawScore(game);
            renderer.drawBankedPellets(game);
            if (!flashing) {
                renderer.drawEnergizers(game);
                renderer.drawFruit(game);
                renderer.drawActors(game);
            }
        },

        leave() {
            game.flashLevel = false;
        }
    };

    // -------------------------------------------------------------- game over

    states.gameOver = {
        enter() {
            this.frame = 0;
        },

        update() {
            this.frame++;
            if (this.frame >= GAME_OVER_FRAMES) game.switchState("title", 60);
        },

        draw() {
            renderer.blitMap();
            renderer.drawScore(game);
            renderer.drawBankedPellets(game);
            renderer.drawMessage("GAME OVER", chromeColor("danger"), 20);
        }
    };

    /*
     * The two states that are not really states: a level being built and a level being
     * restarted both end up in `ready`, and neither has anything to draw on its own.
     */
    states.readyLevel = {
        enter() {
            startLevel();
            game.switchState("ready");
        },
        update() {},
        draw() {}
    };

    states.readyRestart = {
        enter() {
            restartLevel();
            game.switchState("ready");
        },
        update() {},
        draw() {}
    };

    return states;
}