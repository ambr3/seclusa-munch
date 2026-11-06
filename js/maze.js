/*
 * A playable maze: the tile grid, its pellets, its tunnels, and the outline of its walls.
 *
 * The wall outline is the only interesting part. There is no spritesheet and no image of
 * a maze anywhere in this game — the arcade walls are drawn, once, from the ASCII grid,
 * by tracing the edge of each block of wall tiles and turning corners into curves. It is
 * the same trick the original remake used, and it means a maze costs about eighty
 * character-typed lines to add.
 */

import { TILE, MID_TILE, COLS, ROWS } from "./config.js";
import { UP, DOWN, LEFT, RIGHT, vectorOf, rotateLeft, rotateRight } from "./direction.js";

const FLOOR_CHARS = " .o";

export class Maze {
    constructor(def) {
        this.def = def;
        this.cols = COLS;
        this.rows = ROWS;
        this.tiles = def.tiles;

        this.pelletColor = def.pellet;
        this.wallFill = def.wallFill;
        this.wallStroke = def.wallStroke;

        this.reset();
        this.countPellets();
        this.findTunnels();
        this.buildWallPaths();
    }

    /** Back to a full board of pellets. Called when a level starts. A lost life does not. */
    reset() {
        this.current = this.tiles.split("");
        this.dotsEaten = 0;
    }

    get width() {
        return this.cols * TILE;
    }

    get height() {
        return this.rows * TILE;
    }

    // ------------------------------------------------------------- tiles

    index(x, y) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return -1;
        return x + y * this.cols;
    }

    /**
     * The character at a tile, including the tiles just outside the maze that the
     * tunnels run through.
     *
     * Out there the walkable part of a tunnel row is floor and the wall beside it is a
     * wall, exactly as it is inside the maze. Getting this wrong is what makes an actor
     * "teleport" into a wall at the tunnel mouth.
     */
    getTile(x, y) {
        if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
            return this.current[this.index(x, y)];
        }
        if ((x < 0 || x >= this.cols) && (this.isTunnelTile(x, y - 1) || this.isTunnelTile(x, y + 1))) {
            return "|";
        }
        if (this.isTunnelTile(x, y)) return " ";
        return undefined;
    }

    /** The character at a tile on the *undisturbed* maze, for wall building. */
    getTileStatic(x, y) {
        const i = this.index(x, y);
        return i < 0 ? undefined : this.tiles[i];
    }

    isFloor(x, y) {
        const tile = this.getTile(x, y);
        return tile !== undefined && FLOOR_CHARS.indexOf(tile) >= 0;
    }

    // ------------------------------------------------------------ pellets

    countPellets() {
        this.totalPellets = 0;
        this.energizers = [];

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const tile = this.tiles[this.index(x, y)];
                if (tile === ".") {
                    this.totalPellets++;
                } else if (tile === "o") {
                    this.totalPellets++;
                    this.energizers.push({ x, y });
                }
            }
        }
    }

    dotsLeft() {
        return this.totalPellets - this.dotsEaten;
    }

    allEaten() {
        return this.dotsLeft() === 0;
    }

    /** Marks the pellet at a tile as eaten. Returns the points it was worth. */
    eat(x, y) {
        const i = this.index(x, y);
        if (i < 0) return null;
        const tile = this.current[i];
        if (tile !== "." && tile !== "o") return null;
        this.current[i] = " ";
        this.dotsEaten++;
        return tile;
    }

    // ------------------------------------------------------------ tunnels

    /**
     * Finds the rows that run off both edges of the maze.
     *
     * A row is a tunnel row when both its first and last tiles are walkable: that is the
     * signature, and it costs nothing to check. The entrances are then found by walking in
     * from each edge until the row stops being a corridor.
     */
    findTunnels() {
        this.tunnels = {};
        // Two tiles of margin outside each side, matching the arcade's screen wrap.
        const margin = 2 * TILE;

        const entranceFrom = (x, y, dx) => {
            while (!this.isFloor(x, y - 1) && !this.isFloor(x, y + 1) && this.isFloor(x, y)) {
                x += dx;
            }
            return x;
        };

        for (let y = 0; y < this.rows; y++) {
            if (!this.isFloor(0, y) || !this.isFloor(this.cols - 1, y)) continue;
            this.tunnels[y] = {
                leftEntrance: entranceFrom(0, y, 1),
                rightEntrance: entranceFrom(this.cols - 1, y, -1),
                leftExit: -margin,
                rightExit: (this.cols + 2) * TILE - 1
            };
        }
    }

    isTunnelTile(x, y) {
        const tunnel = this.tunnels[y];
        return !!tunnel && (x < tunnel.leftEntrance || x > tunnel.rightEntrance);
    }

    /** Wraps an actor that has walked off one end of a tunnel row to the other. */
    teleport(actor) {
        const tunnel = this.tunnels[actor.tile.y];
        if (!tunnel) return;
        if (actor.pixel.x < tunnel.leftExit) {
            actor.pixel.x = tunnel.rightExit;
        } else if (actor.pixel.x > tunnel.rightExit) {
            actor.pixel.x = tunnel.leftExit;
        }
    }

    // -------------------------------------------------------- wall outlines

    /*
     * Traces the outline of every wall block as a canvas path.
     *
     * Wall tiles are visited in reading order, so the first tile of each block reached
     * is always its top-left corner, and the walk starts heading right. From there the
     * right-hand rule does the rest: keeping the wall on the right walks the outline of
     * the block exactly once and returns to the start.
     *
     * Two details make the result look like the arcade rather than like a grid:
     *
     *   - The walk is offset half a tile to the left of the wall's centre line, and a
     *     further 5 pixels into any tile that has open floor beside it. That is what
     *     gives the walls their thickness and leaves the gaps at corners.
     *   - A turn becomes a curve. Each point after a turn carries the control point that
     *     bends the line into the corner, which is why the maze reads as rounded tubing
     *     instead of as boxes.
     */
    buildWallPaths() {
        const cols = this.cols;
        const rows = this.rows;

        // Wall tiles are indexed with a margin so the two tiles outside each side can
        // take part: the tunnel mouths need their wall drawn past the edge of the maze.
        const index = (x, y) => (x >= -2 && x < cols + 2 && y >= 0 && y < rows ? (x + 2) + y * (cols + 4) : -1);

        const at = (x, y) => {
            const i = index(x, y);
            return i < 0 ? undefined : this.getTileStatic(x, y);
        };

        // The edge of a wall block: a wall tile with any of its eight neighbours missing.
        const edges = new Set();
        for (let y = 0; y < rows; y++) {
            for (let x = -2; x < cols + 2; x++) {
                if (
                    at(x, y) === "|" &&
                    (at(x - 1, y) !== "|" ||
                        at(x + 1, y) !== "|" ||
                        at(x, y - 1) !== "|" ||
                        at(x, y + 1) !== "|" ||
                        at(x - 1, y - 1) !== "|" ||
                        at(x - 1, y + 1) !== "|" ||
                        at(x + 1, y - 1) !== "|" ||
                        at(x + 1, y + 1) !== "|")
                ) {
                    edges.add(index(x, y));
                }
            }
        }

        const visited = new Set();
        const paths = [];

        const trace = (tx, ty) => {
            let dirEnum;
            if (edges.has(index(tx + 1, ty))) dirEnum = RIGHT;
            else if (edges.has(index(tx, ty + 1))) dirEnum = DOWN;
            else return; // an isolated wall tile has no outline worth drawing

            tx += vectorOf(dirEnum).x;
            ty += vectorOf(dirEnum).y;

            const startX = tx;
            const startY = ty;
            const startDir = dirEnum;

            const path = [];
            let pad = 0;
            let turning = false;
            let last = null;

            const startPoint = (px, py, dir) => {
                const step = vectorOf(dir);
                // If the tile diagonally to the left is not part of this outline, then
                // there is something to hug, and if it is open floor the wall is pushed
                // further aside to leave a gap at the corner.
                if (!edges.has(index(px + step.y, py - step.x))) {
                    pad = this.isFloor(px + step.y, py - step.x) ? 5 : 0;
                }
                const ox = -TILE / 2 + pad;
                const oy = TILE / 2;
                const angle = -dir * (Math.PI / 2);
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                return {
                    x: ox * cos - oy * sin + (px + 0.5) * TILE,
                    y: ox * sin + oy * cos + (py + 0.5) * TILE
                };
            };

            for (;;) {
                visited.add(index(tx, ty));

                const point = startPoint(tx, ty, dirEnum);

                if (turning) {
                    if (vectorOf(dirEnum).x === 0) {
                        point.cx = point.x;
                        point.cy = last.y;
                    } else {
                        point.cx = last.x;
                        point.cy = point.y;
                    }
                }

                turning = false;
                let reversed = false;
                const step = vectorOf(dirEnum);
                if (edges.has(index(tx + step.y, ty - step.x))) {
                    dirEnum = rotateLeft(dirEnum);
                    turning = true;
                } else if (edges.has(index(tx + step.x, ty + step.y))) {
                    // straight on
                } else if (edges.has(index(tx - step.y, ty + step.x))) {
                    dirEnum = rotateRight(dirEnum);
                    turning = true;
                } else {
                    dirEnum = (dirEnum + 2) % 4;
                    reversed = true;
                }

                path.push(point);

                if (reversed) {
                    // A dead end has no edge to hug, so the two sides are joined by hand.
                    const back = vectorOf(dirEnum);
                    path.push(startPoint(tx - back.x, ty - back.y, (dirEnum + 2) % 4));
                    last = startPoint(tx, ty, dirEnum);
                    path.push(last);
                } else {
                    last = point;
                }

                tx += vectorOf(dirEnum).x;
                ty += vectorOf(dirEnum).y;

                if (tx === startX && ty === startY && dirEnum === startDir) {
                    paths.push(path);
                    break;
                }
            }
        };

        for (let y = 0; y < rows; y++) {
            for (let x = -2; x < cols + 2; x++) {
                const i = index(x, y);
                if (i >= 0 && edges.has(i) && !visited.has(i)) {
                    visited.add(i);
                    trace(x, y);
                }
            }
        }

        this.wallPaths = paths;
    }

    /** Where the ghost house door sits, and how it should be drawn. */
    get doorTile() {
        return { x: 13, y: 14 };
    }

    /** The row above the house floor, where ghosts wait to be let out. */
    get homeTopPixel() {
        return 17 * TILE;
    }

    get homeBottomPixel() {
        return 18 * TILE;
    }

    /** A maze-specific rule about which turns a ghost may take here, if it has one. */
    applyTurnConstraints(tile, open, dirEnum) {
        if (this.def.constrainTurns) this.def.constrainTurns(tile, open, dirEnum);
    }

    /** The pixel at the centre of a tile. */
    centerOf(x, y) {
        return { x: x * TILE + MID_TILE.x, y: y * TILE + MID_TILE.y };
    }
}

export { UP, DOWN, LEFT, RIGHT };