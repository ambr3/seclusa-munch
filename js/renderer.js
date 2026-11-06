/*
 * Everything that reaches the screen.
 *
 * The maze is drawn once into an offscreen canvas and blitted each frame. That is not an
 * optimisation for its own sake: the walls are traced outlines and the pellets are several
 * hundred rectangles, and re-deriving them at 60Hz is both slower and the reason a maze
 * flickers when the frame budget is tight. Only two things are drawn live — the energizers,
 * because they blink, and the actors, because they move — plus the text in the header.
 *
 * The pixel grid is the arcade's: 28 by 36 tiles of 8 pixels, with the top and bottom rows
 * left blank for the score and the lives. All the positions below are in that space, which
 * is why they read as tile coordinates times eight.
 */

import { TILE, MID_TILE, COLS, ROWS, PLAYER_COLOR, chromeColor } from "./config.js";

/** Radius of the fired pellet, in pixels. Half a tile is an energizer's size and
 *  reads as a second energizer on the board; this is between a pellet and one. */
const PELLET_RADIUS = 2;
import {
    drawPacman,
    drawPacmanDying,
    drawGhost,
    drawFruit,
    drawScore,
} from "./sprites.js";
import { LEFT } from "./direction.js";

/** Black border around the maze, in the arcade's screen layout. */
const SCREEN_MARGIN = 4 * TILE;
/** Half-pixel padding so the tunnel walls are not clipped at the screen edge. */
const MAP_PAD = TILE / 8;

const MAP_WIDTH = COLS * TILE + MAP_PAD * 2;
const MAP_HEIGHT = ROWS * TILE + MAP_PAD * 2;
const SCREEN_WIDTH = MAP_WIDTH + SCREEN_MARGIN * 2;
const SCREEN_HEIGHT = MAP_HEIGHT + SCREEN_MARGIN * 2;

/*
 * The three text styles on screen, in the app's own typeface.
 *
 * They are declared in theme.css next to the @font-face rules, the same weights the
 * launcher and the other games use. The arcade face this game used to carry is gone: it
 * was a pixel font that only looked right scaled by an integer factor, and it made this
 * one game read as a different app.
 */
const FONT = '700 8px Sora, "DM Sans", system-ui, sans-serif';
const PROMPT_FONT = '600 8px Sora, "DM Sans", system-ui, sans-serif';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.background = document.createElement("canvas");
        this.bg = this.background.getContext("2d");
        this.scale = 1;
        this.frame = 0;

        // The canvas is centred by the page rather than by writing a margin onto <body>:
        // the page has a shell above it, and a body margin would fight with it.
        canvas.style.position = "fixed";
        canvas.style.inset = "0";
        canvas.style.margin = "auto";

        this.resize();
    }

    /** The largest whole look that fits the window, re-computed on every resize. */
    resize() {
        const foot = document.querySelector(".game-foot");
        const footH = foot ? foot.offsetHeight : 0;
        const available = Math.max(1, Math.min(window.innerWidth - 8, window.innerHeight - footH - 8));
        this.scale = Math.max(0.5, available / SCREEN_HEIGHT);
        if (SCREEN_WIDTH * this.scale > available) this.scale = available / SCREEN_WIDTH;
        this.canvas.style.inset = `0 0 ${footH}px 0`;

        this.canvas.width = Math.round(SCREEN_WIDTH * this.scale);
        this.canvas.height = Math.round(SCREEN_HEIGHT * this.scale);
        this.canvas.style.width = `${this.canvas.width}px`;
        this.canvas.style.height = `${this.canvas.height}px`;

        // The stylesheet keeps the canvas invisible until this class is on it, so an
        // unsized 300x150 default never flashes in the corner of the page. The game knows
        // when it has sized the canvas, so the game says so.
        this.canvas.classList.add("canvas-ready");

        this.background.width = Math.round(MAP_WIDTH * this.scale);
        this.background.height = Math.round(MAP_HEIGHT * this.scale);

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(this.scale, this.scale);
        this.bg.setTransform(1, 0, 0, 1, 0, 0);
        this.bg.scale(this.scale, this.scale);
        this.bg.translate(MAP_PAD, MAP_PAD);
    }

    get width() {
        return MAP_WIDTH;
    }

    get height() {
        return MAP_HEIGHT;
    }

    /** Called once per drawn frame: black screen, and a transform into maze space. */
    beginFrame() {
        this.frame++;
        const ctx = this.ctx;
        ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        ctx.translate(SCREEN_MARGIN + MAP_PAD, SCREEN_MARGIN + MAP_PAD);
    }

    // ------------------------------------------------------------- the maze

    /**
     * Draws the maze into the offscreen canvas.
     *
     * Called on a new level and after a death. The walls are the traced outlines from
     * Maze; the pellets are a two-pixel square each; the ghost house door is a two-pixel
     * pink bar drawn where two `-` characters sit in the ASCII.
     *
     * The offscreen canvas is the *map*, not the screen: it is blitted inside the black
     * border, so everything here is in map space — tile coordinates times eight, with the
     * top and bottom rows of blank tiles left for the header and the lives.
     */
    drawMap(game) {
        const bg = this.bg;
        const maze = game.maze;

        bg.setTransform(this.scale, 0, 0, this.scale, 0, 0);
        bg.fillStyle = "#000000";
        bg.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
        bg.save();
        bg.translate(MAP_PAD, MAP_PAD);

        // The door, found the way the arcade found it — two adjacent `-` characters — and
        // drawn a step lighter than the walls rather than in the arcade's pink, which is the
        // one colour in this game that belonged to nobody's palette.
        bg.fillStyle = chromeColor("dim");
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS - 1; x++) {
                if (maze.current[maze.index(x, y)] === "-" && maze.current[maze.index(x + 1, y)] === "-") {
                    bg.fillRect(x * TILE, y * TILE + TILE - 2, TILE * 2, 2);
                }
            }
        }

        const flash = game.flashLevel;
        bg.fillStyle = flash ? "#000000" : maze.wallFill;
        bg.strokeStyle = flash ? "#FFFFFF" : maze.wallStroke;

        for (const path of maze.wallPaths) {
            bg.beginPath();
            bg.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) {
                const point = path[i];
                if (point.cx !== undefined) bg.quadraticCurveTo(point.cx, point.cy, point.x, point.y);
                else bg.lineTo(point.x, point.y);
            }
            const last = path[path.length - 1];
            bg.quadraticCurveTo(last.x, path[0].y, path[0].x, path[0].y);
            bg.fill();
            bg.stroke();
        }

        // Pellets. Energizers are left out: they blink, so they are drawn per frame.
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                if (maze.current[maze.index(x, y)] !== ".") continue;
                bg.fillStyle = maze.pelletColor;
                bg.fillRect(x * TILE + MID_TILE.x, y * TILE + MID_TILE.y, 2, 2);
            }
        }

        this.drawLives(game);
        this.drawFruitHistory(game);
        this.drawLevel(game);

        bg.restore();
    }

    /** The lives in the bottom left, at 85% so they sit inside the blank rows. */
    drawLives(game) {
        if (game.extraLives <= 0) return;

        const ctx = this.bg;
        ctx.save();
        ctx.translate(3 * TILE, (ROWS - 1) * TILE);
        ctx.scale(0.85, 0.85);
        for (let i = 0; i < game.extraLives; i++) {
            drawPacman(ctx, 0, 0, LEFT, 1, { color: game.player.color });
            ctx.translate(2 * TILE, 0);
        }
        ctx.restore();
    }

    /**
     * Shots banked, along the bottom row after the lives.
     *
     * Drawn per frame rather than into the background, because the count changes the
     * moment an energizer is eaten or a pellet fired, and a row baked into the background
     * would show a stale tally for the rest of the level.
     *
     * Anchored exactly where `drawLives()` anchors — same translate, same 0.85 scale —
     * because it continues the lives row rather than starting a grid of its own. That is
     * why the dot is not identical to an energizer on the board: a board energizer is
     * centred on its tile's middle line at full size, and this one is a tile origin at
     * 85%. Close enough to read as the same thing, which is the point.
     */
    drawBankedPellets(game) {
        const held = game.player.heldPellets;
        if (!held) return;

        const ctx = this.ctx;
        const scale = 0.85;
        ctx.save();
        ctx.translate(3 * TILE + game.extraLives * 2 * TILE, (ROWS - 1) * TILE);
        ctx.scale(scale, scale);
        ctx.fillStyle = game.maze.pelletColor;
        for (let i = 0; i < held; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, TILE / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.translate(2 * TILE, 0);
        }
        ctx.restore();
    }

    /**
     * The bonus earned so far, along the bottom right: the fruit for the last seven
     * levels, so the row fills up as the game goes on.
     */
    drawFruitHistory(game) {
        const ctx = this.bg;
        const shown = 7;
        const scale = 0.85;

        for (let i = 0, level = Math.max(1, game.level - shown + 1); i < shown && level <= game.level; level++, i++) {
            const fruit = game.fruit.history[level];
            if (!fruit) continue;
            ctx.save();
            ctx.translate((COLS - 3) * TILE - i * 16 * scale, (ROWS - 1) * TILE);
            ctx.scale(scale, scale);
            drawFruit(ctx, 0, 0, fruit.name);
            ctx.restore();
        }
    }

    /** The level number, which only stops being one digit at level 100. */
    drawLevel(game) {
        const ctx = this.bg;
        ctx.font = game.level >= 100 ? "6px DM Sans, sans-serif" : "8px DM Sans, sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillStyle = chromeColor("faint");
        ctx.fillText(String(game.level), (COLS - 2) * TILE, (ROWS - 1) * TILE);
    }

    /**
     * Copies the offscreen maze onto the screen.
     *
     * The scale is undone first so the image is copied pixel for pixel. The background
     * canvas holds the map already padded by MAP_PAD, and it lands back on its own origin
     * at zero, so there is no offset to compensate for.
     */
    blitMap() {
        const ctx = this.ctx;
        ctx.save();
        ctx.scale(1 / this.scale, 1 / this.scale);
        ctx.drawImage(this.background, 0, 0);
        ctx.restore();
    }

    /**
     * The pellet in flight.
     *
     * A circle on the same centre line as the energizers it came from, rather
     * than a two-pixel square like an ordinary pellet: a shot crossing a
     * corridor full of pellets has to be findable at a glance, and a square the
     * size of the things it passes among is not.
     */
    drawPellet(game) {
        const pellet = game.pellet;
        if (!pellet) return;

        const ctx = this.ctx;
        ctx.fillStyle = chromeColor();
        ctx.beginPath();
        ctx.arc(pellet.pixel.x, pellet.pixel.y, PELLET_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Erases a pellet that has just been eaten.
     *
     * The transform is set rather than assumed: this is called between frames, from the
     * eating code, and drawing into the offscreen canvas in the wrong space would wipe a
     * piece of wall instead of the pellet and leave the pellet on screen.
     */
    erasePellet(x, y) {
        const bg = this.bg;
        bg.setTransform(this.scale, 0, 0, this.scale, 0, 0);
        bg.translate(MAP_PAD, MAP_PAD);
        bg.fillStyle = "#000000";
        bg.fillRect(x * TILE + MID_TILE.x - 1, y * TILE + MID_TILE.y - 1, 4, 4);
    }

    /**
     * The energizers, drawn live on top of the maze.
     *
     * They blink on the arcade board. Here they do not: at this scale a ten-frame blink
     * reads as a flicker rather than as a pulse, and it leaves the one thing moving on an
     * otherwise still board, so the eye goes to it instead of to the ghosts.
     */
    drawEnergizers(game) {
        const ctx = this.ctx;
        ctx.fillStyle = game.maze.pelletColor;
        for (const { x, y } of game.maze.energizers) {
            if (game.maze.current[game.maze.index(x, y)] !== "o") continue;
            ctx.beginPath();
            ctx.arc(x * TILE + MID_TILE.x, y * TILE + MID_TILE.y, TILE / 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ---------------------------------------------------------------- actors

    /**
     * The actors, in the order the arcade drew them.
     *
     * Normally the player is drawn first and the ghosts over him, so a ghost that shares a
     * tile with him is the one you see — which is how you know to be afraid. During a
     * fright the order flips and he is on top, because now the question is which ghost is
     * safe to eat and the ghosts need to stay readable through him.
     */
    drawActors(game) {
        const frightened = game.energizer.active;

        if (frightened) {
            for (const ghost of game.ghosts) this.drawGhost(game, ghost);
            if (game.energizer.showingPoints) {
                drawScore(this.ctx, game.player.pixel.x, game.player.pixel.y, game.energizer.points);
            } else {
                this.drawPlayer(game);
            }
            return;
        }

        this.drawPlayer(game);
        for (let i = game.ghosts.length - 1; i >= 0; i--) this.drawGhost(game, game.ghosts[i]);
    }

    drawPlayer(game) {
        const pac = game.player;
        drawPacman(this.ctx, pac.pixel.x, pac.pixel.y, pac.dirEnum, pac.getMouthFrame());
    }

    drawGhost(game, ghost) {
        if (!ghost.isVisible) return;
        drawGhost(this.ctx, ghost.pixel.x, ghost.pixel.y, {
            index: ghost.index,
            frame: Math.floor(ghost.frames / 8) % 2,
            dirEnum: ghost.faceDirEnum,
            color: ghost.color,
            scared: ghost.scared,
            flashing: game.energizer.flashing,
            eyesOnly: ghost.isEyesOnly
        });
    }

    /**
     * A ghost drawn as a portrait, for the title screen.
     *
     * The same sprite at a supplied frame counter, with nothing about its position: the
     * cast on the attract screen is not in the maze and has no state to read. The row is
     * laid out from `rowLeft` so the caller owns where the cast stands and the player
     * sprite can be lined up with it.
     */
    drawGhostAt(ctx, ghost, frame, rowLeft, rowCentre) {
        drawGhost(ctx, rowLeft + (ghost.index + 1) * 20, rowCentre, {
            index: ghost.index,
            frame: Math.floor(frame / 8) % 2,
            dirEnum: 3,
            color: ghost.color
        });
    }

    /** The dying animation, `t` running 0 to 1 across the whole sequence. */
    drawDeath(game, t) {
        drawPacmanDying(this.ctx, game.player.pixel.x, game.player.pixel.y, game.player.dirEnum, t);
    }

    /** The bonus fruit, or the score left behind by the last one eaten. */
    drawFruit(game) {
        const fruit = game.fruit;
        if (fruit.isPresent) {
            drawFruit(this.ctx, fruit.pixel.x, fruit.pixel.y, fruit.current.name);
        } else if (fruit.isScorePresent) {
            drawScore(this.ctx, fruit.pixel.x, fruit.pixel.y, fruit.current.points);
        }
    }

    // ------------------------------------------------------------------- hud

    /**
     * The header: 1UP, HIGH SCORE, and the two numbers.
     *
     * Right-aligned, because that is how the arcade did it and it keeps the digits from
     * shuffling left and right as they grow.
     */
    drawScore(game) {
        const ctx = this.ctx;
        ctx.font = FONT;
        ctx.textBaseline = "top";
        ctx.textAlign = "right";
        ctx.fillStyle = chromeColor();

        ctx.fillText("1UP", 6 * TILE, 0);
        ctx.fillText("HIGH SCORE", 19 * TILE, 0);

        const y = TILE + 1;
        ctx.fillText(game.score === 0 ? "00" : String(game.score), 7 * TILE, y);
        ctx.fillText(game.highScore === 0 ? "00" : String(game.highScore), 17 * TILE, y);
    }

    /**
     * A message centred on the maze, `tileY` in tile coordinates.
     *
     * Centred by the canvas rather than by arithmetic on the string's length. The arcade
     * could afford a per-string column and a trailing space, because its font was one fixed
     * bitmap; this is a proportional face, so the width of a label is not its length, and
     * a column tuned to one string silently mis-centres the next one that changes length.
     */
    drawMessage(text, color, tileY) {
        const ctx = this.ctx;
        ctx.font = FONT;
        ctx.textBaseline = "top";
        ctx.textAlign = "center";
        ctx.fillStyle = color;
        ctx.fillText(text, MAP_WIDTH / 2, tileY * TILE);
    }

    /** READY!, with the exclamation as a glyph rather than the arcade's hand-drawn sprite. */
    drawReady() {
        this.drawMessage("READY!", chromeColor(), 20);
    }

    /** Darkens the screen, for the fades between states. */
    overlay(alpha) {
        const ctx = this.ctx;
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillRect(-MAP_PAD, -MAP_PAD, MAP_WIDTH, MAP_HEIGHT);
    }
}

export { SCREEN_WIDTH, SCREEN_HEIGHT, MAP_WIDTH, MAP_HEIGHT, FONT, PROMPT_FONT };