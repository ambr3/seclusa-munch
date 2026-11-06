/*
 * The numbers the 1980 board ran on.
 *
 * Every constant in this file is a measured arcade value rather than something tuned
 * for feel. They come from Jamey Pittman's reverse engineering (The Pac-Man Dossier) and
 * they are the reason the game plays the way it does: the ghosts' scatter/chase rhythm,
 * the way the player loses speed eating, which levels the maze flashes in, how long a
 * fright lasts.
 *
 * Nothing here reads the DOM or holds state. The rules live in the modules that import
 * this; this file is only the lookup tables, so it can be reasoned about (and tested)
 * on its own.
 */

// ---------------------------------------------------------------- geometry

/** Side of one maze tile, in pixels. The whole game is built on this. */
export const TILE = 8;

/**
 * Where the centre line of a tile sits, in pixels from the tile's left/top edge.
 *
 * Actors are moved one pixel at a time and compared against this to decide when they
 * have reached the middle of a tile, which is where they are allowed to turn. It is not
 * the geometric centre (that would be 4,4): the arcade board's video timing puts the
 * actors' centre line at 3,4, and every "is this actor mid-tile" decision inherits it.
 */
export const MID_TILE = { x: 3, y: 4 };

export const COLS = 28;
export const ROWS = 36;

// ------------------------------------------------------------------- timing

/** One game frame. The arcade refreshes at 60.606060Hz; 60 is the same thing rounded. */
export const FRAME_MS = 1000 / 60;

/**
 * How far behind real time the simulation is allowed to fall before frames are dropped.
 *
 * Without a cap, a tab that has been in the background for a minute comes back and tries
 * to simulate several thousand frames in one go. Three frames of slack keeps the game
 * honest on a slow machine while letting it ride out a dropped frame or two.
 */
export const MAX_FRAME_SKIP = 3;

// --------------------------------------------------------------- directions

/*
 * Direction order is load-bearing and must not be shuffled.
 *
 * When two open tiles are equally good routes to a ghost's target, the tie is broken by
 * preferring the lower enum. That is what produces the arcade's fixed preference order of
 * up, then left, then down, then right — the reason ghosts turn the same way every time
 * they are given the same situation, and a large part of why the game is learnable.
 */
export const UP = 0;
export const LEFT = 1;
export const DOWN = 2;
export const RIGHT = 3;

export const DIR_VECTORS = [
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 0 }
];

export const DIR_NAMES = ["up", "left", "down", "right"];

/** The ghost house door and the floor of the house, shared by every maze. */
export const DOOR_TILE = { x: 13, y: 14 };
export const DOOR_PIXEL = { x: (13 + 1) * TILE - 1, y: 14 * TILE + MID_TILE.y };
export const HOME_TOP_PIXEL = 17 * TILE;
export const HOME_BOTTOM_PIXEL = 18 * TILE;

// -------------------------------------------------------------- ghost plans

/** What the four ghosts are all doing at once. */
export const CHASE = 0;
export const SCATTER = 1;

/*
 * The scatter/chase schedule, in frames, for three bands of levels.
 *
 * Each entry is a list of [frame, command] changes. A change reverses every ghost that
 * is loose on the board, which is the classic panic button: eat an energizer at the wrong
 * moment and the ghosts may turn around mid-corridor.
 *
 * The long lulls matter as much as the short ones. The level 1-4 schedule ends in a
 * seventeen-minute scatter that no player ever sees, which is why a level 1 ghost that
 * reaches a corner gives up and wanders instead of hunting.
 */
export const MODE_SCHEDULE = {
    1: [
        [7 * 60, CHASE],
        [27 * 60, SCATTER],
        [34 * 60, CHASE],
        [54 * 60, SCATTER],
        [59 * 60, CHASE],
        [79 * 60, SCATTER],
        [84 * 60, CHASE]
    ],
    2: [
        [7 * 60, CHASE],
        [27 * 60, SCATTER],
        [34 * 60, CHASE],
        [54 * 60, SCATTER],
        [59 * 60, CHASE],
        [59 + 1033 * 60, SCATTER],
        [59 + 1033 * 60 + 1, CHASE]
    ],
    5: [
        [5 * 60, CHASE],
        [25 * 60, SCATTER],
        [30 * 60, CHASE],
        [50 * 60, SCATTER],
        [55 * 60, CHASE],
        [55 + 1037 * 60, SCATTER],
        [55 + 1037 * 60 + 1, CHASE]
    ]
};

/** Which schedule a level uses. */
export function scheduleBand(level) {
    if (level <= 1) return 1;
    if (level <= 4) return 2;
    return 5;
}

/**
 * The scatter corner each ghost runs to, and where it starts and sits at home.
 *
 * The corners are the maze's four outer corners with one tile cut off, so a ghost sitting
 * on its corner has exactly one way out and turns predictably back into play.
 *
 * The names and the faces are this game's own: Rook is spiked and scowling, Pip smooth and
 * square-footed, Nix wearing somebody's flat cap and looking bored, Bram grinning. The
 * *roles* are the arcade's — Rook hunts, Pip ambushes four tiles ahead, Nix doubles a
 * vector through Rook, Bram gives up inside eight tiles — and keeping the roles is what
 * makes the ghosts learnable while letting them be something other than four copies of the
 * originals.
 */
export const GHOST_PLAN = [
    {
        name: "rook",
        color: "#E53935",
        corner: { x: 25, y: 0 },
        startPixel: { x: 14 * TILE - 1, y: 14 * TILE + MID_TILE.y },
        startDir: LEFT,
        startMode: "outside",
        arriveHomeMode: "leaving"
    },
    {
        name: "pip",
        color: "#1976D2",
        corner: { x: 2, y: 0 },
        startPixel: { x: 14 * TILE - 1, y: 17 * TILE + MID_TILE.y },
        startDir: DOWN,
        startMode: "pacing",
        arriveHomeMode: "pacing"
    },
    {
        name: "nix",
        color: "#9C27B0",
        corner: { x: 27, y: 34 },
        startPixel: { x: 12 * TILE - 1, y: 17 * TILE + MID_TILE.y },
        startDir: UP,
        startMode: "pacing",
        arriveHomeMode: "pacing"
    },
    {
        name: "bram",
        color: "#689F38",
        corner: { x: 0, y: 34 },
        startPixel: { x: 16 * TILE - 1, y: 17 * TILE + MID_TILE.y },
        startDir: UP,
        startMode: "pacing",
        arriveHomeMode: "pacing"
    }
];

/** What the player is called, everywhere the game names them. */
export const PLAYER_NAME = "munch";

/**
 * The player's colour, and the colour a frightened ghost turns.
 *
 * The arcade's were pure yellow and pure blue. These are a saturated gold and a deep
 * indigo, which sit better on the app's dark surfaces and stay unmistakably different from
 * each other — the frightened colour is the whole difference between eating a ghost and
 * being eaten, so it cannot be a shade of the player's.
 */
export const PLAYER_COLOR = "#FFCE21";

/*
 * Chrome text, as opposed to game marks.
 *
 * The attract screen's title and score were drawn in PLAYER_COLOR, which is the
 * player's own yellow -- so the words on the page were the same colour as the
 * thing they describe, and the whole screen read as yellow-on-black rather than
 * as this app. Those are labels; they take the theme's text roles.
 *
 * PLAYER_COLOR is still the player, the energised player and the fruit, which
 * are game marks and stay.
 */
const CHROME_ROLES = {
    "": "--md-sys-color-on-surface",
    "dim": "--md-sys-color-on-surface-variant",
    "faint": "--md-sys-color-outline",
    "danger": "--md-sys-color-error",
};

const CHROME_FALLBACK = {
    "": "#FFFFFF",
    "dim": "#9AA0A6",
    "faint": "#7C8391",
    "danger": "#FF5252",
};

export function chromeColor(role) {
    try {
        const v = window.getComputedStyle(document.documentElement)
            .getPropertyValue(CHROME_ROLES[role] || CHROME_ROLES[""])
            .trim();
        return v || CHROME_FALLBACK[role] || CHROME_FALLBACK[""];
    } catch (_) {
        return CHROME_FALLBACK[role] || CHROME_FALLBACK[""];
    }
}
export const FRIGHTENED_COLOR = "#3F51B5";

/**
 * The player's cap, and the ink his eyes are drawn in.
 *
 * A red cap on a gold head is the character. Without it he is a gold circle, and a gold
 * circle is Pac-Man wearing a different colour — the cap is what makes him somebody else,
 * and it is why the head is drawn a little smaller than the arcade's, to pay for the height
 * it adds.
 *
 * Two reds, because a single flat red at fourteen pixels has no front: the crown is the
 * lighter one and the visor the darker, and that difference is the whole of the cap's
 * shape. The eyes are near-black rather than the gold's lighter sibling, because black on
 * gold reads as a face and a tint of the gold reads as a smudge.
 */
export const CAP_COLOR = "#E53935";
export const CAP_VISOR_COLOR = "#C62828";
export const EYE_COLOR = "#1A1A1A";

/**
 * The ghosts' pupils: a near-black indigo rather than true black. Against four saturated
 * body colours a black pupil reads as a hole punched in the sprite; this reads as an eye.
 */
export const INK_COLOR = "#1A237E";

// -------------------------------------------------------------------- speed

/** Which of the seven speed patterns an actor wants this frame. */
/** Pellets that can be banked at once. Two, so one can be held through a fright. */
export const HELD_PELLETS_MAX = 2;

export const PATTERN = {
    PAC: 0,
    GHOST: 1,
    PAC_FRIGHT: 2,
    GHOST_FRIGHT: 3,
    GHOST_TUNNEL: 4,
    ELROY1: 5,
    ELROY2: 6
};

/*
 * The speed control table.
 *
 * Speeds are not expressed as pixels per second. Each entry is a 16-bit pattern giving
 * the number of pixels to advance in one frame, cycled forever: a pattern of all ones
 * moves every frame, a pattern with a lone zero stutters once every sixteen frames. The
 * arcade's sub-pixel speeds are reproduced by averaging that, which is why the ghosts can
 * be slower than the player without being a fraction of a pixel slower.
 *
 * Rows are per level band (1, 2-4, 5-20, 21+), each holding the seven patterns in the
 * order of PATTERN above. Read PATTERN.PAC from the top row for "1111111111111111" and
 * you have the whole scheme.
 */
const SPEED_PATTERNS = [
    // Level 1
    "1111111111111111", // pac-man
    "0111111111111111", // ghosts
    "1111211111112111", // pac-man, frightened
    "0110110101101101", // ghosts, frightened
    "0101010101010101", // ghosts, in the tunnel
    "1111111111111111", // elroy 1
    "1111111121111111", // elroy 2

    // Levels 2-4
    "1111211111112111",
    "1111111121111111",
    "1111211112111121",
    "0110110110110111",
    "0110101011010101",
    "1111211111112111",
    "1111211112111121",

    // Levels 5-20
    "1121112111211121",
    "1111211112111121",
    "1121112111211121",
    "0111011101110111",
    "0110110101101101",
    "1121112111211121",
    "1121121121121121",

    // Levels 21+
    "1111211111112111",
    "1111211112111121",
    "0000000000000000", // pac-man fright: n/a, there is no fright from here up
    "0000000000000000", // ghost fright: n/a
    "0110110101101101",
    "1121112111211121",
    "1121121121121121"
];

/** The row of the speed table a level reads from. */
function speedBand(level) {
    if (level <= 1) return 0;
    if (level <= 4) return 1;
    if (level <= 20) return 2;
    return 3;
}

/**
 * How many pixels an actor moves this frame.
 *
 * `tick` is the actor's own frame counter; the pattern is indexed by it so that two
 * actors starting together stay in step for the rest of the game.
 */
export function stepSize(level, pattern, tick) {
    const row = SPEED_PATTERNS[speedBand(Math.max(1, level || 1)) * 7 + pattern];
    return row.charCodeAt(tick % 16) - 48;
}

// ----------------------------------------------------------------- energizer

/**
 * Seconds of fright per level, and how many times the ghosts flash before it ends.
 *
 * Two separate tables because they do not fall together: the flashing starts a fixed
 * number of *game cycles* from the end, so a six-second fright and a one-second fright
 * flash for very different stretches of their length.
 *
 * Level 17 has no fright at all (the table records 0), and every level past 18 has none
 * either — the arcade boards shipped with the energizers wired out at that point.
 */
export const FRIGHT_SECONDS = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1];
export const FRIGHT_FLASHES = [5, 5, 5, 5, 5, 5, 5, 5, 3, 5, 5, 3, 3, 5, 3, 3, 0, 3];

/** Frames the ghosts flash white and blue, alternating, at the end of a fright. */
export const FLASH_INTERVAL = 14;

/** Seconds the score for an eaten ghost stays on the board. */
export const GHOST_POINTS_SECONDS = 1;

/**
 * Seconds the score for an eaten fruit stays on the board. Longer than a ghost's, because
 * the fruit numbers are wider and the player needs longer to read them.
 */
export const FRUIT_POINTS_SECONDS = 2;

/** Seconds the fruit itself is on the board. */
export const FRUIT_SECONDS = 9;

/** Pellet counts at which the fruit appears: seventy, then a hundred more. */
export const FRUIT_DOT_LIMITS = [70, 170];

// -------------------------------------------------------------------- elroy

/**
 * Pellets left on the board when Rook becomes Elroy 1 and then Elroy 2.
 *
 * Elroy is the level's rubber band: as the maze empties, Rook speeds up and stops
 * caring about the energizer timer. The dots-left numbers climb with the level number, so
 * Elroy arrives sooner (in pellets eaten) on the later, faster boards.
 */
export const ELROY_DOTS_LEFT = [
    [20, 30, 40, 40, 40, 50, 50, 50, 60, 60, 60, 70, 70, 70, 100, 100, 100, 100, 120, 120, 120],
    [10, 15, 20, 20, 20, 25, 25, 25, 30, 30, 30, 40, 40, 40, 50, 50, 50, 50, 60, 60, 60]
];

/** The pellet count Elroy's thresholds are measured against: the arcade maze, in full. */
export const REFERENCE_PELLETS = 244;

/**
 * Pellets eaten at which Elroy stage `stage` (1 or 2) begins on the current level.
 */
export function elroyDotsEaten(level, stage, totalPellets) {
    const table = ELROY_DOTS_LEFT[stage - 1];
    const index = Math.min(Math.max(level, 1), 21) - 1;
    const dotsLeft = table[index];
    // Scaled by the maze's own size so a maze that is not the arcade's still crosses the
    // threshold at the same point in its own progress.
    const scale = totalPellets / REFERENCE_PELLETS;
    return totalPellets - Math.round(dotsLeft * scale);
}

// ------------------------------------------------------------------ release

/** Frames a ghost may wait, after the player stops eating, before it is let out. */
export function releaseTimeout(level) {
    return (level < 5 ? 4 : 3) * 60;
}

/**
 * Pellets the player must eat before each ghost in the house is let out, on a fresh level.
 *
 * Pip is out immediately, Nix after 30 pellets on level 1, Bram after 60 on level 1 and
 * 50 on level 2. Later levels release them immediately too, relying on the timeout above
 * instead.
 */
export function personalDotLimit(level, ghostIndex) {
    if (ghostIndex === 1) return 0;
    if (ghostIndex === 2) return level === 1 ? 30 : 0;
    if (ghostIndex === 3) {
        if (level === 1) return 60;
        if (level === 2) return 50;
    }
    return 0;
}

/**
 * Pellet counts used after a life is lost. The maze is not refilled; these count pellets
 * eaten after the respawn.
 *
 * On a restart the ghosts come out on a shared counter at 7, 17 and 32 pellets, which is
 * slower than the fresh-level counters above and is why a death early in a level actually
 * costs you the ghosts.
 */
export const GLOBAL_DOT_LIMITS = [7, 17, 32];

// -------------------------------------------------------------------- fruit

/**
 * The fruit ladder: the reward for still being here.
 *
 * Two levels each for most of the run, then one a level from the key onwards — the
 * arcade's own spacing, which is what makes the bottom row of the screen a progress bar.
 */
export const FRUIT_LADDER = [
    { name: "cherry", points: 100 },
    { name: "strawberry", points: 300 },
    { name: "orange", points: 500 },
    { name: "apple", points: 700 },
    { name: "melon", points: 1000 },
    { name: "galaxian", points: 2000 },
    { name: "bell", points: 3000 },
    { name: "key", points: 5000 }
];

/** Which fruit appears on which level. Index 0 is level 1. */
export const FRUIT_BY_LEVEL = [0, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7];

// -------------------------------------------------------------------- score

export const PELLET_POINTS = 10;
export const ENERGIZER_POINTS = 50;
export const GHOST_POINTS = [200, 400, 800, 1600];

/** One extra Munch at this score. */
export const EXTRA_LIFE_SCORE = 10000;

/** Starting lives, spent one at a time. */
export const STARTING_LIVES = 3;

// ------------------------------------------------------------------ display

/** Frames the maze is held still for before the player's death animation. */
export const DEATH_FREEZE_FRAMES = 60;

/** Frames the death animation itself runs. */
export const DEATH_ANIM_FRAMES = 75;

/** Frames of "READY!" before each life. */
export const READY_FRAMES = 4 * 60;

/** Frames the maze flashes after the last pellet, and how often it toggles. */
export const FINISH_FLASH_START = 120;
export const FINISH_FLASH_PERIOD = 12;
export const FINISH_FLASH_COUNT = 8;

/** Frames "GAME OVER" stays up before the title screen. */
export const GAME_OVER_FRAMES = 120;