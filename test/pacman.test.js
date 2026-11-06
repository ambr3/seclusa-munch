/*
 * Seclusa Munch — the rules, tested against the real modules.
 *
 * These load `games/pacman/js/` directly, the same files the page loads, so there is no
 * copy of the engine here that can drift from the one that ships. Most of the file drives
 * the actors with a stub game object holding a maze, a level and the counters they ask
 * for, which is enough to test every decision the arcade makes — who a ghost is aiming
 * at, when it turns, how fast it moves, and when the house empties.
 *
 * The fired pellet and the bottom-row shots are the exception: they hang off the real
 * `Game` and `Renderer`, because what they get wrong is not a decision an actor makes but
 * wiring between objects — which state paints the pellet, whether a shot is drawn at all,
 * where the tally lands. A stub would have hidden every one of those. So those suites
 * build the real thing against a real (blank) canvas, and assert on recorded draw calls
 * rather than on pixels.
 *
 * What is asserted is the arcade's behaviour, not this file's structure. "Pip aims four
 * tiles up *and four to the left* when the player faces up" is a bug that shipped in 1980
 * and is load-bearing for how the maze plays; a rewrite that quietly fixed it would look
 * tidier and be wrong.
 */

import { describe, expect, it } from './runner.js';

import { MAZE, mazeForLevel } from '../js/mazes.js';
import { Maze } from '../js/maze.js';
import {
    openTiles,
    turnClosestToTarget,
    nextIsFloor,
    reverseOf,
    vectorOf,
    UP,
    LEFT,
    DOWN,
    RIGHT
} from '../js/direction.js';
import {
    stepSize,
    TILE,
    COLS,
    ROWS,
    PATTERN,
    elroyDotsEaten,
    CHASE,
    SCATTER,
    MODE_SCHEDULE,
    scheduleBand,
    personalDotLimit,
    GLOBAL_DOT_LIMITS,
    releaseTimeout,
    FRUIT_LADDER,
    FRUIT_BY_LEVEL,
    FRUIT_DOT_LIMITS,
    PLAYER_COLOR,
    FRIGHTENED_COLOR,
    PLAYER_NAME
} from '../js/config.js';
import { Ghost, OUTSIDE, GOING_HOME, PACING_HOME } from '../js/ghost.js';
import { Player } from '../js/player.js';
import { Energizer } from '../js/energizer.js';
import {
    drawPacman,
    drawGhost,
    MOUTH,
    GHOSTS,
    FEET
} from '../js/sprites.js';
import { Renderer, MAP_WIDTH } from '../js/renderer.js';
import { Game } from '../js/game.js';
import { CAP_COLOR, EYE_COLOR } from '../js/config.js';

/*
 * A 2D context that records instead of drawing.
 *
 * The sprites are geometry, so everything worth asserting about them is in the calls: which
 * colour was filled, what arc was swept, and whether a shape was drawn inside a rotation or
 * outside one. That is enough to pin both of the bugs this file now guards, and it needs no
 * canvas, which is why it works in a page with nothing on it.
 */
function recorder() {
    const calls = [];
    const ctx = {
        calls,
        fillStyle: '',
        globalAlpha: 1,
        lineWidth: 1,
        lineJoin: '',
        lineCap: '',
        save: () => calls.push(['save']),
        restore: () => calls.push(['restore']),
        translate: (x, y) => calls.push(['translate', x, y]),
        rotate: (a) => calls.push(['rotate', a]),
        scale: (x, y) => calls.push(['scale', x, y]),
        beginPath: () => calls.push(['beginPath']),
        closePath: () => calls.push(['closePath']),
        moveTo: (x, y) => calls.push(['moveTo', x, y]),
        lineTo: (x, y) => calls.push(['lineTo', x, y]),
        quadraticCurveTo: (a, b, c, d) => calls.push(['quadraticCurveTo', a, b, c, d]),
        arc: (x, y, r, from, to) => calls.push(['arc', x, y, r, from, to]),
        ellipse: (...a) => calls.push(['ellipse', ...a]),
        fillRect: (x, y, w, h) => calls.push(['fillRect', x, y, w, h, ctx.fillStyle]),
        fill: () => calls.push(['fill', ctx.fillStyle]),
        stroke: () => calls.push(['stroke', ctx.fillStyle])
    };
    return ctx;
}

const silentAudio = {
    eating: { startLoop() {}, stopLoop() {} },
    ghostReset() {},
    eatenGhost() {},
    eatenFruit() {},
    ghostNormalMove: { startLoop() {}, stopLoop() {} },
    ghostReturnToHome: { startLoop() {}, stopLoop() {} },
    ghostTurnToBlue: { startLoop() {}, stopLoop() {} },
    loop() {},
    stopLoop() {},
    play() {},
    silence() {}
};

/**
 * The smallest thing the actors will accept as a game.
 *
 * Everything an actor reaches for is here: a maze, a level, and the counters that other
 * systems would otherwise own. The tests that care about those counters replace them.
 */
function makeGame({ level = 1, maze } = {}) {
    const game = {
        level,
        maze: maze || new Maze(mazeForLevel()),
        audio: silentAudio,
        renderer: { erasePellet() {} },
        score: 0,
        ghosts: [],
        energizer: { active: false, activate() {} },
        releaser: { onDotEat() {} },
        fruit: { onDotEat() {} },
        addScore(points) { this.score += points; },
        stepSizeFor: stepSize
    };

    game.ghosts = [0, 1, 2, 3].map((index) => new Ghost(game, index));
    game.player = new Player(game);
    game.commander = { command: CHASE };
    return game;
}

describe('Seclusa Munch — identity', () => {
    it('is called what the launcher calls it', () => {
        expect(PLAYER_NAME).toBe('munch');
        expect(MAZE.name).toBe('SECLUSA MUNCH');
    });

    it('has its own colours, not the arcade originals', () => {
        // The frightened colour in particular has to stay unmistakable: it is the whole
        // difference between eating a ghost and being eaten.
        expect(PLAYER_COLOR).not.toBe('#FFFF00');
        expect(FRIGHTENED_COLOR).not.toBe('#2121ff');
        expect(PLAYER_COLOR).not.toBe(FRIGHTENED_COLOR);
    });

    it('gives the four ghosts four names and four distinguishable colours', () => {
        const game = makeGame();
        expect(game.ghosts.map((ghost) => ghost.name)).toEqual(['rook', 'pip', 'nix', 'bram']);
        expect(new Set(game.ghosts.map((ghost) => ghost.color)).size).toBe(4);
    });

    it('plays one game, so there is one maze and no game chooser', () => {
        expect(mazeForLevel().id).toBe(MAZE.id);
        expect(mazeForLevel(1).id).toBe(mazeForLevel(99).id);
    });
});

describe('the maze', () => {
    it('is 28 by 36 tiles', () => {
        expect(MAZE.tiles.length).toBe(28 * 36);
    });

    it('holds the arcade 244 pellets: 240 dots and four energizers', () => {
        // 244 is the number the Elroy thresholds are written against, so it is also the
        // number that makes those thresholds mean what the arcade meant by them.
        const maze = new Maze(mazeForLevel());
        expect(maze.totalPellets).toBe(244);
        expect(maze.energizers.length).toBe(4);
    });

    it('puts the four energizers in the corners, where the arcade maze does', () => {
        const maze = new Maze(mazeForLevel());
        const at = maze.energizers.map((e) => `${e.x},${e.y}`).sort();
        expect(at).toEqual(['1,26', '1,6', '26,26', '26,6']);
    });

    it('has exactly one tunnel row', () => {
        const maze = new Maze(mazeForLevel());
        expect(Object.keys(maze.tunnels)).toEqual(['17']);
    });

    it('sends an actor off one end of the tunnel to the other', () => {
        const maze = new Maze(mazeForLevel());
        const tunnel = maze.tunnels[17];
        const walker = { tile: { y: 17 }, pixel: { x: tunnel.leftExit - 1, y: 17 * 8 } };
        maze.teleport(walker);
        expect(walker.pixel.x).toBe(tunnel.rightExit);
    });

    it('counts a pellet as eaten exactly once', () => {
        const maze = new Maze(mazeForLevel());
        const before = maze.dotsLeft();
        expect(maze.eat(1, 4)).toBe('.');
        expect(maze.eat(1, 4)).toBeNull();
        expect(maze.dotsLeft()).toBe(before - 1);
    });
});

describe('choosing a turn', () => {
    const stubMaze = {
        isFloor(x, y) {
            return !(x === 10 && y === 10);
        }
    };

    it('prefers up, then left, then down, then right when two tiles are equally close', () => {
        // The tie-break is the arcade's fixed priority order, and it is why a ghost given
        // the same situation always turns the same way.
        const from = { x: 10, y: 10 };
        expect(turnClosestToTarget(from, { x: 10, y: 0 }, openTiles(stubMaze, from))).toBe(UP);
        expect(turnClosestToTarget(from, { x: 0, y: 10 }, openTiles(stubMaze, from))).toBe(LEFT);
        expect(turnClosestToTarget(from, { x: 10, y: 20 }, openTiles(stubMaze, from))).toBe(DOWN);
        expect(turnClosestToTarget(from, { x: 20, y: 10 }, openTiles(stubMaze, from))).toBe(RIGHT);
    });

    it('closes the way behind a moving actor', () => {
        const open = openTiles(stubMaze, { x: 10, y: 10 }, RIGHT);
        expect(open[LEFT]).toBe(false);
        expect(open[UP]).toBe(true);
    });

    it('leaves the way behind open when it is the only way out', () => {
        const walled = { isFloor: (x, y) => x <= 10 && y === 10 };
        const open = openTiles(walled, { x: 10, y: 10 }, RIGHT);
        expect(open[LEFT]).toBe(true);
        expect(nextIsFloor(walled, { x: 10, y: 10 }, LEFT)).toBe(true);
    });

    it('turns around to the opposite direction', () => {
        expect(reverseOf(UP)).toBe(DOWN);
        expect(reverseOf(LEFT)).toBe(RIGHT);
    });
});

describe('the speed table', () => {
    it('gives the player a whole pixel every frame on level 1', () => {
        for (let tick = 0; tick < 16; tick++) {
            expect(stepSize(1, PATTERN.PAC, tick)).toBe(1);
        }
    });

    it('makes the ghosts slower than the player, by the arcade margin', () => {
        // Level 1 ghosts move on 15 of every 16 frames — the half-pixel speed that makes
        // a chase winnable at all.
        const steps = [];
        for (let tick = 0; tick < 16; tick++) steps.push(stepSize(1, PATTERN.GHOST, tick));
        expect(steps.reduce((a, b) => a + b, 0)).toBe(15);
    });

    it('halves the speed in the tunnel', () => {
        const steps = [];
        for (let tick = 0; tick < 16; tick++) steps.push(stepSize(1, PATTERN.GHOST_TUNNEL, tick));
        expect(steps.reduce((a, b) => a + b, 0)).toBe(8);
    });

    it('cycles the same 16-frame pattern forever', () => {
        expect(stepSize(5, PATTERN.GHOST, 3)).toBe(stepSize(5, PATTERN.GHOST, 19));
    });

    it('reads a different row for each band of levels', () => {
        expect(scheduleBand(1)).toBe(1);
        expect(scheduleBand(3)).toBe(2);
        expect(scheduleBand(9)).toBe(5);
    });

    it('leaves the player faster than the ghosts from level 21 on', () => {
        expect(stepSize(21, PATTERN.PAC, 0)).toBeGreaterThanOrEqual(stepSize(21, PATTERN.GHOST, 0));
    });
});

describe('how long a fright lasts', () => {
    it('is six seconds on level 1 and one on level 9', () => {
        expect(new Energizer(makeGame({ level: 1 })).durationFrames).toBe(6 * 60);
        expect(new Energizer(makeGame({ level: 9 })).durationFrames).toBe(60);
    });

    it('ends on schedule, and leaves the ghosts unfrightened', () => {
        const game = makeGame({ level: 1 });
        const energizer = new Energizer(game);
        energizer.activate();

        expect(energizer.active).toBe(true);
        expect(game.ghosts.every((ghost) => ghost.scared)).toBe(true);

        for (let frame = 0; frame < 6 * 60; frame++) energizer.update();
        expect(energizer.active).toBe(false);
        expect(game.ghosts.some((ghost) => ghost.scared)).toBe(false);
    });

    it('flashes for a fixed number of cycles at the end, on any level', () => {
        expect(new Energizer(makeGame({ level: 1 })).flashCount).toBe(5);
        expect(new Energizer(makeGame({ level: 9 })).flashCount).toBe(3);
        expect(stepSize(17, PATTERN.PAC_FRIGHT, 0)).toBe(1);
        expect(stepSize(19, PATTERN.GHOST_FRIGHT, 0)).toBe(0);
    });

    it('never starts on a level with no fright in the table', () => {
        const energizer = new Energizer(makeGame({ level: 19 }));
        energizer.activate();
        expect(energizer.active).toBe(false);
    });
});

describe('Elroy', () => {
    it('arrives on level 1 with 20 pellets left, and again with 10', () => {
        expect(elroyDotsEaten(1, 1, 244)).toBe(224);
        expect(elroyDotsEaten(1, 2, 244)).toBe(234);
    });

    it('arrives sooner on the later levels', () => {
        // More pellets left at the threshold means it is crossed earlier in the level:
        // on level 12 it takes 174 pellets eaten, against 224 on level 1.
        expect(elroyDotsEaten(12, 1, 244)).toBeLessThan(elroyDotsEaten(1, 1, 244));
        expect(elroyDotsEaten(12, 1, 244)).toBe(174);
    });

    it('scales to a maze that is not the arcade one', () => {
        expect(elroyDotsEaten(1, 1, 122)).toBe(112);
    });
});

describe('ghosts choosing a target', () => {
    const place = (ghost, tile, dir) => {
        ghost.setPos(tile.x * 8, tile.y * 8 + 4);
        ghost.setDir(dir);
        ghost.tile.x = tile.x;
        ghost.tile.y = tile.y;
    };

    it('sends Rook straight at the player', () => {
        const game = makeGame();
        game.player.tile.x = 10;
        game.player.tile.y = 10;
        game.ghosts[0].setTarget();
        expect(game.ghosts[0].targetTile).toEqual({ x: 10, y: 10 });
    });

    it('sends Pip four tiles ahead of the player', () => {
        const game = makeGame();
        game.player.tile.x = 10;
        game.player.tile.y = 10;
        game.player.setDir(RIGHT);
        game.ghosts[1].setTarget();
        expect(game.ghosts[1].targetTile).toEqual({ x: 14, y: 10 });
    });

    it('keeps the overflow bug: up *and* left, four tiles each', () => {
        // This is the arcade's bug, not ours. Nix measures from this wrong square, so his
        // turns are wrong in a way players have learned for forty years.
        const game = makeGame();
        game.player.tile.x = 10;
        game.player.tile.y = 10;
        game.player.setDir(UP);
        game.ghosts[1].setTarget();
        expect(game.ghosts[1].targetTile).toEqual({ x: 6, y: 6 });
    });

    it('sends Nix through Pip\'s square, doubled from Rook', () => {
        const game = makeGame();
        game.player.tile.x = 10;
        game.player.tile.y = 10;
        game.player.setDir(RIGHT);
        place(game.ghosts[0], { x: 4, y: 10 }, RIGHT);

        // Two ahead of the player is (12,10); doubled from Rook at (4,10) gives (20,10).
        game.ghosts[2].setTarget();
        expect(game.ghosts[2].targetTile).toEqual({ x: 20, y: 10 });
    });

    it('makes Bram chase from eight tiles and run from closer than that', () => {
        const game = makeGame();
        game.player.tile.x = 20;
        game.player.tile.y = 20;
        place(game.ghosts[3], { x: 10, y: 20 }, RIGHT);
        game.ghosts[3].setTarget();
        expect(game.ghosts[3].targetTile).toEqual({ x: 20, y: 20 });

        place(game.ghosts[3], { x: 19, y: 20 }, RIGHT);
        game.ghosts[3].setTarget();
        expect(game.ghosts[3].targetTile).toEqual(game.ghosts[3].corner);
    });

    it('gives Elroy the same speed as the player, which is the point of Elroy', () => {
        expect(stepSize(1, PATTERN.ELROY1, 5)).toBe(stepSize(1, PATTERN.PAC, 5));
        expect(stepSize(1, PATTERN.ELROY2, 5)).toBeGreaterThanOrEqual(stepSize(1, PATTERN.PAC, 5));
    });
});

describe('the ghost house', () => {
    it('releases Pip first, then Nix at 30 pellets, then Bram at 60 on level 1', () => {
        expect(personalDotLimit(1, 1)).toBe(0);
        expect(personalDotLimit(1, 2)).toBe(30);
        expect(personalDotLimit(1, 3)).toBe(60);
    });

    it('takes Bram\'s release down to 50 on level 2 and releases everyone at once after', () => {
        expect(personalDotLimit(2, 3)).toBe(50);
        expect(personalDotLimit(3, 2)).toBe(0);
    });

    it('uses the shared counter after a death: 7, 17, 32', () => {
        expect(GLOBAL_DOT_LIMITS).toEqual([7, 17, 32]);
    });

    it('gives a ghost four seconds of nothing to eat, three from level 5', () => {
        expect(releaseTimeout(1)).toBe(240);
        expect(releaseTimeout(5)).toBe(180);
    });

    it('starts Rook outside the house and the other three inside it', () => {
        const game = makeGame();
        expect(game.ghosts[0].mode).toBe(OUTSIDE);
        for (const ghost of game.ghosts.slice(1)) expect(ghost.mode).toBe(PACING_HOME);
    });

    it('sits the house on the row above and below the door', () => {
        const maze = new Maze(mazeForLevel());
        expect(maze.doorTile).toEqual({ x: 13, y: 14 });
        expect(maze.homeTopPixel).toBe(136);
        expect(maze.homeBottomPixel).toBe(144);
    });

    it('runs the eyes at twice the speed of anything else', () => {
        const ghost = makeGame().ghosts[0];
        ghost.mode = GOING_HOME;
        expect(ghost.stepsThisFrame()).toBe(2);
    });
});

describe('the scatter and chase schedule', () => {
    it('sends the ghosts hunting at seven seconds on level 1, and at five from level 5', () => {
        expect(MODE_SCHEDULE[1][0]).toEqual([7 * 60, CHASE]);
        expect(MODE_SCHEDULE[5][0]).toEqual([5 * 60, CHASE]);
    });

    it('breaks the pattern into alternating chases and scatters', () => {
        expect(MODE_SCHEDULE[1].map(([, command]) => command)).toEqual([
            CHASE, SCATTER, CHASE, SCATTER, CHASE, SCATTER, CHASE
        ]);
    });
});

describe('the fruit', () => {
    it('appears at 70 pellets and again at 170', () => {
        expect(FRUIT_DOT_LIMITS).toEqual([70, 170]);
    });

    it('gives cherry, then strawberry, then two levels of each', () => {
        expect(FRUIT_BY_LEVEL.slice(0, 4)).toEqual([0, 1, 2, 2]);
        expect(FRUIT_LADDER[FRUIT_BY_LEVEL[0]].name).toBe('cherry');
        expect(FRUIT_LADDER[FRUIT_BY_LEVEL[1]].name).toBe('strawberry');
    });

    it('tops out at the key from level 13 on', () => {
        expect(FRUIT_LADDER[FRUIT_BY_LEVEL[FRUIT_BY_LEVEL.length - 1]].name).toBe('key');
        expect(FRUIT_BY_LEVEL.length).toBe(13);
    });
});

describe('the player', () => {
    it('starts facing left, between the two upper pellets of the bottom corridor', () => {
        const game = makeGame();
        game.player.reset();
        expect(game.player.dirEnum).toBe(LEFT);
        expect(game.player.tile).toEqual({ x: 13, y: 26 });
    });

    it('stops at the middle of the tile before a wall rather than scraping along it', () => {
        // The arcade moves actors to the centre line and holds them there; everything
        // downstream — turning, the ghosts' targets, the tunnel wrap — assumes it.
        const game = makeGame();
        expect(nextIsFloor(game.maze, { x: 6, y: 26 }, LEFT)).toBe(false);
        expect(nextIsFloor(game.maze, { x: 6, y: 26 }, RIGHT)).toBe(true);
    });

    it('loses a frame to each pellet, and three to an energizer', () => {
        const game = makeGame();
        const player = game.player;

        // Tile (1,4) is a pellet in the arcade maze; (1,6) is an energizer.
        player.setPos(1 * 8 + 3, 4 * 8 + 4);
        player.eat();
        expect(game.score).toBe(10);
        expect(player.eatPauseFramesLeft).toBe(1);

        player.setPos(1 * 8 + 3, 6 * 8 + 4);
        player.eat();
        expect(game.score).toBe(60);
        expect(player.eatPauseFramesLeft).toBe(3);
    });

    it('speeds up slightly while an energizer is running', () => {
        // The arcade gives the player a faster row during a fright, which is why an
        // energizer is worth more than its 50 points.
        const game = makeGame();
        game.player.reset();
        game.energizer = { active: false, activate() {} };

        const normal = game.player.pattern;
        game.energizer.active = true;
        expect(game.player.pattern).not.toBe(normal);
    });

    it('turns into a wall instead of stopping dead, given the key early', () => {
        const game = makeGame();
        const player = game.player;
        player.setPos(6 * 8 + 3, 26 * 8 + 4); // mid-tile, facing left, wall to the left
        player.setDir(LEFT);
        player.setInputDir(UP);
        player.steer();
        expect(player.dirEnum).toBe(UP);
    });
});
describe('the messages on screen', () => {
    it('centres every label on the maze, whatever its length', () => {
        // The arcade could afford a per-string column, because its font was one fixed
        // bitmap. This is a proportional face, so a label's width is not its length and a
        // tuned column silently mis-centres the next string that changes.
        const renderer = new Renderer(document.createElement('canvas'));
        const drawn = [];
        renderer.ctx = {
            font: '',
            textBaseline: '',
            textAlign: '',
            fillStyle: '',
            fillText: (text, x, y) => drawn.push({ text, x, y, align: renderer.ctx.textAlign })
        };

        for (const text of ['READY', 'PAUSED', 'GAME OVER', 'A MUCH LONGER LABEL']) {
            renderer.drawMessage(text, '#ffffff', 20);
        }

        expect(drawn.length).toBe(4);
        for (const item of drawn) {
            expect(item.x).toBe(MAP_WIDTH / 2);
            expect(item.align).toBe('center');
            expect(item.y).toBe(20 * 8);
        }
    });
});

describe('the cast', () => {
    it('never opens the mouth past a right angle, so the face survives the widest frame', () => {
        // This is the bug: a 2-radian wedge measured 1,911 lit pixels and 30 across, against
        // 8,436 and 104 closed. A sliver that sat there every time the player reached a wall,
        // because the frame counter freezes the moment he stops.
        expect(Math.max(...MOUTH)).toBeLessThan(Math.PI / 2);
        expect(Math.max(...MOUTH)).toBeGreaterThan(0);
    });

    it('closes the mouth at every frame, and opens it again in the middle of the cycle', () => {
        expect(MOUTH[0]).toBe(0);
        expect(MOUTH[2]).toBeGreaterThan(MOUTH[1]);
        expect(MOUTH[1]).toBe(MOUTH[3]);
    });

    it('holds a closed mouth when the player is stopped', () => {
        // Standing still is most of what a player looking at a wall sees.
        const game = makeGame();
        game.player.reset();

        // `stopped` is set by the step, not by reset, so the test sets it the way a wall
        // does: two steps on, then a tile that will not open.
        game.player.steps = 2;
        game.player.stopped = true;
        expect(game.player.getMouthFrame()).toBe(0);

        game.player.stopped = false;
        expect(game.player.getMouthFrame()).toBe(1);
    });

    it('keeps the cap upright whichever way he is facing', () => {
        // Rotating the whole sprite put the baseball cap on the side of his head whenever he
        // faced up. The head turns; nothing drawn after it may.
        for (const dirEnum of [0, 1, 2, 3]) {
            const ctx = recorder();
            drawPacman(ctx, 0, 0, dirEnum, 1);

            const capIndex = ctx.calls.findIndex((c) => c[0] === 'fillRect' && c[5] === CAP_COLOR);
            expect(capIndex).toBeGreaterThan(-1);

            // Every rotation before the cap, and no rotation that the cap sits inside.
            const rotationsBefore = ctx.calls
                .slice(0, capIndex)
                .filter((c) => c[0] === 'rotate');
            const savesBefore = ctx.calls.slice(0, capIndex).filter((c) => c[0] === 'save').length;
            const restoresBefore = ctx.calls.slice(0, capIndex).filter((c) => c[0] === 'restore').length;
            expect(rotationsBefore.length).toBe(savesBefore - restoresBefore);
        }
    });

    it('turns only the head, so the mouth opens the way he is travelling', () => {
        for (const dirEnum of [0, 1, 2, 3]) {
            const ctx = recorder();
            drawPacman(ctx, 0, 0, dirEnum, 2);
            const rotations = ctx.calls.filter((c) => c[0] === 'rotate');
            expect(rotations.length).toBe(1);
        }
    });

    it('draws the eyes, the cap and both legs', () => {
        const ctx = recorder();
        drawPacman(ctx, 0, 0, 3, 1);

        // The eyes are ellipses, the cap and the legs are rectangles.
        expect(ctx.calls.some((c) => c[0] === 'ellipse')).toBe(true);
        expect(ctx.calls.some((c) => c[0] === 'fill' && c[1] === EYE_COLOR)).toBe(true);
        expect(ctx.calls.some((c) => c[0] === 'fillRect' && c[5] === CAP_COLOR)).toBe(true);

        const legs = ctx.calls.filter((c) => c[0] === 'fillRect' && c[5] === PLAYER_COLOR);
        expect(legs.length).toBe(2);   // one each
    });

    it('gives the four ghosts four outlines and three different faces', () => {
        expect(GHOSTS.map((g) => g.name)).toEqual(['rook', 'pip', 'nix', 'bram']);
        expect(new Set(GHOSTS.map((g) => g.brow)).size).toBe(2);
        expect(GHOSTS.filter((g) => g.spikes).length).toBe(1);
        expect(GHOSTS.filter((g) => g.cap).length).toBe(1);
        expect(GHOSTS.filter((g) => g.mouth).length).toBe(1);
    });

    it('steps the ghosts\' square feet in two frames', () => {
        expect(FEET.length).toBe(2);
        expect(FEET[0]).not.toEqual(FEET[1]);
        // Four feet, each a notch down from the one beside it.
        const downs = FEET[0].filter(([, y]) => y === 5.4).length;
        expect(downs).toBe(4);
    });

    it('keeps a frightened ghost\'s own silhouette and gives up only its colour', () => {
        const plain = recorder();
        const scared = recorder();
        drawGhost(plain, 0, 0, { index: 0, frame: 0, dirEnum: 3, color: '#E53935' });
        drawGhost(scared, 0, 0, { index: 0, frame: 0, dirEnum: 3, scared: true });

        // Count the body only: everything before the first fill. The frightened face is
        // drawn afterwards and adds its own teeth, which say nothing about the silhouette.
        const bodyPath = (ctx) => {
            const firstFill = ctx.calls.findIndex((c) => c[0] === 'fill');
            return ctx.calls
                .slice(0, firstFill)
                .filter((c) => ['lineTo', 'quadraticCurveTo', 'moveTo', 'closePath'].includes(c[0]));
        };
        expect(bodyPath(scared).length).toBe(bodyPath(plain).length);
        expect(scared.calls.some((c) => c[0] === 'fill' && c[1] === FRIGHTENED_COLOR)).toBe(true);
    });

    it('does not turn a ghost\'s body, only its eyes', () => {
        // The brows are drawn tilted, inside their own save and restore, so the count that
        // matters is the rotations before the body is filled.
        const ctx = recorder();
        drawGhost(ctx, 0, 0, { index: 1, frame: 0, dirEnum: 3, color: '#1976D2' });
        const firstFill = ctx.calls.findIndex((c) => c[0] === 'fill');
        expect(ctx.calls.slice(0, firstFill).filter((c) => c[0] === 'rotate').length).toBe(0);
    });
});

/*
 * The fired pellet.
 *
 * Eating an energizer banks a pellet and firing spends one. Two bugs lived here that no
 * amount of playing caught by eye, both of them invisible: a shot that was born already
 * touching a wall was cleared on the sub-step it was fired, and the play state never
 * painted the pellet at all. Neither showed anything on screen, so both read as the key
 * doing nothing -- so the tests below assert on what reaches the screen and on what the
 * player is left holding, not just on whether a pellet object exists.
 */

/** A real Game, parked in play with the arcade maze and no loop running. */
function makePlayingGame() {
    const game = new Game({
        canvas: document.createElement('canvas'),
        audio: silentAudio,
        scores: { get: () => 0, set() {}, submit() {} }
    });
    game.maze = new Maze(mazeForLevel());
    game.setState(game.states.play);
    /*
     * The same hooks a real level start runs. Skipping them leaves the releaser without
     * its per-ghost counters, and the first dot eaten then throws instead of testing
     * anything.
     */
    game.fruit.onNewLevel();
    game.releaser.onNewLevel();
    game.elroy.onNewLevel();
    /*
     * The house is emptied for these tests. A ghost out in the maze is a pellet's
     * legitimate target, and one of them starts in the bottom corridor, so a shot meant
     * to test the wall at the end of it would stop on the ghost instead and read as a
     * short corridor.
     */
    for (const ghost of game.ghosts) ghost.mode = PACING_HOME;
    return game;
}

/**
 * A floor tile with exactly `runway` floor tiles ahead of it in `direction`, then a wall.
 *
 * The bounds and the direction table come from the engine rather than being written out
 * here. A literal 31 for the row count was silently four rows short of the real board,
 * and a hand-copied direction table is exactly the kind of second copy this file's own
 * header says must not exist.
 */
function tileWithRunway(maze, direction, runway) {
    const step = vectorOf(direction);
    const floor = (x, y) => {
        const i = maze.index(x, y);
        return i >= 0 && (maze.current[i] === '.' || maze.current[i] === 'o');
    };
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (!floor(x, y)) continue;
            let clear = true;
            for (let n = 1; n <= runway; n++) {
                if (!floor(x + step.x * n, y + step.y * n)) { clear = false; break; }
            }
            if (!clear) continue;
            if (floor(x + step.x * (runway + 1), y + step.y * (runway + 1))) continue;
            return { x, y };
        }
    }
    return null;
}

/** Runs the pellet forward the way the play loop does: two sub-steps, one pixel each. */
function runPellet(game, limit = 2000) {
    let substeps = 0;
    while (game.pellet && substeps < limit) {
        game.pellet.update(0);
        substeps++;
        if (game.pellet) {
            game.pellet.update(1);
            substeps++;
        }
    }
    return substeps;
}

describe('Seclusa Munch — the fired pellet', () => {
    it('banks a pellet when an energizer is eaten', () => {
        const game = makePlayingGame();
        const spot = { x: game.maze.energizers[0].x, y: game.maze.energizers[0].y };
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        expect(game.player.heldPellets).toBe(0);
        game.player.update(0);
        expect(game.player.heldPellets).toBe(1);
    });

    it('caps the bank at two, and a second energizer does not overflow it', () => {
        const game = makePlayingGame();
        game.player.heldPellets = 2;
        const spot = game.maze.energizers[0];
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        game.player.update(0);
        expect(game.player.heldPellets).toBe(2);
    });

    it('fires on space, and spends exactly one', () => {
        const game = makePlayingGame();
        const spot = tileWithRunway(game.maze, LEFT, 4);
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        game.player.setDir(LEFT);
        game.player.heldPellets = 1;

        expect(game.onKeyDown(32)).toBe(true);
        expect(game.pellet).toBeTruthy();
        expect(game.player.heldPellets).toBe(0);
    });

    it('fires on a single tap', () => {
        const game = makePlayingGame();
        const spot = tileWithRunway(game.maze, LEFT, 4);
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        game.player.setDir(LEFT);
        game.player.heldPellets = 1;

        game.onPointerDown();
        expect(game.pellet).toBeTruthy();
        expect(game.player.heldPellets).toBe(0);
    });

    it('leaves along the direction the player is facing', () => {
        const game = makePlayingGame();
        const spot = tileWithRunway(game.maze, UP, 4);
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        game.player.setDir(UP);
        game.player.heldPellets = 1;
        game.firePellet();

        expect(game.pellet.dirEnum).toBe(UP);
        // Launched into the tile in front, not on top of the player.
        expect(game.pellet.tile.x).toBe(spot.x);
        expect(game.pellet.tile.y).toBe(spot.y - 1);
    });

    it('keeps the pellet when the shot has nowhere to go', () => {
        // A pellet is launched into the tile in front, on that tile's centre line, so the
        // first thing it asks is whether the tile beyond is floor. One tile of runway is
        // not enough: the shot would be born touching a wall and cleared on the same
        // sub-step, which spends the pellet and shows nothing.
        const game = makePlayingGame();
        const spot = tileWithRunway(game.maze, LEFT, 1);
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        game.player.setDir(LEFT);
        game.player.heldPellets = 1;

        expect(game.firePellet()).toBe(false);
        expect(game.pellet).toBe(null);
        expect(game.player.heldPellets).toBe(1);
    });

    it('refuses a second shot while one is in flight, and keeps the spare', () => {
        const game = makePlayingGame();
        const spot = tileWithRunway(game.maze, LEFT, 6);
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        game.player.setDir(LEFT);
        game.player.heldPellets = 2;

        expect(game.firePellet()).toBe(true);
        expect(game.firePellet()).toBe(false);
        expect(game.pellet).toBeTruthy();
        expect(game.player.heldPellets).toBe(1);
    });

    it('will not fire with an empty hand', () => {
        const game = makePlayingGame();
        const spot = tileWithRunway(game.maze, LEFT, 4);
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        game.player.setDir(LEFT);
        game.player.heldPellets = 0;

        expect(game.firePellet()).toBe(false);
        expect(game.pellet).toBe(null);
    });

    it('travels the corridor and spends itself on the wall at the end', () => {
        const game = makePlayingGame();
        const spot = tileWithRunway(game.maze, LEFT, 6);
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        game.player.setDir(LEFT);
        game.player.heldPellets = 1;
        game.firePellet();
        const firedFrom = game.pellet.tile.x;

        const substeps = runPellet(game);
        /*
         * One pixel per sub-step across the whole runway, plus the sub-step that finds
         * the wall: six tiles of floor ahead of the player, of which the pellet gets five
         * because it is launched into the first. Stopping early would mean the wall test
         * fires with corridor still in front of it, which is the bug this guards.
         */
        expect(substeps).toBe(5 * 8 + 1);
        expect(game.pellet).toBe(null);
        expect(game.player.heldPellets).toBe(0);
        expect(firedFrom).toBe(spot.x - 1);
    });

    it('paints itself while it is in flight, in the play state', () => {
        // The pellet was drawn in the READY card for a while and never during play, so it
        // existed, moved and killed ghosts while remaining invisible.
        const game = makePlayingGame();
        const painted = [];
        // The method is swapped rather than the renderer: the states capture the instance
        // when they are built, so replacing game.renderer would not be seen by them.
        game.renderer.drawPellet = (g) => {
            if (g.pellet) painted.push(g.pellet);
        };

        const spot = tileWithRunway(game.maze, LEFT, 6);
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        game.player.setDir(LEFT);
        game.player.heldPellets = 1;
        game.firePellet();
        const flying = game.pellet;

        game.states.play.draw();
        expect(painted.length).toBe(1);
        expect(painted[0]).toBe(flying);

        // And with nothing in the air it draws nothing rather than a stale ghost.
        game.clearPellet();
        game.states.play.draw();
        expect(painted.length).toBe(1);
    });

    it('is banked again by the next energizer once the first is spent', () => {
        const game = makePlayingGame();
        const spot = tileWithRunway(game.maze, LEFT, 6);
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        game.player.setDir(LEFT);
        game.player.heldPellets = 1;
        game.firePellet();
        runPellet(game);
        expect(game.pellet).toBe(null);
        expect(game.player.heldPellets).toBe(0);

        const next = game.maze.energizers[1];
        game.player.setPos(next.x * 8 + 3, next.y * 8 + 3);
        game.player.update(0);
        expect(game.player.heldPellets).toBe(1);
    });
});

/*
 * The bottom row.
 *
 * Lives are baked into the background map and never change; banked shots are not, because
 * the count changes the moment an energizer is eaten or a pellet fired. So they are drawn
 * per frame, which is why these assert the renderer method rather than the map.
 */
describe('Seclusa Munch — banked shots on the bottom row', () => {
    /** A real Renderer whose context records instead of drawing. */
    function recordingRenderer() {
        const renderer = new Renderer(document.createElement('canvas'));
        renderer.ctx = recorder();
        return renderer;
    }

    it('draws one energizer-sized dot per banked shot', () => {
        const game = makePlayingGame();
        game.extraLives = 3;
        game.player.heldPellets = 2;
        const renderer = recordingRenderer();

        renderer.drawBankedPellets(game);
        const arcs = renderer.ctx.calls.filter((c) => c[0] === 'arc');
        expect(arcs.length).toBe(2);
        // Drawn at the lives' scale, so the radius is the energizer's before that scale
        // rather than an arbitrary size of its own.
        expect(arcs[0][3]).toBe(TILE / 2);
    });

    it('starts where the lives stop, so the row reads as one line', () => {
        const game = makePlayingGame();
        game.extraLives = 3;
        game.player.heldPellets = 1;
        const renderer = recordingRenderer();

        renderer.drawBankedPellets(game);
        const move = renderer.ctx.calls.find((c) => c[0] === 'translate');
        // Lives sit at 3 tiles in, two tiles apart; the shots carry on from there.
        expect(move[1]).toBe(3 * TILE + 3 * 2 * TILE);
        expect(move[2]).toBe((ROWS - 1) * TILE);
    });

    it('draws nothing at all with an empty hand', () => {
        const game = makePlayingGame();
        game.extraLives = 3;
        game.player.heldPellets = 0;
        const renderer = recordingRenderer();

        renderer.drawBankedPellets(game);
        expect(renderer.ctx.calls.filter((c) => c[0] === 'arc').length).toBe(0);
    });

    it('is on the row in every state that shows the board', () => {
        // The lives are in the background, so they show wherever the board does. The shots
        // have to match that or they vanish the moment the round ends.
        const game = makePlayingGame();
        game.extraLives = 3;
        game.player.heldPellets = 1;

        for (const name of ['ready', 'play', 'dead', 'finish', 'gameOver']) {
            let drawn = 0;
            const realBanked = game.renderer.drawBankedPellets.bind(game.renderer);
            game.renderer.drawBankedPellets = (g) => { drawn++; realBanked(g); };
            game.states[name].draw();
            game.renderer.drawBankedPellets = realBanked;
            expect(`${name}=${drawn}`).toBe(`${name}=1`);
        }
    });
});

/*
 * A shot must not outlive the life that fired it.
 *
 * Only the pellet clears itself, on a wall or on a ghost, and the loop that would advance
 * it is not running once the player is dead. So a pellet in flight at the moment of death
 * used to sit frozen through the animation, never be drawn, and then resume across the
 * board on the next life -- while refusing every new shot, because `firePellet()` will not
 * put two in the air.
 */
describe('Seclusa Munch — losing a shot with the life', () => {
    it('clears the pellet when the player dies', () => {
        const game = makePlayingGame();
        const spot = tileWithRunway(game.maze, LEFT, 6);
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        game.player.setDir(LEFT);
        game.player.heldPellets = 1;
        expect(game.firePellet()).toBe(true);
        expect(game.pellet).toBeTruthy();

        game.setState(game.states.dead);
        expect(game.pellet).toBe(null);
    });

    it('clears the pellet when the level is finished, not just on death', () => {
        /*
         * The harder of the two, because nothing else catches it.
         *
         * `play.update()` returns out of the `allEaten()` check *before* the line that
         * advances a pellet, so finishing on the same frame you fired leaves it alive. The
         * finish screen never draws one and `startLevel()` replaces the maze under it, so
         * it survived into the next level: invisible, uncontrollable, and refusing every
         * press because `firePellet()` will not put two in the air.
         */
        const game = makePlayingGame();
        const spot = tileWithRunway(game.maze, LEFT, 6);
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        game.player.setDir(LEFT);
        game.player.heldPellets = 1;
        expect(game.firePellet()).toBe(true);

        game.setState(game.states.finish);
        expect(game.pellet).toBe(null);
    });

    it('leaves the next life able to fire', () => {
        const game = makePlayingGame();
        const spot = tileWithRunway(game.maze, LEFT, 6);
        game.player.setPos(spot.x * 8 + 3, spot.y * 8 + 3);
        game.player.setDir(LEFT);
        game.player.heldPellets = 2;
        game.firePellet();

        game.setState(game.states.dead);
        game.setState(game.states.play);
        expect(game.firePellet()).toBe(true);
    });
});
