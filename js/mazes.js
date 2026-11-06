/*
 * The maze.
 *
 * One maze, character by character, exactly as the 1980 board had it — including the
 * pellets in the corners that a maze generator would have "tidied". The layout is the
 * puzzle, and a cleaned-up layout is a different game.
 *
 * Each tile is one character:
 *
 *   |  wall          .  pellet         o  energizer
 *   ' '  floor       -  ghost house door    _  outside the maze, never drawn
 *
 * What is this game's own is the palette and the names: grey walls on black, warm
 * pellets, and four ghosts called Rook, Pip, Nix and Bram.
 */

import { UP, DOWN, LEFT, RIGHT } from "./direction.js";

export const MAZE = {
    id: "munch",
    name: "SECLUSA MUNCH",
    /*
     * The board is always black -- `theme.css` pins `html` to #000 for this game in both
     * themes -- so these two are not palette values and must not be read as such.
     *
     * `wallFill` is the wall body, and black is what makes a wall a hole in the board
     * rather than a block sitting on it.
     *
     * `wallStroke` is the only thing that makes the maze readable, and it was the last
     * hard-coded colour left in the game: an indigo nobody had chosen, reachable from no
     * setting, sitting on a board that is black-and-white everywhere else.
     *
     * The replacement is NOT the same brightness and that is deliberate: `#5C6BC0` had a
     * relative luminance of 0.17 and this has 0.37, so the walls read roughly twice as
     * bright as well as grey. A neutral at the old luminance would have been a muddy
     * mid-grey that read as disabled rather than as a wall. Against the black board this
     * is a wall; against a dark palette a dimmer one is not.
     *
     * It is a constant rather than a theme role because the board it has to read against
     * does not change with the theme -- a themed stroke would be near-black on a black
     * board in light mode, which is the one combination that cannot work.
     */
    wallFill: "#000000",
    wallStroke: "#A3A3A3",
    pellet: "#FFE0B2",
    tiles:
        "____________________________" +
        "____________________________" +
        "____________________________" +
        "||||||||||||||||||||||||||||" +
        "|............||............|" +
        "|.||||.|||||.||.|||||.||||.|" +
        "|o||||.|||||.||.|||||.||||o|" +
        "|.||||.|||||.||.|||||.||||.|" +
        "|..........................|" +
        "|.||||.||.||||||||.||.||||.|" +
        "|.||||.||.||||||||.||.||||.|" +
        "|......||....||....||......|" +
        "||||||.||||| || |||||.||||||" +
        "_____|.||||| || |||||.|_____" +
        "_____|.||          ||.|_____" +
        "_____|.|| |||--||| ||.|_____" +
        "||||||.|| |______| ||.||||||" +
        "      .   |______|   .      " +
        "||||||.|| |______| ||.||||||" +
        "_____|.|| |||||||| ||.|_____" +
        "_____|.||          ||.|_____" +
        "_____|.|| |||||||| ||.|_____" +
        "||||||.|| |||||||| ||.||||||" +
        "|............||............|" +
        "|.||||.|||||.||.|||||.||||.|" +
        "|.||||.|||||.||.|||||.||||.|" +
        "|o..||.......  .......||..o|" +
        "|||.||.||.||||||||.||.||.|||" +
        "|||.||.||.||||||||.||.||.|||" +
        "|......||....||....||......|" +
        "|.||||||||||.||.||||||||||.|" +
        "|.||||||||||.||.||||||||||.|" +
        "|..........................|" +
        "||||||||||||||||||||||||||||" +
        "____________________________" +
        "____________________________",

    /*
     * Four tiles above the ghost house and two more at the bottom are the only places a
     * ghost may not choose to turn upwards. They exist to stop a chase that has lined up
     * perfectly on the long horizontal corridor from dropping into the house entrance and
     * ending the chase for free.
     */
    constrainTurns(tile, open) {
        if ((tile.x === 12 || tile.x === 15) && (tile.y === 14 || tile.y === 26)) {
            open[UP] = false;
        }
    }
};

/** The maze a level is played on. There is only one; this keeps the call site readable. */
export function mazeForLevel() {
    return { ...MAZE };
}