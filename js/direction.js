/*
 * Directions and the two rules every actor uses to pick a new heading.
 *
 * This is the heart of how the game feels. Both functions here are deliberately literal
 * transcriptions of the arcade's behaviour rather than anything tidier: the turn order,
 * the tie-break, and the "only reverse if there is somewhere to go" exception are all
 * quirks that players learn without ever being told.
 */

import { UP, LEFT, DOWN, RIGHT, DIR_VECTORS } from "./config.js";

export { UP, LEFT, DOWN, RIGHT };

/** The unit vector for a direction enum. */
export function vectorOf(dirEnum) {
    return DIR_VECTORS[dirEnum];
}

export const rotateLeft = (dirEnum) => (dirEnum + 1) % 4;
export const rotateRight = (dirEnum) => (dirEnum + 3) % 4;

/** Straight back the way it came. */
export const reverseOf = (dirEnum) => (dirEnum + 2) % 4;

/**
 * Which of the tiles around `tile` an actor may move into.
 *
 * `dirEnum` is the direction the actor is currently travelling, and it does more than
 * answer the question: the passage behind the actor is closed off, but *only* if there is
 * somewhere else to go. That exception is what lets the player reverse in a dead end
 * instead of walking into the wall, and it is why no maze needs a reversing alcove.
 *
 * The result is an object keyed by direction enum, so callers can both test openness and
 * count the options.
 */
export function openTiles(maze, tile, dirEnum) {
    const open = {
        [UP]: maze.isFloor(tile.x, tile.y - 1),
        [RIGHT]: maze.isFloor(tile.x + 1, tile.y),
        [DOWN]: maze.isFloor(tile.x, tile.y + 1),
        [LEFT]: maze.isFloor(tile.x - 1, tile.y)
    };

    if (dirEnum === undefined) return open;

    let count = 0;
    for (const dir of [UP, RIGHT, DOWN, LEFT]) {
        if (open[dir]) count++;
    }
    if (count > 1) open[reverseOf(dirEnum)] = false;

    return open;
}

/**
 * The open direction that takes an actor closest to its target tile.
 *
 * Squared euclidean distance is enough because only the ordering matters, and ties are
 * broken by the direction order — up, left, down, right — because the loop walks the
 * enums in order and only replaces the winner on a strictly smaller distance. That
 * priority is the arcade's, and it is why ghosts turn up before they turn left even when
 * both lead the same distance towards the target.
 */
export function turnClosestToTarget(tile, target, open) {
    let best = UP;
    let bestDistance = Infinity;

    for (const dir of [UP, LEFT, DOWN, RIGHT]) {
        if (!open[dir]) continue;
        const step = DIR_VECTORS[dir];
        const dx = step.x + tile.x - target.x;
        const dy = step.y + tile.y - target.y;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
            bestDistance = distance;
            best = dir;
        }
    }

    return best;
}

/** Whether the tile one step from `tile` in `dirEnum` can be walked on. */
export function nextIsFloor(maze, tile, dirEnum) {
    const step = DIR_VECTORS[dirEnum];
    return maze.isFloor(tile.x + step.x, tile.y + step.y);
}