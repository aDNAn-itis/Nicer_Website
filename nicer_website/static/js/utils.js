export const ROOT = '/';
export const ITEM_TYPES = ['file', 'dir'];

/**
 * Joins an array of path parts into a single path string, ensuring no duplicate separators.
 *
 * @param {string[]} parts - The array of path parts to join.
 * @param {string} [sep='/'] - The separator to use for joining the parts.
 * @returns {string} - The joined path string.
 */
export function pathJoin(parts, sep = '/') {
    return parts.join(sep).replace(new RegExp(sep + '{1,}', 'g'), sep);
}
