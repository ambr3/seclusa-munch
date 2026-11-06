import {
    PLAYER_COLOR, FRIGHTENED_COLOR, CAP_COLOR, CAP_VISOR_COLOR, EYE_COLOR, INK_COLOR
} from "./config.js";

/*
 * Every picture in the game, drawn with canvas paths.
 *
 * There is not a single image file in this game. Every shape here is simple enough to be
 * geometry — a circle with a bite out of it, a cap, two rectangles for legs, a dome with a
 * row of square teeth, a few polygons for the eyes and brows — and drawing them directly
 * costs less than loading an atlas and keeps the whole game readable as source. Everything
 * draws centred on the pixel it is given, at the size the maze implies: an actor is about
 * fourteen pixels across, a corridor is eight.
 *
 * Two rules hold across the whole file, and both exist because the obvious version of them
 * is wrong:
 *
 *   Only the parts that face somewhere rotate. Munch's head turns so his mouth opens the way
 *   he is travelling, but his cap, eyes and legs are drawn afterwards and stay upright — turn
 *   the whole sprite and a baseball cap ends up on the side of his head. The ghosts do not
 *   turn at all, only their eyes move.
 *
 *   Nothing is drawn wider than it is useful at this size. A cast member is judged at
 *   thirteen or fourteen pixels across, which is where a detail either reads or does not,
 *   and which is the only size any of this is ever seen at.
 */

// ------------------------------------------------------------ geometry

/**
 * The mouth angle for each frame of the chomp, in radians.
 *
 * Half-angles: the corner of the mouth sits just behind the centre, so the shape's opening
 * is twice the number. The widest frame is 0.62 — a seventy-degree bite, which is about
 * what a round face can lose and still read as a face.
 *
 * It used to be 2 radians here, a 229-degree bite that left a sliver rather than a
 * character. The widest frame has to look like a character *while stationary*, because
 * stationary is most of what a player looking at a wall sees.
 */
const MOUTH = [0, 0.34, 0.62, 0.34];

/** The player's head, and where the corner of the mouth sits behind its centre. */
const MUNCH_RADIUS = 5.0;
const MOUTH_CORNER = -2.1;

/** The two eyes, and their spacing. */
const MUNCH_EYES = [-1.7, 1.7];

/** Face direction, as a rotation from facing right. */
const FACE_ANGLE = { 3: 0, 2: Math.PI / 2, 1: Math.PI, 0: -Math.PI / 2 };

/** Traces a list of [x, y] points as a closed path. */
function tracePath(ctx, points) {
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
}

// ------------------------------------------------------------- munch

/*
 * The player: Munch, in a cap, with legs.
 *
 * A round gold head, a red baseball cap, two stubby legs, and a mouth that opens the way he
 * is travelling. The cap is the character: a bare gold circle is Pac-Man at any colour, and
 * the cap is the one thing that makes him somebody else — he is wearing something, which is
 * the whole of the identity at fourteen pixels.
 *
 * Only the head turns. This is the thing that is easy to get wrong and hard to catch at
 * size: rotating the whole sprite sends the cap and the eyes round with it, so a character
 * facing up turns up on its side, and a baseball cap worn on the side of the head is not a
 * baseball cap. So the head is drawn rotated — it is a circle, so nothing inside it moves —
 * and the cap, the eyes and the legs are drawn afterwards, upright, in screen space. The
 * pupils still shift towards the direction of travel, which is what tells you a turn is
 * coming.
 */

/** How far each leg reaches down, in the two halves of the step. */
const MUNCH_LEGS = [
    { left: 6.5, right: 5.6 },
    { left: 5.6, right: 6.5 }
];

/**
 * Two stubby legs, stepping out of the bottom of the head.
 *
 * Drawn *after* the head, in the head's own colour, so they merge with its outline and read
 * as legs rather than as a seam. Behind the head they would be the obvious thing to do and
 * it is wrong: the mouth is a hole cut in the head, and a leg drawn underneath shows through
 * it, which puts a gold leg inside Munch's open mouth every time he faces down.
 *
 * Both legs are always a little visible — one a pixel further down than the other — because
 * a walk in which one leg vanishes entirely reads as a character with one leg.
 */
function drawLegs(ctx, frame, color) {
    const step = MUNCH_LEGS[frame % MUNCH_LEGS.length];
    ctx.fillStyle = color;
    ctx.fillRect(-4.1, 4.0, 2.6, step.left - 4.0);
    ctx.fillRect(1.5, 4.0, 2.6, step.right - 4.0);
}

/**
 * The cap: a crown on the skull and a visor off the front of it.
 *
 * The visor points right whatever Munch is doing, which is what makes it read as a cap on a
 * head rather than as an arrow stuck to one. Drawn last and unclipped, so a wide-open mouth
 * passes behind it rather than through it.
 */
function drawCap(ctx) {
    // The crown, sat high and to the left so the head's own curve falls away under it.
    ctx.fillStyle = CAP_COLOR;
    ctx.beginPath();
    ctx.ellipse(-1.0, -5.2, 4.3, 2.1, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // A flat cut along the crown's base, so it reads as fabric over a head rather than as
    // a dome floating above one.
    ctx.fillRect(-4.7, -5.3, 7.4, 1.0);

    // The visor, in the darker red. It has to start *outside* the head's silhouette at its
    // own height or it merges with the cheek and the whole cap reads as a lump: the head is
    // five pixels across up there, and the visor starts at two and a half.
    ctx.fillStyle = CAP_VISOR_COLOR;
    ctx.beginPath();
    ctx.moveTo(2.5, -5.3);
    ctx.lineTo(7.3, -4.4);
    ctx.lineTo(7.1, -3.3);
    ctx.lineTo(2.5, -3.5);
    ctx.closePath();
    ctx.fill();
}

/** The player's eyes: black, taller than they are wide, and set above the middle. */
function drawMunchEyes(ctx, dirEnum) {
    const dx = dirEnum === 1 ? -0.45 : dirEnum === 3 ? 0.45 : 0;
    const dy = dirEnum === 0 ? -0.45 : dirEnum === 2 ? 0.45 : 0;

    ctx.fillStyle = EYE_COLOR;
    for (const ex of MUNCH_EYES) {
        ctx.beginPath();
        ctx.ellipse(ex + dx, -1.6 + dy, 0.78, 1.38, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * The player, drawn at (x, y), facing `dirEnum`, mid-chomp on `frame`.
 *
 * `angle` overrides the frame, which is how the death animation opens the mouth all the way
 * rather than animating through four frames.
 */
export function drawPacman(ctx, x, y, dirEnum, frame, options = {}) {
    const { color = PLAYER_COLOR, scale = 1, alpha = 1, angle } = options;
    const bite = angle === undefined ? MOUTH[frame % MOUTH.length] : angle;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    // The head is a circle, so turning it costs nothing and puts the mouth where he is
    // going. Nothing else on the sprite turns.
    ctx.save();
    ctx.rotate(FACE_ANGLE[dirEnum] || 0);
    ctx.beginPath();
    ctx.moveTo(MOUTH_CORNER, 0);
    ctx.arc(0, 0, MUNCH_RADIUS, bite, Math.PI * 2 - bite);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    drawLegs(ctx, frame, color);
    drawCap(ctx);
    drawMunchEyes(ctx, dirEnum);

    ctx.restore();
}

/**
 * The player's death, `t` running 0 to 1 across the whole sequence.
 *
 * The first four-fifths opens the bite past a right angle until the head is in two pieces,
 * and the rest is the burst: six shards thrown outward, fading as they go.
 */
export function drawPacmanDying(ctx, x, y, dirEnum, t) {
    if (t < 0.8) {
        // Split the shape in two by opening the bite past a right angle: the two halves
        // are then joined only at a point, and the player reads as breaking rather than as
        // chewing. drawPacman owns the rotation now, so the direction is passed through
        // rather than applied to the context here as well.
        drawPacman(ctx, x, y, dirEnum, 0, { angle: 1.35 * (t / 0.8) });
        return;
    }

    ctx.save();
    ctx.translate(x, y);

    const p = (t - 0.8) / 0.2;
    const reach = 3 + p * 9;
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = PLAYER_COLOR;

    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + p * 0.9;
        const spread = 0.42;
        ctx.save();
        ctx.translate(Math.cos(angle) * reach, Math.sin(angle) * reach);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(-spread) * 4.2, Math.sin(-spread) * 4.2);
        ctx.lineTo(Math.cos(spread) * 4.2, Math.sin(spread) * 4.2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    ctx.restore();
}

// ---------------------------------------------------------------- ghosts

/*
 * The four.
 *
 * Ghost-shaped, because a thing that chases you through a maze should look like a thing
 * that chases you. What makes them four characters rather than one shape in four colours
 * is the face and the outline together:
 *
 *   Rook  red,    a spiked crown and a scowl. He is the one that comes for you.
 *   Pip   blue,   smooth and square-footed and scowling. He is the one that waits.
 *   Nix   purple, wearing somebody's flat cap, and bored. He is the one already ahead of
 *                 you, and he knows it.
 *   Bram  green,  round, with a grin full of teeth. He is the one that runs.
 *
 * The feet are square rather than the arcade's wavy hem, and they step in two frames. The
 * bodies do not turn to face the way they are travelling — only the eyes do, which is what
 * tells you a corner is coming, and a ghost that spun around would lose that.
 */

const GHOST_TOP = 1.2;      // where the dome springs from the sides
const GHOST_HALF = 6.6;     // half the width
const GHOST_FOOT_DOWN = 5.4;
const GHOST_FOOT_UP = 2.4;

/** Four square feet, in two steps. */
const FEET = [
    [
        [6.6, GHOST_FOOT_UP], [4.95, GHOST_FOOT_DOWN], [3.3, GHOST_FOOT_UP], [1.65, GHOST_FOOT_DOWN],
        [0, GHOST_FOOT_UP], [-1.65, GHOST_FOOT_DOWN], [-3.3, GHOST_FOOT_UP], [-4.95, GHOST_FOOT_DOWN],
        [-6.6, GHOST_FOOT_UP]
    ],
    [
        [6.6, GHOST_FOOT_UP], [4.95, GHOST_FOOT_UP], [3.3, GHOST_FOOT_DOWN], [1.65, GHOST_FOOT_UP],
        [0, GHOST_FOOT_DOWN], [-1.65, GHOST_FOOT_UP], [-3.3, GHOST_FOOT_DOWN], [-4.95, GHOST_FOOT_UP],
        [-6.6, GHOST_FOOT_UP]
    ]
];

/** The crown of spikes, for the one ghost with hair. */
const SPIKES = [
    [-5.1, -6.4], [-3.4, -2.4], [-1.7, -7.4], [0, -3.0], [1.7, -7.4], [3.4, -2.4], [5.1, -6.4]
];

/**
 * The four, in the order the plan lists them. No colours: those live with the plan, so
 * there is one place that says what each ghost is.
 */
const GHOSTS = [
    { name: "rook", spikes: true, brow: "angry", mouth: null },
    { name: "pip", spikes: false, brow: "angry", mouth: null },
    { name: "nix", spikes: false, brow: "sleepy", mouth: null, cap: true },
    { name: "bram", spikes: false, brow: "angry", mouth: "grin" }
];

/**
 * A ghost, 14 pixels across, centred on (x, y).
 *
 * `eyesOnly` draws the floating eyes of a ghost that has been eaten — which travel faster
 * than anything else on the board, so they need to read clearly at a glance.
 */
export function drawGhost(ctx, x, y, options = {}) {
    const {
        index = 0,
        frame = 0,
        dirEnum = 3,
        color,
        scared = false,
        flashing = false,
        eyesOnly = false
    } = options;

    const ghost = GHOSTS[index % GHOSTS.length];
    const bodyColor = scared ? (flashing ? "#FFFFFF" : FRIGHTENED_COLOR) : color;

    ctx.save();
    ctx.translate(x, y);

    if (!eyesOnly) {
        ctx.beginPath();
        ctx.moveTo(-GHOST_HALF, -GHOST_TOP);

        if (ghost.spikes) {
            for (const [sx, sy] of SPIKES) ctx.lineTo(sx, sy);
            ctx.lineTo(GHOST_HALF, -GHOST_TOP);
        } else {
            ctx.quadraticCurveTo(-GHOST_HALF, -8.4, 0, -8.4);
            ctx.quadraticCurveTo(GHOST_HALF, -8.4, GHOST_HALF, -GHOST_TOP);
        }

        ctx.lineTo(GHOST_HALF, GHOST_FOOT_UP);
        for (const [fx, fy] of FEET[frame % FEET.length]) ctx.lineTo(fx, fy);
        ctx.closePath();
        ctx.fillStyle = bodyColor;
        ctx.fill();

        if (!scared && ghost.brow) drawBrows(ctx, ghost.brow);
        if (!scared && ghost.cap) drawFlatCap(ctx);
        if (!scared && ghost.mouth) drawGrin(ctx);
    }

    if (eyesOnly) drawEyes(ctx, dirEnum);
    else if (scared) drawFrightenedFace(ctx, flashing);
    else drawEyes(ctx, dirEnum);

    ctx.restore();
}

/**
 * The eyes: white blobs with black pupils, looking where the ghost is going.
 *
 * The pupils shift a pixel in the direction of travel, which is the only cue a player gets
 * about a turn before it happens.
 */
function drawEyes(ctx, dirEnum) {
    const dx = dirEnum === 1 ? -1.15 : dirEnum === 3 ? 1.15 : 0;
    const dy = dirEnum === 0 ? -1.15 : dirEnum === 2 ? 1.15 : 0;

    ctx.fillStyle = "#FFFFFF";
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 2.5, -0.9, 1.85, 2.1, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.fillStyle = INK_COLOR;
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 2.5 + dx, -0.9 + dy, 0.85, 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * The brows, which are most of what makes four ghosts four characters.
 *
 * `angry` slants the inner ends down towards the nose. `sleepy` is a flat lid dropped over
 * the top of each eye, which is the whole of Nix's opinion of the chase.
 */
function drawBrows(ctx, mood) {
    ctx.fillStyle = INK_COLOR;

    for (const side of [-1, 1]) {
        if (mood === "angry") {
            ctx.save();
            ctx.translate(side * 2.5, -3.3);
            ctx.rotate(-side * 0.3);
            ctx.fillRect(-2.3, -0.55, 4.6, 1.1);
            ctx.restore();
        } else {
            ctx.fillRect(side * 2.5 - 1.9, -3.0, 3.8, 1.0);
        }
    }
}

/** The cap Nix is wearing, and the whole of his personality. */
function drawFlatCap(ctx) {
    ctx.fillStyle = "#9E9E9E";
    ctx.beginPath();
    ctx.moveTo(-5.2, -6.4);
    ctx.quadraticCurveTo(-4.6, -9.6, 0.4, -9.2);
    ctx.quadraticCurveTo(4.4, -8.8, 5.0, -6.4);
    ctx.closePath();
    ctx.fill();

    // The band, wider than the crown, and darker so the cap has a front at fourteen pixels.
    ctx.fillStyle = "#616161";
    ctx.beginPath();
    ctx.moveTo(-7.4, -6.2);
    ctx.lineTo(5.6, -6.6);
    ctx.lineTo(5.4, -5.2);
    ctx.lineTo(-7.4, -4.8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(-1.4, -8.8, 3.4, 0.9);
}

/** Bram's grin: a row of square teeth, because he is the one that is enjoying this. */
function drawGrin(ctx) {
    ctx.fillStyle = "#FFFFFF";
    const teeth = [[-4.2, 1.4, 2.0, 1.2], [-1.6, 1.6, 1.6, 1.2], [0.6, 1.4, 1.6, 1.2], [2.6, 1.2, 1.4, 1.2]];
    for (const [tx, ty, tw, th] of teeth) ctx.fillRect(tx, ty, tw, th);
}

/** Two dot eyes and a saw-tooth mouth, in amber on the indigo of a frightened ghost. */
function drawFrightenedFace(ctx, flashing) {
    const color = flashing ? "#FF5252" : "#FFD54F";

    ctx.fillStyle = color;
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 2.5, -1.2, 0.95, 1.15, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    const teeth = [];
    for (let i = 0; i <= 7; i++) teeth.push([-4.4 + i * 1.25, 3.0 - (i % 2) * 1.2]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.9;
    ctx.lineJoin = "round";
    ctx.beginPath();
    tracePath(ctx, teeth.slice().reverse());
    ctx.stroke();
}

// ----------------------------------------------------------------- fruit

/*
 * The fruit ladder, drawn rather than stored.
 *
 * Every one of these is a small still life in about a dozen pixels: a body, a stalk, a
 * leaf. They are grouped by the shape they need rather than alphabetically, so the pairs
 * that share a shape (orange/apple, pear/banana) sit next to each other.
 */
const FRUIT_PAINTERS = {
    cherry(ctx) {
        ctx.strokeStyle = "#00A000";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-3, 2);
        ctx.quadraticCurveTo(0, -4, 5, -5);
        ctx.moveTo(2, 3);
        ctx.quadraticCurveTo(2, -3, 5, -5);
        ctx.stroke();
        ctx.fillStyle = "#FF5252";
        circle(ctx, -3, 3, 2.6);
        circle(ctx, 2.5, 4, 2.6);
    },

    strawberry(ctx) {
        ctx.fillStyle = "#E53935";
        ctx.beginPath();
        ctx.moveTo(-5, -1);
        ctx.quadraticCurveTo(0, 8, 5, -1);
        ctx.quadraticCurveTo(0, -3, -5, -1);
        ctx.fill();
        ctx.fillStyle = "#43A047";
        ctx.beginPath();
        ctx.moveTo(-5, -2);
        ctx.lineTo(0, -6);
        ctx.lineTo(5, -2);
        ctx.lineTo(0, 0);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        for (const [dx, dy] of [[-2, 1], [0, 2], [2, 1], [-1, 4], [1, 4]]) {
            ctx.fillRect(dx, dy, 1, 1);
        }
    },

    orange(ctx) {
        ctx.fillStyle = "#FB8C00";
        circle(ctx, 0, 1, 5);
        ctx.strokeStyle = "#43A047";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(0, -6);
        ctx.stroke();
        ctx.fillStyle = "#43A047";
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.quadraticCurveTo(4, -7, 5, -4);
        ctx.quadraticCurveTo(2, -3, 0, -5);
        ctx.fill();
    },

    apple(ctx) {
        ctx.fillStyle = "#E53935";
        circle(ctx, -2, 1, 4);
        circle(ctx, 2, 1, 4);
        ctx.strokeStyle = "#43A047";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(0.5, -6);
        ctx.stroke();
        ctx.fillStyle = "#43A047";
        ctx.beginPath();
        ctx.moveTo(0.5, -5);
        ctx.quadraticCurveTo(5, -6, 5, -3);
        ctx.quadraticCurveTo(2, -3, 0.5, -5);
        ctx.fill();
    },

    melon(ctx) {
        ctx.fillStyle = "#00C853";
        ctx.beginPath();
        ctx.ellipse(0, 1, 5, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = -3; i <= 3; i++) {
            ctx.moveTo(i * 1.6, -5);
            ctx.lineTo(i * 1.6, 7);
        }
        ctx.stroke();
    },

    galaxian(ctx) {
        ctx.fillStyle = "#FFD54F";
        ctx.beginPath();
        ctx.moveTo(0, 6);
        ctx.lineTo(-5, -1);
        ctx.lineTo(-2, -1);
        ctx.lineTo(-2, -4);
        ctx.lineTo(2, -4);
        ctx.lineTo(2, -1);
        ctx.lineTo(5, -1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#EF5350";
        ctx.fillRect(-1, -2, 2, 3);
    },

    bell(ctx) {
        ctx.fillStyle = "#FFD54F";
        ctx.beginPath();
        ctx.moveTo(-5, 4);
        ctx.quadraticCurveTo(-5, -5, 0, -5);
        ctx.quadraticCurveTo(5, -5, 5, 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(-6, 4, 12, 2);
        ctx.fillStyle = "#B0BEC5";
        ctx.fillRect(-1, 6, 2, 2);
    },

    key(ctx) {
        ctx.strokeStyle = "#4FC3F7";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -3, 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(-1, 0, 2, 7);
        ctx.fillRect(0, 4, 3, 2);
        ctx.fillRect(0, 1, 2, 2);
    },

    pretzel(ctx) {
        ctx.strokeStyle = "#C08040";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0.6, Math.PI * 1.7);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-2, 2, 3, -1.2, Math.PI);
        ctx.moveTo(4, 2);
        ctx.arc(2, 2, 3, 0.2, Math.PI * 1.6);
        ctx.stroke();
    },

    pear(ctx) {
        ctx.fillStyle = "#00C853";
        ctx.beginPath();
        ctx.moveTo(0, 7);
        ctx.quadraticCurveTo(-6, 1, -2, -3);
        ctx.quadraticCurveTo(0, -5, 2, -3);
        ctx.quadraticCurveTo(6, 1, 0, 7);
        ctx.fill();
        ctx.strokeStyle = "#795548";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(1, -6);
        ctx.stroke();
    },

    banana(ctx) {
        ctx.fillStyle = "#FFD54F";
        ctx.beginPath();
        ctx.moveTo(-5, -3);
        ctx.quadraticCurveTo(-1, 6, 6, 3);
        ctx.quadraticCurveTo(0, 4, -3, -4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#795548";
        ctx.lineWidth = 1;
        ctx.stroke();
    }
};

function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

/** Draws a fruit by name, centred on (x, y). Unknown names draw nothing. */
export function drawFruit(ctx, x, y, name, scale = 1) {
    const painter = FRUIT_PAINTERS[name];
    if (!painter) return;

    ctx.save();
    ctx.translate(x, y);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    painter(ctx);
    ctx.restore();
}

// ----------------------------------------------------------------- scores

/**
 * The score left behind by an eaten ghost or fruit.
 *
 * Drawn in the app's own face rather than as pixel paths: the numbers are 200, 400, 800 and
 * 1600, they are on screen for a second or two, and a hand-built bitmap font for four
 * strings is a lot of table for very little gain. The tint is a pale blue one step below
 * the frightened-ghost colour, so a score reads as part of the same board. It is not
 * derived from the maze's wall stroke -- that changed, and a literal that claimed to
 * follow it would have been a comment rotting next to a constant.
 */
export function drawScore(ctx, x, y, points) {
    ctx.save();
    ctx.font = '700 7px Sora, "DM Sans", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#C5CAE9";
    ctx.fillText(String(points), x, y);
    ctx.restore();
}

export { MOUTH, FACE_ANGLE, GHOSTS, FEET };