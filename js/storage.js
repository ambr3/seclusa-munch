/*
 * Saved score.
 *
 * One number, under the app's `ssc.` prefix so it lives beside the shared theme
 * preferences rather than in the origin-wide namespace where any other script on the
 * page could read or clear it.
 *
 * Everything is wrapped. The value is plaintext that a user can edit, so a corrupt one
 * must not be able to stop the game booting, and storage being unavailable — private
 * browsing, a full quota — must not either. In both cases the score simply lives in memory
 * for the session.
 */

const KEY = "ssc.munch_high_score";

/*
 * Keys this game used to write scores under, oldest first.
 *
 * They are read once and folded into the new one so nobody loses a record by the game
 * being renamed. Nothing writes them again. Clear removes them too, or the next visit
 * would treat the old copy as the record.
 */
const LEGACY_KEYS = ["ssc.pacman_high_scores", "highScores"];

export class Scores {
    constructor() {
        this.best = this.load();
    }

    load() {
        let raw = null;
        try {
            raw = localStorage.getItem(KEY);
            for (const key of LEGACY_KEYS) {
                if (raw) break;
                raw = localStorage.getItem(key);
            }
        } catch (err) {
            return 0;
        }
        if (!raw) return 0;

        let stored;
        try {
            stored = JSON.parse(raw);
        } catch (err) {
            return 0;
        }

        // Every legacy shape is folded down to one number: the new key holds a bare
        // number; the older ones, written by the fork this grew out of, an object keyed by
        // game and by turbo setting. A hand-edited file must not be able to paint a
        // nonsense record on the title screen, so anything that is not a whole number of
        // points is skipped rather than coerced. The integer test matters as much as the
        // finite one: a score is written straight into the header as text, and 12.5 or 1e21
        // would put something there that no amount of play can produce.
        const candidates = Array.isArray(stored)
            ? stored
            : typeof stored === "object" && stored !== null
              ? Object.values(stored)
              : [stored];

        let best = 0;
        for (const value of candidates) {
            const score = Number(value);
            if (!Number.isSafeInteger(score) || score <= best) continue;
            best = score;
        }
        return best;
    }

    get() {
        return this.best;
    }

    /** Records a score, and reports whether it is the first time it has beaten the record. */
    submit(score) {
        // Nothing but a real score can reach here — the only callers add the points table's
        // own numbers — but the record outlives the session and is written to the header as
        // text, so it is worth refusing anything that is not one rather than storing "NaN".
        if (!Number.isSafeInteger(score) || score <= this.best) return false;
        this.best = score;
        this.save();
        return true;
    }

    save() {
        try {
            localStorage.setItem(KEY, String(this.best));
        } catch (err) {
            /* the score stays in memory for this session */
        }
    }

    /** Forgets the record, including the names this game used before it was renamed. */
    clear() {
        this.best = 0;
        try {
            localStorage.removeItem(KEY);
            for (const key of LEGACY_KEYS) localStorage.removeItem(key);
        } catch (err) {
            /* already gone from this session */
        }
    }
}