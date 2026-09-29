/* Pixel art for the home page town.
   Everything is drawn in code at 16px per tile, so there are no image assets to load. */
window.TownArt = (() => {
    const T = 16;

    const C = {
        ink: '#262a36',
        grass: '#86cf6c', grassDark: '#68b458', grassLight: '#a8e08a', grassDeep: '#4b9447',
        tall: '#57ad55', tallDark: '#3e8b45', tallLight: '#84cf6c', tallInk: '#2d6a37',
        dirt: '#e8cb8f', dirtDark: '#d2b073', dirtLight: '#f4dfb1', dirtEdge: '#b98f55',
        stone: '#ddd8cc', stoneDark: '#c2bbab', stoneLight: '#f1ede4', stoneEdge: '#9f9888',
        water: '#56a6e6', waterDeep: '#4892d6', waterLight: '#95d1fa', foam: '#e8f7ff',
        wood: '#c08a52', woodDark: '#8d5d31', woodLight: '#ddac72', woodDeep: '#5f3d20',
        leaf: '#4dac50', leafDark: '#347d3d', leafLight: '#76c962', leafHi: '#a3e184', leafInk: '#22492b',
        trunk: '#8c5b33', trunkDark: '#5e3b1f', trunkLight: '#ab7646',
        wall: '#f4efe1', wallShade: '#ddd3bc', trim: '#b8966b', trimDark: '#8f7048',
        glass: '#8fd2ff', glassDark: '#5ba6e6', glassHi: '#e6f6ff', lit: '#ffd76a', litDark: '#f0b340', litHi: '#fff3c4',
        door: '#a3663b', doorDark: '#704323', knob: '#f4c542', doorway: '#1d1b26',
        white: '#fbfbf7', grey: '#b9bdc7', greyDark: '#8e94a0', greyLight: '#dde0e6', greyInk: '#5b616e',
        red: '#e05b50', redDark: '#ae3f38', redLight: '#f08c78',
        blue: '#4270d6', blueDark: '#2d4fa4', blueLight: '#79a0ee',
        teal: '#5a8f9e', tealDark: '#40707e', tealLight: '#83b6c3',
        green: '#4f9d58', greenDark: '#367143', greenLight: '#7cc27f',
        yellow: '#ffd84a', pink: '#f59ac0', orange: '#ee8a3c', iron: '#3b4150', ironLight: '#5d6577',
        shadow: 'rgba(24, 40, 32, 0.22)',
    };

    /* ---------- helpers ---------- */

    function makeCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        return { c, g };
    }

    function hash(x, y, k = 0) {
        let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(k | 0, 1442695041);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    function fill(g, x, y, w, h, col) {
        g.fillStyle = col;
        g.fillRect(x, y, w, h);
    }

    function dot(g, x, y, col) {
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
    }

    function ellipse(g, cx, cy, rx, ry, col) {
        g.fillStyle = col;
        for (let y = -ry; y <= ry; y++) {
            const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.5))));
            if (half > 0) g.fillRect(cx - half, cy + y, half * 2, 1);
        }
    }

    // Paint a filled shape from a membership test, outlining its edge.
    function paintShape(g, w, h, inside, shade, outline) {
        const m = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = inside(x, y) ? 1 : 0;
        const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!at(x, y)) continue;
                const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
                dot(g, x, y, edge ? outline : shade(x, y));
            }
        }
    }

    // Sprites written as rows of characters, looked up in a palette ('.' is transparent)
    function fromRows(rows, pal, mirror = false) {
        const h = rows.length;
        const w = rows[0].length;
        const { c, g } = makeCanvas(w, h);
        rows.forEach((row, y) => {
            if (row.length !== w) console.warn('TownArt: row width', row.length, 'expected', w, row);
            for (let x = 0; x < w; x++) {
                const col = pal[row[x]];
                if (col) dot(g, mirror ? w - 1 - x : x, y, col);
            }
        });
        return c;
    }

    /* ---------- 3x5 lettering for signs painted on buildings ---------- */

    const GLYPHS = {
        A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
        E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
        I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
        M: '1000111011101011000110001', N: '10011101101110011001', O: '010101101101010', P: '110101110100100',
        Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
        U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
        Y: '101101010010010', Z: '111001010100111',
        0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
        4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
        8: '111101111101111', 9: '111101111001110',
        '.': '00001', '-':'000000111000000', '+': '000010111010000', '!': '010010010000010', "'": '010010000000000',
        ' ': '000000000000000',
    };

    // most glyphs are 3 wide; a few (M, N) need more room to read clearly, and '.' needs less
    const glyphWidth = (ch) => (GLYPHS[ch] || GLYPHS[' ']).length / 5;

    function pixelText(g, str, x, y, col) {
        let cx = x;
        for (const ch of str.toUpperCase()) {
            const bits = GLYPHS[ch] || GLYPHS[' '];
            const w = bits.length / 5;
            for (let i = 0; i < bits.length; i++) if (bits[i] === '1') dot(g, cx + (i % w), y + Math.floor(i / w), col);
            cx += w + 1;
        }
    }

    const textWidth = (s) => [...s.toUpperCase()].reduce((sum, ch) => sum + glyphWidth(ch) + 1, 0) - 1;

    /* ---------- ground tiles ---------- */

    const HARD = new Set(['=', 'o', '#']);
    const WATERY = new Set(['~', '#']);

    // Distance in px from a tile's "soft" edges, with rounded outer corners and notched inner corners.
    function edgeDistance(px, py, nb, R = 4, N = 1) {
        let d = 99;
        if (nb.n) d = Math.min(d, py);
        if (nb.s) d = Math.min(d, 15 - py);
        if (nb.w) d = Math.min(d, px);
        if (nb.e) d = Math.min(d, 15 - px);
        const round = (qx, qy) => Math.max(0, Math.floor(R - Math.hypot(R - qx, R - qy) + 0.35));
        if (nb.n && nb.w && px < R && py < R) d = Math.min(d, round(px, py));
        if (nb.n && nb.e && px > 15 - R && py < R) d = Math.min(d, round(15 - px, py));
        if (nb.s && nb.w && px < R && py > 15 - R) d = Math.min(d, round(px, 15 - py));
        if (nb.s && nb.e && px > 15 - R && py > 15 - R) d = Math.min(d, round(15 - px, 15 - py));
        const notch = (qx, qy) => Math.max(0, Math.floor(Math.hypot(qx + 0.5, qy + 0.5) - N));
        const M = N + 4;
        if (!nb.n && !nb.w && nb.nw && px < M && py < M) d = Math.min(d, notch(px, py));
        if (!nb.n && !nb.e && nb.ne && px > 15 - M && py < M) d = Math.min(d, notch(15 - px, py));
        if (!nb.s && !nb.w && nb.sw && px < M && py > 15 - M) d = Math.min(d, notch(px, 15 - py));
        if (!nb.s && !nb.e && nb.se && px > 15 - M && py > 15 - M) d = Math.min(d, notch(15 - px, 15 - py));
        return d;
    }

    function neighbours(map, tx, ty, isSoft) {
        const k = (dx, dy) => isSoft(map.get(tx + dx, ty + dy));
        return { n: k(0, -1), s: k(0, 1), w: k(-1, 0), e: k(1, 0), nw: k(-1, -1), ne: k(1, -1), sw: k(-1, 1), se: k(1, 1) };
    }

    function grassTile(g, ox, oy, tx, ty) {
        fill(g, ox, oy, T, T, C.grass);
        for (let i = 0; i < 3; i++) {
            if (hash(tx, ty, i + 1) < 0.3) continue;
            const x = 1 + ((hash(tx, ty, i + 11) * 11) | 0);
            const y = 2 + ((hash(tx, ty, i + 21) * 11) | 0);
            dot(g, ox + x, oy + y, C.grassDark);
            dot(g, ox + x + 2, oy + y, C.grassDark);
            dot(g, ox + x + 1, oy + y + 1, C.grassDark);
            dot(g, ox + x + 1, oy + y - 1, C.grassLight);
        }
        if (hash(tx, ty, 40) < 0.5) dot(g, ox + ((hash(tx, ty, 41) * 16) | 0), oy + ((hash(tx, ty, 42) * 16) | 0), C.grassLight);
    }

    const TUFT = [
        '...o....',
        '..olo...',
        '.olllo.o',
        '.ollmo.o',
        'olmmmdoo',
        'olmmddol',
        'odmdddol',
        '.oddddo.',
    ];

    function tallGrassTile(g, ox, oy) {
        fill(g, ox, oy, T, T, C.tallDark);
        const pal = { o: C.tallInk, l: C.tallLight, m: C.tall, d: C.tallDark };
        for (const [qx, qy] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
            TUFT.forEach((row, y) => {
                for (let x = 0; x < 8; x++) if (pal[row[x]]) dot(g, ox + qx + x, oy + qy + y, pal[row[x]]);
            });
        }
    }

    const FLOWER_COLOURS = [[C.red, C.redDark], [C.white, C.greyLight], [C.yellow, '#e3b52d'], [C.pink, '#d9709d']];

    function flowerTile(g, ox, oy, tx, ty, frame) {
        grassTile(g, ox, oy, tx, ty);
        const [petal, petalDark] = FLOWER_COLOURS[(hash(tx, ty, 7) * FLOWER_COLOURS.length) | 0];
        const sway = frame % 2;
        for (const [fx, fy] of [[2, 2], [9, 9]]) {
            const x = ox + fx + sway;
            const y = oy + fy;
            dot(g, ox + fx + 2, y + 5, C.grassDeep);
            dot(g, ox + fx + 1, y + 6, C.grassDeep);
            dot(g, ox + fx + 3, y + 6, C.grassDeep);
            fill(g, x + 1, y, 2, 1, petal);
            fill(g, x, y + 1, 4, 2, petal);
            fill(g, x + 1, y + 3, 2, 1, petalDark);
            dot(g, x, y + 3, petalDark);
            dot(g, x + 3, y + 3, petalDark);
            fill(g, x + 1, y + 1, 2, 2, C.yellow);
            dot(g, x + 1, y + 1, '#fff6c9');
        }
    }

    function pavedTile(g, ox, oy, tx, ty, map, kind) {
        const nb = neighbours(map, tx, ty, (k) => !HARD.has(k) && !WATERY.has(k));
        const isPath = kind === '=';
        for (let py = 0; py < T; py++) {
            for (let px = 0; px < T; px++) {
                const d = edgeDistance(px, py, nb);
                let col;
                if (d <= 0) col = C.grass;
                else if (d === 1) col = (px + py + tx) % 3 === 0 ? C.grassDark : C.grass;
                else if (d === 2) col = isPath ? C.dirtEdge : C.stoneEdge;
                else if (isPath) {
                    const r = hash(tx * 16 + px, ty * 16 + py, 3);
                    col = r < 0.06 ? C.dirtDark : r > 0.97 ? C.dirtLight : C.dirt;
                } else {
                    const gx = (px + (Math.floor((ty * 16 + py) / 8) % 2) * 4) % 8;
                    const gy = (ty * 16 + py) % 8;
                    if (gx === 0 || gy === 0) col = C.stoneDark;
                    else if (gx === 1 || gy === 1) col = C.stoneLight;
                    else col = hash(tx * 16 + px, ty * 16 + py, 5) < 0.04 ? C.stoneDark : C.stone;
                }
                dot(g, ox + px, oy + py, col);
            }
        }
    }

    function waterTile(g, ox, oy, tx, ty, map, frame) {
        const nb = neighbours(map, tx, ty, (k) => !WATERY.has(k));
        for (let py = 0; py < T; py++) {
            for (let px = 0; px < T; px++) {
                const d = edgeDistance(px, py, nb, 8, 1);
                let col;
                if (d <= 0) col = C.grass;
                else if (d === 1) col = C.grassDeep;
                else if (d === 2) col = C.foam;
                else if (d === 3) col = C.waterLight;
                else col = ((ty * 16 + py) + Math.floor((tx * 16 + px) / 6)) % 7 === 0 ? C.waterDeep : C.water;
                dot(g, ox + px, oy + py, col);
            }
        }
        // drifting ripples
        for (let i = 0; i < 2; i++) {
            const phase = (frame + i * 2 + ((hash(tx, ty, i) * 4) | 0)) % 4;
            if (phase === 3) continue;
            const x = 4 + ((hash(tx, ty, i + 5) * 6) | 0) + phase;
            const y = 4 + ((hash(tx, ty, i + 9) * 8) | 0);
            if (edgeDistance(x, y, nb, 8, 1) < 5 || edgeDistance(x + 3, y, nb, 8, 1) < 5) continue;
            fill(g, ox + x, oy + y, phase === 1 ? 4 : 3, 1, C.waterLight);
            if (phase === 1) dot(g, ox + x + 1, oy + y - 1, C.foam);
        }
    }

    function dockTile(g, ox, oy, tx, ty, map, frame) {
        waterTile(g, ox, oy, tx, ty, map, frame);
        const isDock = (dx, dy) => map.get(tx + dx, ty + dy) === '#';
        const left = !isDock(-1, 0);
        const right = !isDock(1, 0);
        const end = !isDock(0, 1) && WATERY.has(map.get(tx, ty + 1));
        const x0 = left ? 1 : 0;
        const x1 = right ? 14 : 15;
        const bottom = end ? 12 : 15;
        for (let py = 0; py <= bottom; py++) {
            const gap = py % 4 === 3;
            for (let px = x0; px <= x1; px++) {
                let col = gap ? C.woodDark : py % 4 === 0 ? C.woodLight : C.wood;
                if ((px === x0 && left) || (px === x1 && right)) col = C.woodDeep;
                dot(g, ox + px, oy + py, col);
            }
            if (!gap && py % 4 === 1) {
                if (left) dot(g, ox + x0 + 2, oy + py, C.woodDeep);
                if (right) dot(g, ox + x1 - 2, oy + py, C.woodDeep);
            }
        }
        if (end) {
            fill(g, ox + x0, oy + bottom, x1 - x0 + 1, 1, C.woodDeep);
            fill(g, ox + x0, oy + bottom + 1, x1 - x0 + 1, 1, C.waterDeep);
            if (left) fill(g, ox + 1, oy + bottom - 1, 2, 4, C.woodDeep);
            if (right) fill(g, ox + 13, oy + bottom - 1, 2, 4, C.woodDeep);
        }
    }

    function drawGroundTile(g, map, tx, ty, frame) {
        const ox = tx * T;
        const oy = ty * T;
        const kind = map.get(tx, ty);
        switch (kind) {
            case '"': tallGrassTile(g, ox, oy); break;
            case '*': flowerTile(g, ox, oy, tx, ty, frame); break;
            case '=':
            case 'o': pavedTile(g, ox, oy, tx, ty, map, kind); break;
            case '~': waterTile(g, ox, oy, tx, ty, map, frame); break;
            case '#': dockTile(g, ox, oy, tx, ty, map, frame); break;
            default: grassTile(g, ox, oy, tx, ty);
        }
    }

    function renderGround(map, frame) {
        const { c, g } = makeCanvas(map.w * T, map.h * T);
        for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) drawGroundTile(g, map, tx, ty, frame);
        return c;
    }

    // The front blades of tall grass, drawn over a character's feet
    function tallGrassFront() {
        const { c, g } = makeCanvas(T, 8);
        const pal = { o: C.tallInk, l: C.tallLight, m: C.tall, d: C.tallDark };
        for (const qx of [0, 8]) {
            TUFT.slice(2).forEach((row, y) => {
                for (let x = 0; x < 8; x++) if (pal[row[x]]) dot(g, qx + x, y + 2, pal[row[x]]);
            });
        }
        return c;
    }

    /* ---------- nature ---------- */

    // Round, clumpy canopy: each clump is shaded like a small ball lit from the top left
    function canopy(g, w, h, clumps, pal) {
        const owner = (x, y) => {
            let found = -1;
            clumps.forEach(([cx, cy, r], i) => {
                if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1) found = i;
            });
            return found;
        };
        paintShape(g, w, h, (x, y) => owner(x, y) >= 0, (x, y) => {
            const i = owner(x, y);
            const [cx, cy, r] = clumps[i];
            if (owner(x - 1, y - 1) !== i && owner(x - 1, y - 1) >= 0) return pal.dark;
            const t = ((x - cx) + (y - cy)) / r;
            if (t < -1.0) return pal.hi;
            if (t < -0.3) return pal.light;
            if (t < 0.55) return pal.base;
            return pal.dark;
        }, pal.ink);
    }

    const LEAVES = { hi: C.leafHi, light: C.leafLight, base: C.leaf, dark: C.leafDark, ink: C.leafInk };

    function tree() {
        const { c, g } = makeCanvas(32, 40);
        ellipse(g, 16, 36, 12, 3, C.shadow);
        fill(g, 13, 24, 6, 13, C.trunk);
        fill(g, 13, 24, 1, 13, C.trunkLight);
        fill(g, 17, 24, 2, 13, C.trunkDark);
        fill(g, 12, 24, 1, 13, C.leafInk);
        fill(g, 19, 24, 1, 13, C.leafInk);
        fill(g, 11, 35, 10, 2, C.trunkDark);
        fill(g, 11, 37, 10, 1, C.leafInk);
        dot(g, 11, 34, C.leafInk);
        dot(g, 20, 34, C.leafInk);
        const { c: top, g: tg } = makeCanvas(32, 32);
        canopy(tg, 32, 32, [[16, 7, 7], [9, 11, 7], [23, 11, 7], [16, 14, 8], [8, 19, 7], [24, 19, 7], [12, 22, 6], [20, 22, 6]], LEAVES);
        g.drawImage(top, 0, 0);
        return c;
    }

    function bush() {
        const { c, g } = makeCanvas(16, 16);
        ellipse(g, 8, 13, 7, 2, C.shadow);
        const { c: top, g: tg } = makeCanvas(16, 15);
        canopy(tg, 16, 15, [[8, 5, 5], [4, 9, 4], [12, 9, 4], [8, 9, 5]], LEAVES);
        g.drawImage(top, 0, 0);
        return c;
    }

    function rock() {
        const { c, g } = makeCanvas(16, 16);
        ellipse(g, 8, 13, 6, 2, C.shadow);
        const { c: r, g: rg } = makeCanvas(16, 14);
        paintShape(rg, 16, 14, (x, y) => ((x - 8) / 6.5) ** 2 + ((y - 8) / 5) ** 2 <= 1, (x, y) => {
            const t = (x - 8) + (y - 7);
            return t < -5 ? C.greyLight : t < 3 ? C.grey : C.greyDark;
        }, C.greyInk);
        g.drawImage(r, 0, 0);
        return c;
    }

    /* ---------- props ---------- */

    function fence(leftEnd, rightEnd) {
        const { c, g } = makeCanvas(16, 16);
        const rail = (y) => {
            fill(g, 0, y, 16, 2, C.white);
            fill(g, 0, y + 1, 16, 1, C.greyLight);
            fill(g, 0, y + 2, 16, 1, C.greyDark);
        };
        rail(6);
        rail(10);
        for (const px of [1, 5, 9, 13]) {
            fill(g, px, 3, 2, 11, C.white);
            fill(g, px + 1, 4, 1, 10, C.greyLight);
            dot(g, px, 2, C.greyDark);
            dot(g, px + 1, 2, C.greyDark);
            fill(g, px - 1, 3, 1, 11, C.greyDark);
            fill(g, px + 2, 3, 1, 11, C.greyDark);
            fill(g, px, 14, 2, 1, C.greyDark);
        }
        if (leftEnd) fill(g, 0, 6, 1, 7, C.greyDark);
        if (rightEnd) fill(g, 15, 6, 1, 7, C.greyDark);
        return c;
    }

    function signpost() {
        const { c, g } = makeCanvas(16, 16);
        ellipse(g, 8, 14, 5, 1, C.shadow);
        fill(g, 7, 10, 2, 5, C.woodDark);
        fill(g, 1, 2, 14, 9, C.woodDeep);
        fill(g, 2, 3, 12, 7, C.woodLight);
        fill(g, 2, 9, 12, 1, C.wood);
        fill(g, 4, 5, 8, 1, C.woodDark);
        fill(g, 4, 7, 6, 1, C.woodDark);
        return c;
    }

    function mailbox() {
        const { c, g } = makeCanvas(16, 24);
        ellipse(g, 8, 22, 5, 1, C.shadow);
        fill(g, 7, 13, 2, 10, C.woodDark);
        fill(g, 6, 22, 4, 1, C.woodDeep);
        const { c: box, g: bg } = makeCanvas(16, 14);
        paintShape(bg, 16, 14, (x, y) => x >= 2 && x <= 13 && y >= 3 && y <= 12 && !(y < 6 && ((x - 7.5) ** 2) / 36 + ((y - 6) ** 2) / 9 > 1),
            (x, y) => (x < 5 && y < 9 ? C.blueLight : y > 10 ? C.blueDark : C.blue), C.ink);
        g.drawImage(box, 0, 0);
        fill(g, 5, 7, 6, 3, C.white);
        dot(g, 7, 8, C.blueLight);
        dot(g, 8, 8, C.blueLight);
        fill(g, 13, 2, 1, 7, C.ink);
        fill(g, 14, 2, 2, 3, C.red);
        return c;
    }

    function noticeBoard() {
        const { c, g } = makeCanvas(32, 24);
        ellipse(g, 16, 22, 13, 2, C.shadow);
        fill(g, 3, 14, 2, 9, C.woodDark);
        fill(g, 27, 14, 2, 9, C.woodDark);
        fill(g, 1, 2, 30, 15, C.woodDeep);
        fill(g, 2, 3, 28, 13, C.wood);
        fill(g, 3, 4, 26, 11, '#d9a766');
        fill(g, 1, 1, 30, 2, C.woodDark);
        const paper = (x, y, w, h, col, lines) => {
            fill(g, x, y, w, h, col);
            fill(g, x, y + h, w, 1, 'rgba(0,0,0,0.18)');
            for (let i = 0; i < lines; i++) fill(g, x + 1, y + 2 + i * 2, w - 2 - (i % 2), 1, C.greyDark);
            dot(g, x + ((w / 2) | 0), y, C.red);
        };
        paper(4, 5, 7, 8, C.white, 3);
        paper(13, 5, 7, 6, '#dfe8ff', 2);
        paper(22, 6, 6, 8, '#fff3b8', 3);
        return c;
    }

    // the fishing report board by the pond: a header strip and a little water-level chart
    function reportBoard() {
        const { c, g } = makeCanvas(32, 24);
        ellipse(g, 16, 22, 13, 2, C.shadow);
        fill(g, 3, 14, 2, 9, C.woodDark);
        fill(g, 27, 14, 2, 9, C.woodDark);
        fill(g, 1, 2, 30, 15, C.woodDeep);
        fill(g, 2, 3, 28, 13, C.wood);
        fill(g, 1, 1, 30, 2, C.woodDark);
        fill(g, 3, 4, 26, 11, C.white);
        fill(g, 3, 4, 26, 7, '#dcefff');
        pixelText(g, 'REPORT', 5, 5, C.blueDark);
        const wave = [3, 3, 2, 2, 1, 1, 2, 3, 3, 2, 1, 0, 0, 1, 2, 2, 3, 3, 2, 2, 1, 1];
        wave.forEach((h, i) => fill(g, 5 + i, 11 + h, 1, 1, C.blue));
        fill(g, 5, 14, 22, 1, C.blueLight);
        dot(g, 26, 11, C.red);
        return c;
    }

    function chalkboard() {
        const { c, g } = makeCanvas(16, 24);
        ellipse(g, 8, 22, 6, 1, C.shadow);
        fill(g, 2, 16, 1, 7, C.woodDark);
        fill(g, 13, 16, 1, 7, C.woodDark);
        fill(g, 1, 3, 14, 14, C.woodDark);
        fill(g, 2, 4, 12, 12, '#2f5a45');
        // chalk candlesticks, trending up
        const candles = [[3, 11, 3, '#ff9d9d'], [5, 10, 3, '#b9f0b0'], [7, 9, 2, '#ff9d9d'], [9, 7, 3, '#b9f0b0'], [11, 5, 4, '#b9f0b0']];
        for (const [x, y, h, col] of candles) {
            fill(g, x, y, 1, h, col);
            dot(g, x, y - 1, 'rgba(255,255,255,0.6)');
        }
        fill(g, 3, 14, 10, 1, 'rgba(255,255,255,0.55)');
        return c;
    }

    function lamp(lit) {
        const { c, g } = makeCanvas(16, 32);
        ellipse(g, 8, 30, 4, 1, C.shadow);
        fill(g, 5, 28, 6, 3, C.iron);
        fill(g, 6, 28, 2, 1, C.ironLight);
        fill(g, 7, 9, 2, 19, C.iron);
        dot(g, 7, 12, C.ironLight);
        fill(g, 4, 1, 8, 2, C.iron);
        fill(g, 5, 0, 6, 1, C.iron);
        fill(g, 4, 3, 8, 6, C.iron);
        fill(g, 5, 3, 6, 5, lit ? C.lit : '#fff4cf');
        fill(g, 5, 3, 2, 2, lit ? C.litHi : C.white);
        fill(g, 7, 3, 1, 5, C.iron);
        fill(g, 3, 9, 10, 1, C.iron);
        return c;
    }

    function bench() {
        const { c, g } = makeCanvas(32, 16);
        ellipse(g, 16, 14, 14, 2, C.shadow);
        fill(g, 3, 10, 2, 5, C.iron);
        fill(g, 27, 10, 2, 5, C.iron);
        fill(g, 1, 1, 30, 5, C.woodDeep);
        fill(g, 2, 2, 28, 1, C.woodLight);
        fill(g, 2, 4, 28, 1, C.wood);
        fill(g, 1, 7, 30, 5, C.woodDeep);
        fill(g, 2, 8, 28, 1, C.woodLight);
        fill(g, 2, 10, 28, 1, C.wood);
        return c;
    }

    // the big welcome sign: a small line on top, the town's name below
    function townSign(top, name) {
        const w = 80;
        const { c, g } = makeCanvas(w, 32);
        ellipse(g, 40, 30, 34, 2, C.shadow);
        fill(g, 8, 20, 3, 11, C.woodDark);
        fill(g, 69, 20, 3, 11, C.woodDark);
        fill(g, 1, 2, 78, 20, C.woodDeep);
        fill(g, 2, 3, 76, 18, C.woodLight);
        fill(g, 2, 19, 76, 2, C.wood);
        pixelText(g, top, 40 - Math.floor(textWidth(top) / 2), 5, C.woodDark);
        pixelText(g, name, 40 - Math.floor(textWidth(name) / 2), 12, C.woodDeep);
        return c;
    }

    function routeSign(num) {
        const { c, g } = makeCanvas(16, 24);
        ellipse(g, 8, 22, 4, 1, C.shadow);
        fill(g, 7, 13, 2, 10, C.greyDark);
        const { c: s, g: sg } = makeCanvas(16, 16);
        paintShape(sg, 16, 16, (x, y) => x >= 1 && x <= 14 && y >= 1 && y <= 14 && !(y > 9 && Math.abs(x - 7.5) > 7 - (y - 9) * 1.2),
            (x, y) => (y < 5 ? C.red : C.blueDark), C.white);
        g.drawImage(s, 0, 0);
        fill(g, 2, 5, 12, 1, C.white);
        pixelText(g, num, 8 - Math.floor(textWidth(num) / 2), 7, C.white);
        return c;
    }

    function fountainFrame(frame) {
        const { c, g } = makeCanvas(48, 48);
        ellipse(g, 24, 42, 22, 4, C.shadow);
        // basin rim
        const { c: basin, g: bg } = makeCanvas(48, 44);
        paintShape(bg, 48, 44, (x, y) => ((x - 23.5) / 23) ** 2 + ((y - 26) / 16) ** 2 <= 1,
            (x, y) => (y < 22 ? C.stoneLight : y > 34 ? C.stoneDark : C.stone), C.stoneEdge);
        g.drawImage(basin, 0, 0);
        // pool
        const { c: pool, g: pg } = makeCanvas(48, 44);
        paintShape(pg, 48, 44, (x, y) => ((x - 23.5) / 19) ** 2 + ((y - 25) / 12) ** 2 <= 1,
            (x, y) => ((x + y * 2 + frame * 3) % 11 === 0 ? C.waterLight : y < 17 ? C.waterDeep : C.water), C.stoneEdge);
        g.drawImage(pool, 0, 0);
        // ripples around the column
        const r = 6 + (frame % 4) * 2;
        for (let a = 0; a < 16; a++) {
            const ang = (a / 16) * Math.PI * 2;
            const x = Math.round(24 + Math.cos(ang) * r * 1.4);
            const y = Math.round(26 + Math.sin(ang) * r * 0.7);
            if ((a + frame) % 2 === 0) dot(g, x, y, frame % 4 === 3 ? C.waterLight : C.foam);
        }
        // column and top bowl
        fill(g, 21, 12, 6, 15, C.stoneEdge);
        fill(g, 22, 12, 4, 14, C.stone);
        fill(g, 22, 12, 1, 14, C.stoneLight);
        ellipse(g, 24, 12, 8, 3, C.stoneEdge);
        ellipse(g, 24, 11, 7, 2, C.stoneLight);
        ellipse(g, 24, 11, 5, 1, C.water);
        // spray
        const drops = [[0, -4], [-3, -2], [3, -2], [-6, 1], [6, 1], [-8, 5], [8, 5], [-9, 9], [9, 9]];
        drops.forEach(([dx, dy], i) => {
            const lift = ((frame + i) % 4) - 1;
            dot(g, 24 + dx, 7 + dy - lift, (i + frame) % 3 === 0 ? C.white : C.waterLight);
        });
        fill(g, 23, 2, 2, 6, C.waterLight);
        dot(g, 23, 1 + (frame % 2), C.white);
        return c;
    }

    /* ---------- buildings ---------- */

    const ROOFS = {
        blue: { base: '#4a78d8', dark: '#34579f', light: '#7ea3ee' },
        red: { base: '#d9564b', dark: '#a83c35', light: '#ee8577' },
        green: { base: '#4f9a5b', dark: '#397245', light: '#7cc080' },
        slate: { base: '#6f8ea3', dark: '#526d80', light: '#9ab6c8' },
    };

    function building(o) {
        const W = o.w * T;
        const H = o.h * T;
        const roof = ROOFS[o.roof];
        const roofH = o.roofH;
        const out = {};

        const paint = (night, doorOpen) => {
            const { c, g } = makeCanvas(W, H);
            const wx0 = 3;
            const wx1 = W - 4;
            const wallTop = roofH - 3;

            // walls
            if (o.planks) {
                for (let y = wallTop; y < H; y++) {
                    const row = (y - wallTop) % 4;
                    fill(g, wx0, y, wx1 - wx0 + 1, 1, row === 3 ? C.woodDark : row === 0 ? C.woodLight : C.wood);
                }
            } else {
                fill(g, wx0, wallTop, wx1 - wx0 + 1, H - wallTop, o.wall || C.wall);
            }
            fill(g, wx0, wallTop, wx1 - wx0 + 1, 3, o.planks ? C.woodDeep : C.wallShade);
            fill(g, wx0 + 1, wallTop, 2, H - wallTop, o.planks ? C.woodDeep : C.trim);
            fill(g, wx1 - 2, wallTop, 2, H - wallTop, o.planks ? C.woodDeep : C.trim);
            fill(g, wx0, H - 3, wx1 - wx0 + 1, 3, C.greyDark);
            fill(g, wx0, H - 3, wx1 - wx0 + 1, 1, C.grey);
            fill(g, wx0 - 1, wallTop, 1, H - wallTop, C.ink);
            fill(g, wx1 + 1, wallTop, 1, H - wallTop, C.ink);
            fill(g, wx0 - 1, H - 1, wx1 - wx0 + 3, 1, C.ink);

            // windows
            for (const win of o.windows || []) {
                const { x, y, w, h } = win;
                fill(g, x - 1, y - 1, w + 2, h + 2, C.ink);
                fill(g, x, y, w, h, night ? C.lit : C.glass);
                fill(g, x, y + h - 2, w, 2, night ? C.litDark : C.glassDark);
                for (let i = 0; i < Math.min(w, h) - 2; i++) dot(g, x + 1 + i, y + h - 3 - i, night ? C.litHi : C.glassHi);
                fill(g, x + Math.floor(w / 2), y, 1, h, C.ink);
                if (h > 8) fill(g, x, y + Math.floor(h / 2), w, 1, C.ink);
                fill(g, x - 2, y + h + 1, w + 4, 2, o.planks ? C.woodDeep : C.trimDark);
                if (win.flowers) {
                    fill(g, x - 1, y + h + 3, w + 2, 3, C.woodDark);
                    for (let i = 0; i < w; i += 2) dot(g, x + i, y + h + 2, i % 4 === 0 ? C.red : C.pink);
                }
            }

            // door
            const d = o.door;
            fill(g, d.x - 1, d.y - 1, d.w + 2, d.h + 1, C.ink);
            if (doorOpen) {
                fill(g, d.x, d.y, d.w, d.h, C.doorway);
                fill(g, d.x, d.y, d.w, 2, '#302c3d');
            } else {
                fill(g, d.x, d.y, d.w, d.h, o.doorColor || C.door);
                fill(g, d.x + 2, d.y + 2, d.w - 4, 5, o.doorGlass ? (night ? C.lit : C.glass) : C.doorDark);
                fill(g, d.x + 2, d.y + 9, d.w - 4, d.h - 11, C.doorDark);
                fill(g, d.x + 3, d.y + 10, d.w - 6, d.h - 13, o.doorColor || C.door);
                dot(g, d.x + d.w - 3, d.y + Math.floor(d.h / 2) + 1, C.knob);
                if (o.note) {
                    fill(g, d.x + 3, d.y + 10, d.w - 6, 5, C.white);
                    fill(g, d.x + 4, d.y + 11, d.w - 8, 1, C.red);
                    fill(g, d.x + 4, d.y + 13, d.w - 9, 1, C.greyDark);
                }
            }
            fill(g, d.x - 2, H - 1, d.w + 4, 1, C.greyInk);

            // roof: a trapezoid of shingles with a dark eave
            for (let y = 0; y < roofH; y++) {
                const inset = Math.round(o.roofInset * (1 - y / (roofH - 1)));
                const x0 = inset;
                const x1 = W - 1 - inset;
                for (let x = x0; x <= x1; x++) {
                    let col;
                    const band = Math.floor(y / 4);
                    if (x === x0 || x === x1 || y === 0) col = C.ink;
                    else if (y >= roofH - 2) col = y === roofH - 1 ? C.ink : roof.dark;
                    else if (y <= 2) col = roof.light;
                    else if (y % 4 === 3) col = roof.dark;
                    else if ((x + (band % 2) * 3) % 7 === 0) col = roof.dark;
                    else col = roof.base;
                    dot(g, x, y, col);
                }
            }

            if (o.chimney != null) {
                const cx = o.chimney;
                fill(g, cx, 1, 8, 10, C.ink);
                fill(g, cx + 1, 2, 6, 8, C.redDark);
                fill(g, cx + 1, 2, 6, 1, C.redLight);
                for (let y = 4; y < 10; y += 3) fill(g, cx + 1, y, 6, 1, '#8e3530');
                fill(g, cx - 1, 0, 10, 2, C.ink);
                fill(g, cx, 0, 8, 1, C.greyDark);
            }

            if (o.antenna != null) {
                const ax = o.antenna;
                fill(g, ax, 0, 1, 12, C.iron);
                fill(g, ax - 3, 4, 7, 1, C.iron);
                fill(g, ax - 2, 7, 5, 1, C.iron);
                // dish
                ellipse(g, ax + 12, 8, 5, 3, C.ink);
                ellipse(g, ax + 12, 8, 4, 2, C.greyLight);
                fill(g, ax + 12, 8, 1, 4, C.iron);
            }

            if (o.plate) {
                const { text, y, col, bg } = o.plate;
                const tw = textWidth(text);
                const px = Math.floor(W / 2 - tw / 2) - 3;
                fill(g, px - 1, y - 1, tw + 8, 11, C.ink);
                fill(g, px, y, tw + 6, 9, bg || C.white);
                pixelText(g, text, px + 3, y + 2, col);
            }

            if (o.awning) {
                const { x, y, w } = o.awning;
                for (let i = 0; i < w; i++) {
                    const stripe = Math.floor(i / 3) % 2 === 0;
                    fill(g, x + i, y, 1, 4, stripe ? C.white : C.redDark);
                    dot(g, x + i, y + 4, stripe ? C.greyLight : C.redDark);
                }
                fill(g, x, y - 1, w, 1, C.ink);
            }
            return c;
        };

        out.day = paint(false, false);
        out.night = paint(true, false);
        out.open = paint(false, true);
        out.openNight = paint(true, true);
        out.door = o.door;
        out.windows = o.windows || [];
        return out;
    }

    const BUILDINGS = {
        house: () => building({
            w: 6, h: 5, roof: 'blue', roofH: 42, roofInset: 5, chimney: 70,
            door: { x: 34, y: 58, w: 12, h: 22 },
            windows: [{ x: 10, y: 50, w: 14, h: 11, flowers: true }, { x: 56, y: 50, w: 14, h: 11, flowers: true }],
        }),
        lab: () => building({
            w: 8, h: 6, roof: 'slate', roofH: 44, roofInset: 6, antenna: 22,
            wall: '#eef1f4', door: { x: 50, y: 74, w: 12, h: 22 }, doorGlass: true, doorColor: '#7d8898',
            windows: [{ x: 10, y: 58, w: 30, h: 13 }, { x: 72, y: 58, w: 14, h: 13 }, { x: 94, y: 58, w: 24, h: 13 }],
            plate: { text: 'PROJECT LAB', y: 46, col: C.blueDark },
        }),
        post: () => building({
            w: 6, h: 5, roof: 'red', roofH: 40, roofInset: 5,
            door: { x: 50, y: 58, w: 12, h: 22 },
            windows: [{ x: 10, y: 55, w: 14, h: 11 }, { x: 30, y: 55, w: 12, h: 11 }],
            plate: { text: 'POST OFFICE', y: 42, col: C.redDark },
        }),
        trading: () => building({
            w: 7, h: 5, roof: 'green', roofH: 40, roofInset: 5, planks: true, note: true,
            door: { x: 50, y: 58, w: 12, h: 22 }, doorColor: '#6f4a2a',
            windows: [{ x: 12, y: 55, w: 16, h: 10 }, { x: 78, y: 55, w: 18, h: 10 }],
            plate: { text: 'TRADING POST', y: 42, col: C.greenDark, bg: '#fbf4dc' },
            awning: { x: 45, y: 52, w: 22 },
        }),
    };

    /* ---------- characters ---------- */

    // Heads (rows 0-11): per hair style, per facing
    const HEADS = {
        curly: {
            down: [
                '................',
                '....kkkkkkkk....',
                '..kkhjhhhhjhkk..',
                '.khjhhhjjhhhjhk.',
                '.khhhhhhhhhhhhk.',
                'khjhhHhhhhHhhjhk',
                'khHhHhhHHhhHhHhk',
                'kHhHssHssHssHhHk',
                'kHssssssssssssHk',
                '.ksssessssesssk.',
                '.ksssessssesssk.',
                '..kssSssssSssk..',
            ],
            up: [
                '................',
                '....kkkkkkkk....',
                '..kkhjhhhhjhkk..',
                '.khjhhhjjhhhjhk.',
                '.khhhhhhhhhhhhk.',
                'khjhhHhhhhHhhjhk',
                'khHhHhhHHhhHhHhk',
                'khhHhhHhhHhhHhhk',
                'kHhhHhhhhhhHhhHk',
                '.kHhhHhhhhHhhHk.',
                '.kHHhhHHHHhhHHk.',
                '..kkSSSSSSSSkk..',
            ],
            side: [
                '................',
                '.....kkkkkkk....',
                '...kkhjhhhjhk...',
                '..khjhhhhhhjhk..',
                '.khhhhhhhhhhhhk.',
                '.khHhhHhhhHhhhk.',
                'khHshHhhhHhhHhk.',
                'kHsssHhhHhhHhhk.',
                'ksssssshhHhhHhk.',
                'ksesssshhhhHhk..',
                'ksessssShhhhk...',
                '.kksssSSkkkk....',
            ],
        },
        beanie: {
            down: [
                '................',
                '......kkkk......',
                '....kkhhhhkk....',
                '...khhhjhhhhk...',
                '..khhhhhhhhhhk..',
                '.khhhhhhhhhhhhk.',
                '.kjjjjjjjjjjjjk.',
                '.kHHHHHHHHHHHHk.',
                '.kgssssssssssgk.',
                '.ksssessssesssk.',
                '.ksssessssesssk.',
                '..kssSssssSssk..',
            ],
            up: [
                '................',
                '......kkkk......',
                '....kkhhhhkk....',
                '...khhhjhhhhk...',
                '..khhhhhhhhhhk..',
                '.khhhhhhhhhhhhk.',
                '.kjjjjjjjjjjjjk.',
                '.kHHHHHHHHHHHHk.',
                '.kggggggggggggk.',
                '.kggggggggggggk.',
                '.kGggggggggggGk.',
                '..kkSSSSSSSSkk..',
            ],
            side: [
                '................',
                '.....kkkk.......',
                '...kkhhhhkk.....',
                '..khhhjhhhhk....',
                '.khhhhhhhhhhk...',
                '.khhhhhhhhhhhk..',
                'kjjjjjjjjjjjjk..',
                'kHHHHHHHHHHHHk..',
                'ksssssgggggggk..',
                'ksesssggggggk...',
                'ksessSggggk.....',
                '.kksssSSkk......',
            ],
        },
        bucket: {
            down: [
                '................',
                '................',
                '.....kkkkkk.....',
                '....khhjhhhk....',
                '...khhhhhhhhk...',
                '...kHHHHHHHHk...',
                '.kkhhhhhhhhhhkk.',
                'khhhhhhhhhhhhhhk',
                '.kgssssssssssgk.',
                '.ksssessssesssk.',
                '.ksssessssesssk.',
                '..kssSssssSssk..',
            ],
            up: [
                '................',
                '................',
                '.....kkkkkk.....',
                '....khhjhhhk....',
                '...khhhhhhhhk...',
                '...kHHHHHHHHk...',
                '.kkhhhhhhhhhhkk.',
                'khhhhhhhhhhhhhhk',
                '.kggggggggggggk.',
                '.kggggggggggggk.',
                '.kGggggggggggGk.',
                '..kkSSSSSSSSkk..',
            ],
            side: [
                '................',
                '................',
                '....kkkkkk......',
                '...khhjhhhk.....',
                '..khhhhhhhhk....',
                '..kHHHHHHHHk....',
                'kkhhhhhhhhhhkk..',
                'khhhhhhhhhhhhhk.',
                '.kssssgggggggk..',
                '.ksessggggggk...',
                '.ksessSgggk.....',
                '..kksSSkkk......',
            ],
        },
        short: {
            down: [
                '................',
                '.....kkkkkk.....',
                '...kkhhjjhhkk...',
                '..khhhhhhhhhhk..',
                '.khhhhhhhhhhhhk.',
                '.khhhhhhhhhhhhk.',
                '.khHhhhhhhhhHhk.',
                '.kHsssHhhHsssHk.',
                '.kHssssssssssHk.',
                '.ksssessssesssk.',
                '.ksssessssesssk.',
                '..kssSssssSssk..',
            ],
            up: [
                '................',
                '.....kkkkkk.....',
                '...kkhhjjhhkk...',
                '..khhhhhhhhhhk..',
                '.khhhhhhhhhhhhk.',
                '.khhhhhhhhhhhhk.',
                '.khhhhhhhhhhhhk.',
                '.khHhhhhhhhhHhk.',
                '.kHhhhhhhhhhhHk.',
                '.kHHhhhhhhhhHHk.',
                '..kHHHHHHHHHHk..',
                '...kSSSSSSSSk...',
            ],
            side: [
                '................',
                '.....kkkkkk.....',
                '...kkhhjjhhk....',
                '..khhhhhhhhhk...',
                '.khhhhhhhhhhhk..',
                '.khhhhhhhhhhhk..',
                'khHhhhhhhhhHhk..',
                'kHssHhhhhHhhhk..',
                'ksssssHhhhHhhk..',
                'ksesssshhhhhk...',
                'ksessssShhhk....',
                '.kksssSSkkk.....',
            ],
        },
        hood: {
            down: [
                '................',
                '.....kkkkkk.....',
                '...kkhhjjhhkk...',
                '..khhhhhhhhhhk..',
                '.khhhhhhhhhhhhk.',
                '.khhhkkkkkkhhhk.',
                '.khhkSSSSSSkhhk.',
                '.khHkSSSSSSkHhk.',
                '.khHkSeSSeSkHhk.',
                '.khHkSeSSeSkHhk.',
                '.kHHhkSSSSkhHHk.',
                '..kkHHkkkkHHkk..',
            ],
            up: [
                '................',
                '.....kkkkkk.....',
                '...kkhhjjhhkk...',
                '..khhhhhhhhhhk..',
                '.khhhhhhhhhhhhk.',
                '.khhhhhhhhhhhhk.',
                '.khHhhhhhhhhHhk.',
                '.khHhhhhhhhhHhk.',
                '.khHhhhhhhhhHhk.',
                '.khHhhhhhhhhHhk.',
                '.kHHhhhhhhhhHHk.',
                '..kkHHHHHHHHkk..',
            ],
            side: [
                '................',
                '.....kkkkkk.....',
                '...kkhhjjhhk....',
                '..khhhhhhhhhk...',
                '.khhhhhhhhhhhk..',
                '.kkkkhhhhhhhhk..',
                'kSSSkhhhhhHhhk..',
                'kSeSkhhhhHhhhk..',
                'kSeSkhhhhHhhk...',
                'kSSSkhhhHhhhk...',
                '.kSkhhhHhhhk....',
                '..kkHHHHHkk.....',
            ],
        },
        cap: {
            down: [
                '................',
                '................',
                '.....kkkkkk.....',
                '....khhjjhhk....',
                '...khhhhhhhhk...',
                '...khhhyyhhhk...',
                '..kHHHHHHHHHHk..',
                '..kkkkkkkkkkkk..',
                '.kgssssssssssgk.',
                '.ksssessssesssk.',
                '.ksssessssesssk.',
                '..kssSssssSssk..',
            ],
            up: [
                '................',
                '................',
                '.....kkkkkk.....',
                '....khhjjhhk....',
                '...khhhhhhhhk...',
                '...khhhhhhhhk...',
                '..kHHHHHHHHHHk..',
                '..kHHHHHHHHHHk..',
                '.kggggggggggggk.',
                '.kggggggggggggk.',
                '.kGggggggggggGk.',
                '..kkSSSSSSSSkk..',
            ],
            side: [
                '................',
                '................',
                '....kkkkkk......',
                '...khhjjhhk.....',
                '..khhhhhhhhk....',
                '..kyhhhhhhhk....',
                '..kHHHHHHHHk....',
                'kkkkkkkHHHHk....',
                '.kssssgggggk....',
                '.ksessggggk.....',
                '.ksessSgggk.....',
                '..kksSSkkk......',
            ],
        },
    };

    // Bodies (rows 12-23). Slim torsos, arms that read as arms, and a side view with nothing sticking out back.
    const BODY_DOWN_TOP = [
        '.....kSSSSk.....',
        '...kkcwttwckk...',
        '..kxccwttwccxk..',
        '.kxkccctt' + 'ccckxk.',
        '.kxkcccttccckxk.',
        '.kskCCCCCCCCksk.',
        '..kkkPPPPPPkkk..',
    ];
    const BODY_UP_TOP = [
        '.....kSSSSk.....',
        '...kkcccccckk...',
        '..kxccccccccxk..',
        '.kxkcccCCccckxk.',
        '.kxkcccCCccckxk.',
        '.kskCCCCCCCCksk.',
        '..kkkPPPPPPkkk..',
    ];
    const LEGS_FRONT = {
        stand: ['....kpPkkPpk....', '....kpPkkPpk....', '....kpPkkPpk....', '...kbbbkkbbbk...', '...kkkk..kkkk...'],
        stepA: ['....kpPkkPpk....', '....kpPkkPpk....', '....kpPkkbbbk...', '...kbbbk.kkkk...', '...kkkk.........'],
        stepB: ['....kpPkkPpk....', '....kpPkkPpk....', '...kbbbkkPpk....', '...kkkk.kbbbk...', '.........kkkk...'],
    };
    const BODY_SIDE_TOP = {
        stand: [
            '......kSSk......',
            '....kwwcccck....',
            '....kwtccxck....',
            '....kwtccxck....',
            '....kctccxck....',
            '....kcccCsck....',
            '.....kPPPPk.....',
        ],
        swing: [
            '......kSSk......',
            '....kwwcccck....',
            '....kwtcxcck....',
            '....kwtcxcck....',
            '....kctxccck....',
            '....kcsCccck....',
            '.....kPPPPk.....',
        ],
    };
    const LEGS_SIDE = {
        stand: ['.....kpppPk.....', '.....kpppPk.....', '.....kpppPk.....', '....kbbbbbk.....', '....kkkkkkk.....'],
        stepA: ['.....kpppPk.....', '....kppkkPPk....', '...kppk..kPPk...', '..kbbbk..kbbk...', '..kkkk....kkk...'],
        stepB: ['.....kpppPk.....', '....kPPkkppk....', '...kPPk..kppk...', '..kbbbk..kbbk...', '..kkkk....kkk...'],
    };

    function characterFrames(style, pal) {
        const frames = {};
        const colours = Object.assign({ y: '#ffd84a' }, pal);
        for (const dir of ['down', 'up', 'left', 'right']) {
            frames[dir] = ['stand', 'stepA', 'stepB'].map((step) => {
                let rows;
                if (dir === 'down' || dir === 'up') {
                    rows = [...HEADS[style][dir], ...(dir === 'down' ? BODY_DOWN_TOP : BODY_UP_TOP), ...LEGS_FRONT[step]];
                } else {
                    rows = [...HEADS[style].side, ...BODY_SIDE_TOP[step === 'stand' ? 'stand' : 'swing'], ...LEGS_SIDE[step]];
                }
                return fromRows(rows, colours, dir === 'right');
            });
        }
        return frames;
    }

    const PEOPLE = {
        bryce: {
            style: 'curly',
            pal: {
                k: '#29242e', h: '#5c3a24', H: '#3e2717', j: '#80563a', s: '#f3c9a4', S: '#dca283', e: '#29242e',
                c: '#2d344a', C: '#1f2536', x: '#44506e', w: '#ffffff', t: '#3f6fd8', p: '#262c3d', P: '#1a1f2c', b: '#16161b',
                g: '#5c3a24', G: '#3e2717',
            },
        },
        visitor: {
            style: 'beanie',
            pal: {
                k: '#262a36', h: '#e2703b', H: '#b5522a', j: '#f6a06a', s: '#f0c7a0', S: '#d9a07e', e: '#262a36',
                c: '#35a68b', C: '#277e69', x: '#63c9ab', w: '#f5f1e6', t: '#f5f1e6', p: '#44558a', P: '#323f68', b: '#6b4a35',
                g: '#3a2a20', G: '#281c15',
            },
        },
        fisher: {
            style: 'bucket',
            pal: {
                k: '#2a2a30', h: '#cdb27a', H: '#a28a52', j: '#e3d09f', s: '#e8b890', S: '#cf9a72', e: '#2a2a30',
                c: '#5b7f3b', C: '#43602b', x: '#7ba454', w: '#dbd3bf', t: '#dbd3bf', p: '#6b5a45', P: '#52442f', b: '#3a2f25',
                g: '#c9c9c9', G: '#a2a2a2',
            },
        },
        stranger: {
            style: 'hood',
            pal: {
                k: '#221f2c', h: '#5b4b8a', H: '#40346a', j: '#7d6cb0', s: '#d9b494', S: '#8c7466', e: '#f3e7a6',
                c: '#5b4b8a', C: '#40346a', x: '#7d6cb0', w: '#5b4b8a', t: '#e2c35a', p: '#3a3550', P: '#2a2640', b: '#2b2b33',
                g: '#40346a', G: '#2e2550',
            },
        },
        mailman: {
            style: 'cap',
            pal: {
                k: '#262a36', h: '#34539f', H: '#243d7a', j: '#5476c4', s: '#f0c29c', S: '#d79d78', e: '#262a36',
                c: '#a9c2e8', C: '#86a2d0', x: '#c7d8f2', w: '#e8eef8', t: '#34539f', p: '#2f3f6c', P: '#222f54', b: '#222226',
                g: '#6b4a35', G: '#4f3525', y: '#ffd84a',
            },
        },
        assistant: {
            style: 'short',
            pal: {
                k: '#2a2830', h: '#3c2a22', H: '#271b15', j: '#5c4232', s: '#e9b995', S: '#cf9974', e: '#2a2830',
                c: '#f4f4f0', C: '#d4d6d8', x: '#ffffff', w: '#c9dbf7', t: '#4270d6', p: '#3f4656', P: '#2c313d', b: '#26262b',
                g: '#3c2a22', G: '#271b15',
            },
        },
    };

    /* ---------- little effects ---------- */

    function emote() {
        const { c, g } = makeCanvas(16, 16);
        fill(g, 2, 0, 12, 12, C.ink);
        fill(g, 3, 1, 10, 10, C.white);
        fill(g, 1, 1, 1, 10, C.ink);
        fill(g, 14, 1, 1, 10, C.ink);
        fill(g, 6, 12, 3, 1, C.ink);
        fill(g, 6, 11, 2, 1, C.white);
        dot(g, 7, 13, C.ink);
        fill(g, 7, 2, 2, 6, C.red);
        fill(g, 7, 9, 2, 1, C.red);
        return c;
    }

    function dust(frame) {
        const { c, g } = makeCanvas(24, 8);
        const spread = frame * 3;
        for (const side of [-1, 1]) {
            const x = 12 + side * (5 + spread);
            ellipse(g, x, 5 - frame, 3 - frame, 2, frame === 2 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.85)');
        }
        return c;
    }

    function marker() {
        const { c, g } = makeCanvas(9, 8);
        const rows = ['kkkkkkkkk', 'kyyyyyyyk', '.kyyyyyk.', '..kyyyk..', '...kyk...', '....k....'];
        rows.forEach((r, y) => {
            for (let x = 0; x < 9; x++) {
                if (r[x] === 'k') dot(g, x, y + 1, C.ink);
                if (r[x] === 'y') dot(g, x, y + 1, C.yellow);
            }
        });
        return c;
    }

    /* ---------- interiors: floors and walls ---------- */

    const ROOMS = {
        house: { wall: '#eadcc2', wallDark: '#cdbb98', stripe: '#e3d3b4', wains: '#b98a58', wainsDark: '#8a5c32', base: '#5e3d22', floor: 'wood', rug: ['#5d82d8', '#34579f', '#f4efe1'] },
        lab: { wall: '#e8edf2', wallDark: '#c3ccd6', stripe: '#dfe6ed', wains: '#9fb3c6', wainsDark: '#7b90a6', base: '#4f5d70', floor: 'tile', rug: ['#8fb0d8', '#5d7fa8', '#e8f0fa'] },
        post: { wall: '#f2e7d0', wallDark: '#d9c7a4', stripe: '#eadcc0', wains: '#c9594e', wainsDark: '#9c3e36', base: '#5e2f24', floor: 'check', rug: ['#c9594e', '#9c3e36', '#f2e7d0'] },
    };

    function floorTile(g, ox, oy, tx, ty, room) {
        for (let y = 0; y < T; y++) {
            for (let x = 0; x < T; x++) {
                const wx = tx * T + x;
                const wy = ty * T + y;
                let col;
                if (room.floor === 'wood') {
                    const row = Math.floor(wy / 4);
                    col = row % 2 ? '#c48e56' : '#cd9960';
                    if (wy % 4 === 3) col = '#a8743f';
                    else if ((wx + row * 9) % 22 === 0) col = '#a8743f';
                    else if (wy % 4 === 0 && hash(wx, wy, 3) < 0.25) col = '#d9a86e';
                } else if (room.floor === 'tile') {
                    const gx = wx % 8;
                    const gy = wy % 8;
                    col = gx === 0 || gy === 0 ? '#d3dae2' : gx === 1 || gy === 1 ? '#ffffff' : '#f0f3f6';
                } else {
                    col = (Math.floor(wx / 8) + Math.floor(wy / 8)) % 2 ? '#efe2c6' : '#e2d0aa';
                }
                dot(g, ox + x, oy + y, col);
            }
        }
    }

    function interiorTile(g, map, tx, ty, room) {
        const ox = tx * T;
        const oy = ty * T;
        const k = map.get(tx, ty);
        if (k === 'x') {
            fill(g, ox, oy, T, T, '#0b0c10');
            return;
        }
        if (k === 'U' || k === 'L') {
            for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) dot(g, ox + x, oy + y, (tx * T + x) % 6 === 0 ? room.stripe : room.wall);
            if (k === 'U' && map.get(tx, ty - 1) !== 'U') {
                fill(g, ox, oy, T, 4, room.wallDark);
                fill(g, ox, oy + 4, T, 1, room.stripe);
                fill(g, ox, oy, T, 1, C.ink);
            }
            if (k === 'L') {
                fill(g, ox, oy + 6, T, 1, room.wainsDark);
                fill(g, ox, oy + 7, T, 7, room.wains);
                fill(g, ox, oy + 7, T, 1, 'rgba(255,255,255,0.25)');
                for (let x = (tx % 2) * 8; x < T; x += 16) fill(g, ox + x, oy + 8, 1, 5, room.wainsDark);
                fill(g, ox, oy + 14, T, 2, room.base);
            }
        } else {
            floorTile(g, ox, oy, tx, ty, room);
            if (k === 'r') {
                const [base, edge, accent] = room.rug;
                const isRug = (dx, dy) => map.get(tx + dx, ty + dy) === 'r';
                fill(g, ox, oy, T, T, base);
                if (!isRug(0, -1)) fill(g, ox, oy, T, 2, edge);
                if (!isRug(0, 1)) fill(g, ox, oy + 14, T, 2, edge);
                if (!isRug(-1, 0)) fill(g, ox, oy, 2, T, edge);
                if (!isRug(1, 0)) fill(g, ox + 14, oy, 2, T, edge);
                for (let i = 0; i < 4; i++) {
                    fill(g, ox + 8 - i, oy + 4 + i, 1 + i * 2 - (i ? 1 : 0), 1, accent);
                    fill(g, ox + 8 - i, oy + 11 - i, 1 + i * 2 - (i ? 1 : 0), 1, accent);
                }
            }
            if (k === 'e') {
                fill(g, ox + 1, oy + 3, 14, 11, '#6e2a24');
                fill(g, ox + 2, oy + 4, 12, 9, '#b24a40');
                for (let y = 5; y < 12; y += 2) fill(g, ox + 3, oy + y, 10, 1, '#c95c50');
            }
            const above = map.get(tx, ty - 1);
            if (above === 'L') {
                g.fillStyle = 'rgba(50, 30, 10, 0.18)';
                g.fillRect(ox, oy, T, 3);
                g.fillStyle = 'rgba(50, 30, 10, 0.08)';
                g.fillRect(ox, oy + 3, T, 2);
            }
        }
        if (map.get(tx - 1, ty) === 'x') fill(g, ox, oy, 1, T, C.ink);
        if (map.get(tx + 1, ty) === 'x') fill(g, ox + 15, oy, 1, T, C.ink);
        if (map.get(tx, ty + 1) === 'x') fill(g, ox, oy + 15, T, 1, C.ink);
    }

    function renderInterior(map, roomName) {
        const room = ROOMS[roomName];
        const { c, g } = makeCanvas(map.w * T, map.h * T);
        for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) interiorTile(g, map, tx, ty, room);
        return c;
    }

    /* ---------- interiors: furniture ---------- */

    function wallWindow() {
        const { c, g } = makeCanvas(16, 16);
        fill(g, 2, 1, 12, 11, C.ink);
        fill(g, 3, 2, 10, 9, '#bfe6ff');
        fill(g, 3, 8, 10, 3, '#dcf2ff');
        fill(g, 5, 4, 3, 1, C.white);
        fill(g, 4, 5, 5, 1, C.white);
        fill(g, 3, 6, 10, 1, C.ink);
        fill(g, 2, 1, 3, 11, '#e58a8a');
        fill(g, 11, 1, 3, 11, '#e58a8a');
        fill(g, 3, 1, 1, 11, '#f2a9a9');
        fill(g, 12, 1, 1, 11, '#f2a9a9');
        fill(g, 1, 12, 14, 2, C.trim);
        fill(g, 1, 14, 14, 1, C.trimDark);
        return c;
    }

    function storyBoard() {
        const { c, g } = makeCanvas(32, 32);
        fill(g, 1, 2, 30, 26, C.ink);
        fill(g, 2, 3, 28, 24, C.woodDark);
        fill(g, 3, 4, 26, 22, '#c99a5b');
        for (let i = 0; i < 40; i++) dot(g, 3 + ((hash(i, 1) * 26) | 0), 4 + ((hash(i, 2) * 22) | 0), '#b5844a');
        fill(g, 6, 5, 20, 7, C.white);
        pixelText(g, 'STORY', 7, 6, C.blueDark);
        dot(g, 16, 5, C.red);
        const pics = [[4, 14, '#5d82d8'], [12, 17, '#e05b50'], [20, 14, '#4f9d58'], [15, 21, '#ffd84a']];
        for (let i = 0; i < pics.length - 1; i++) {
            const [x0, y0] = pics[i];
            const [x1, y1] = pics[i + 1];
            for (let t = 0; t <= 10; t++) dot(g, Math.round(x0 + 3 + (x1 - x0) * t / 10), Math.round(y0 + 1 + (y1 - y0) * t / 10), '#c0392b');
        }
        for (const [x, y, col] of pics) {
            fill(g, x, y, 7, 7, C.white);
            fill(g, x + 1, y + 1, 5, 4, col);
            fill(g, x, y + 7, 7, 1, 'rgba(0,0,0,0.2)');
            dot(g, x + 3, y, C.red);
        }
        return c;
    }

    function pennant() {
        const { c, g } = makeCanvas(16, 16);
        fill(g, 1, 2, 1, 12, C.woodDark);
        for (let y = 3; y <= 11; y++) {
            const len = Math.round(13 * (1 - Math.abs(y - 7) / 5));
            fill(g, 2, y, len, 1, '#1f3a6b');
        }
        fill(g, 2, 3, 1, 9, '#f2c230');
        pixelText(g, 'WV', 4, 5, '#f2c230');
        return c;
    }

    function diploma() {
        const { c, g } = makeCanvas(16, 16);
        fill(g, 2, 2, 12, 11, '#4a2f1c');
        fill(g, 3, 3, 10, 9, '#fbf7ea');
        fill(g, 5, 5, 6, 1, C.greyDark);
        fill(g, 4, 7, 8, 1, C.grey);
        fill(g, 5, 9, 4, 1, C.grey);
        fill(g, 10, 9, 2, 2, '#e0b43a');
        dot(g, 10, 11, C.red);
        dot(g, 11, 11, C.red);
        return c;
    }

    function fishMount() {
        const { c, g } = makeCanvas(16, 16);
        ellipse(g, 8, 8, 7, 5, C.woodDeep);
        ellipse(g, 8, 8, 6, 4, C.wood);
        fill(g, 4, 7, 7, 3, '#5f8a45');
        fill(g, 4, 9, 7, 1, '#d9d6a8');
        fill(g, 11, 6, 2, 5, '#4d7438');
        dot(g, 5, 7, C.ink);
        fill(g, 6, 6, 3, 1, '#4d7438');
        return c;
    }

    function bookshelf() {
        const { c, g } = makeCanvas(32, 32);
        fill(g, 0, 0, 32, 32, C.ink);
        fill(g, 1, 1, 30, 30, C.woodDark);
        const cols = ['#e05b50', '#4270d6', '#4f9d58', '#ffd84a', '#8e6bd8', '#f08c78', '#34579f', '#dcd3bf'];
        for (const shelfY of [2, 12, 22]) {
            fill(g, 2, shelfY, 28, 8, '#5f3d20');
            let x = 3;
            let i = shelfY;
            while (x < 28) {
                const w = 2 + ((hash(x, shelfY, 1) * 2) | 0);
                const h = 5 + ((hash(x, shelfY, 2) * 3) | 0);
                fill(g, x, shelfY + 8 - h, w, h, cols[(i++ * 3 + x) % cols.length]);
                fill(g, x, shelfY + 8 - h, 1, h, 'rgba(255,255,255,0.18)');
                x += w + (hash(x, shelfY, 3) < 0.15 ? 2 : 0);
            }
            fill(g, 1, shelfY + 8, 30, 2, C.wood);
        }
        return c;
    }

    function bed() {
        const { c, g } = makeCanvas(16, 32);
        fill(g, 0, 0, 16, 32, C.ink);
        fill(g, 1, 1, 14, 6, C.woodDark);
        fill(g, 1, 1, 14, 1, C.woodLight);
        fill(g, 1, 7, 14, 24, C.white);
        fill(g, 3, 8, 10, 5, '#eef2f8');
        fill(g, 3, 12, 10, 1, C.greyLight);
        fill(g, 1, 14, 14, 17, '#4a78d8');
        fill(g, 1, 14, 14, 2, '#7ea3ee');
        fill(g, 1, 29, 14, 2, '#34579f');
        return c;
    }

    function desk(screen) {
        const { c, g } = makeCanvas(32, 24);
        ellipse(g, 16, 22, 14, 1, C.shadow);
        fill(g, 0, 9, 32, 4, C.ink);
        fill(g, 1, 9, 30, 3, C.wood);
        fill(g, 1, 9, 30, 1, C.woodLight);
        fill(g, 2, 13, 28, 8, C.woodDark);
        fill(g, 3, 14, 11, 6, C.wood);
        fill(g, 18, 14, 11, 6, C.wood);
        dot(g, 8, 16, C.knob);
        dot(g, 23, 16, C.knob);
        if (screen) screen(g);
        return c;
    }

    function laptopDesk() {
        return desk((g) => {
            fill(g, 9, 0, 14, 9, C.ink);
            fill(g, 10, 1, 12, 7, '#f7f7f2');
            fill(g, 10, 1, 12, 1, '#f2c230');
            fill(g, 11, 4, 2, 3, '#f2c230');
            fill(g, 14, 3, 2, 4, '#34579f');
            fill(g, 17, 5, 2, 2, '#f2c230');
            fill(g, 7, 9, 18, 1, C.greyDark);
        });
    }

    function houseTable() {
        const { c, g } = makeCanvas(32, 24);
        ellipse(g, 16, 21, 13, 2, C.shadow);
        fill(g, 4, 14, 2, 7, C.woodDeep);
        fill(g, 26, 14, 2, 7, C.woodDeep);
        fill(g, 1, 8, 30, 7, C.ink);
        fill(g, 2, 8, 28, 5, C.wood);
        fill(g, 2, 8, 28, 1, C.woodLight);
        fill(g, 2, 13, 28, 1, C.woodDark);
        fill(g, 8, 4, 5, 5, C.white);
        fill(g, 12, 5, 2, 2, C.white);
        fill(g, 9, 5, 3, 1, '#6b4a35');
        ellipse(g, 21, 7, 5, 2, '#dcd3bf');
        dot(g, 19, 5, C.red);
        dot(g, 21, 5, C.yellow);
        dot(g, 23, 5, C.green);
        return c;
    }

    function plant() {
        const { c, g } = makeCanvas(16, 24);
        ellipse(g, 8, 22, 5, 1, C.shadow);
        fill(g, 4, 15, 8, 7, '#b85c38');
        fill(g, 3, 14, 10, 2, '#cf7148');
        fill(g, 5, 16, 1, 5, '#d98a62');
        const { c: top, g: tg } = makeCanvas(16, 16);
        canopy(tg, 16, 16, [[8, 5, 4], [4, 9, 4], [12, 9, 4], [8, 11, 4]], LEAVES);
        g.drawImage(top, 0, 0);
        return c;
    }

    // a long strip of scrolling quotes for the lab's ticker board
    function tickerStrip() {
        const quotes = [['SPY', '+0.8'], ['QQQ', '+1.2'], ['AAPL', '-0.4'], ['NVDA', '+2.9'], ['TSLA', '-1.8'], ['MSFT', '+0.6'], ['XOM', '+0.3'], ['AMD', '-0.9']];
        const text = quotes.map(([s, v]) => `${s} ${v}   `).join('');
        const w = textWidth(text) + 1;
        const { c, g } = makeCanvas(w, 5);
        let x = 0;
        for (const [s, v] of quotes) {
            pixelText(g, s, x, 0, '#e8f0ff');
            x += textWidth(s) + 5;
            pixelText(g, v, x, 0, v[0] === '+' ? '#5ef08a' : '#ff6b6b');
            x += textWidth(v) + 13;
        }
        return c;
    }

    function tickerBoard() {
        const { c, g } = makeCanvas(48, 16);
        fill(g, 0, 2, 48, 12, C.ink);
        fill(g, 1, 3, 46, 10, '#10131a');
        fill(g, 1, 3, 46, 1, '#2a3040');
        return c;
    }

    function tradingDesk(frame) {
        const { c, g } = makeCanvas(48, 32);
        ellipse(g, 24, 30, 22, 2, C.shadow);
        fill(g, 0, 17, 48, 4, C.ink);
        fill(g, 1, 17, 46, 3, '#5a6272');
        fill(g, 1, 17, 46, 1, '#7c8596');
        fill(g, 2, 21, 44, 8, '#3e4452');
        fill(g, 3, 22, 18, 6, '#4a5160');
        fill(g, 27, 22, 18, 6, '#4a5160');
        for (const [i, mx] of [[0, 1], [1, 17], [2, 33]].map(([i, x]) => [i, x])) {
            fill(g, mx, 3, 14, 11, C.ink);
            fill(g, mx + 1, 4, 12, 9, '#0f141c');
            fill(g, mx + 6, 14, 2, 3, C.iron);
            // candles: deterministic per monitor, the last one flickers with the frame
            for (let k = 0; k < 5; k++) {
                const up = hash(i, k, 7) > 0.35;
                const top = 5 + ((hash(i, k, 8) * 4) | 0) - (k === 4 && frame ? 1 : 0);
                const h = 2 + ((hash(i, k, 9) * 3) | 0);
                fill(g, mx + 2 + k * 2, top, 1, h, up ? '#5ef08a' : '#ff6b6b');
            }
            fill(g, mx + 1, 12, 12, 1, '#243044');
        }
        fill(g, 18, 18, 12, 2, C.greyDark);
        return c;
    }

    function whiteboard() {
        const { c, g } = makeCanvas(32, 32);
        fill(g, 1, 3, 30, 22, C.greyDark);
        fill(g, 2, 4, 28, 20, C.white);
        const box = (x, col) => {
            fill(g, x, 9, 7, 6, col);
            fill(g, x + 1, 10, 5, 1, 'rgba(255,255,255,0.5)');
        };
        box(3, '#4270d6');
        box(13, '#ee8a3c');
        box(22, '#f2c230');
        for (const x of [10, 20]) {
            fill(g, x, 12, 3, 1, C.ink);
            dot(g, x + 1, 11, C.ink);
            dot(g, x + 1, 13, C.ink);
        }
        fill(g, 4, 18, 10, 1, C.grey);
        fill(g, 4, 20, 16, 1, C.grey);
        fill(g, 18, 18, 8, 1, '#e05b50');
        fill(g, 6, 25, 20, 2, C.grey);
        dot(g, 9, 24, '#e05b50');
        dot(g, 12, 24, '#4270d6');
        return c;
    }

    function serverRack(frame) {
        const { c, g } = makeCanvas(16, 32);
        ellipse(g, 8, 30, 7, 1, C.shadow);
        fill(g, 1, 0, 14, 31, C.ink);
        fill(g, 2, 1, 12, 29, '#2b303b');
        for (let u = 0; u < 5; u++) {
            const y = 2 + u * 5;
            fill(g, 3, y, 10, 4, '#3b4252');
            fill(g, 3, y, 10, 1, '#4c5466');
            for (let x = 7; x < 12; x += 2) fill(g, x, y + 2, 1, 1, '#1d212a');
            const on = (n) => (hash(u, n, frame) > 0.3);
            dot(g, 4, y + 1, on(1) ? '#5ef08a' : '#1f5a33');
            dot(g, 5, y + 1, on(2) ? '#ffc94a' : '#5a4a1f');
        }
        fill(g, 2, 27, 12, 3, '#20242d');
        return c;
    }

    function dashboardScreen(frame) {
        const { c, g } = makeCanvas(32, 32);
        fill(g, 1, 2, 30, 23, C.ink);
        fill(g, 2, 3, 28, 21, '#f4f6fb');
        fill(g, 2, 3, 28, 3, '#2753d6');
        fill(g, 3, 4, 8, 1, C.white);
        const bars = [6, 10, 8, 12, 7];
        bars.forEach((h, i) => {
            const hh = h + (frame && i === 3 ? 1 : 0);
            fill(g, 4 + i * 4, 21 - hh, 3, hh, i % 2 ? '#f2c230' : '#2753d6');
        });
        // a little fish in the corner
        fill(g, 23, 9, 4, 2, '#4f9d58');
        dot(g, 22, 9, '#4f9d58');
        dot(g, 22, 10, '#4f9d58');
        dot(g, 26, 9, C.ink);
        fill(g, 23, 14, 5, 1, C.grey);
        fill(g, 23, 16, 4, 1, C.grey);
        fill(g, 3, 21, 26, 1, C.greyDark);
        fill(g, 14, 25, 4, 3, C.iron);
        return c;
    }

    function terminalDesk(screen) {
        return desk((g) => {
            fill(g, 8, 0, 16, 10, C.ink);
            fill(g, 9, 1, 14, 7, '#0f1a14');
            screen(g);
            fill(g, 15, 8, 2, 2, C.iron);
        });
    }

    const dbTerminal = () => terminalDesk((g) => {
        for (let y = 2; y < 8; y += 2) {
            fill(g, 10, y, 3, 1, '#5ef08a');
            fill(g, 14, y, 4, 1, '#3fbf6a');
            fill(g, 19, y, 3, 1, '#5ef08a');
        }
    });

    const aiStation = () => terminalDesk((g) => {
        fill(g, 9, 1, 14, 7, '#bfe6ff');
        fill(g, 11, 2, 3, 3, '#ffd84a');
        fill(g, 13, 4, 5, 2, C.white);
        fill(g, 14, 3, 3, 1, C.white);
        pixelText(g, 'AI', 17, 2, '#6b4fc4');
    });

    function coffeeMaker() {
        const { c, g } = makeCanvas(16, 24);
        ellipse(g, 8, 22, 7, 1, C.shadow);
        fill(g, 0, 10, 16, 12, C.ink);
        fill(g, 1, 10, 14, 11, '#9aa3b2');
        fill(g, 1, 10, 14, 1, '#c3cad6');
        fill(g, 3, 1, 10, 10, C.ink);
        fill(g, 4, 2, 8, 8, '#2b303b');
        fill(g, 5, 3, 6, 2, '#e05b50');
        fill(g, 6, 7, 4, 3, C.white);
        dot(g, 7, 6, '#6b4a35');
        return c;
    }

    function counter(end) {
        const { c, g } = makeCanvas(16, 24);
        fill(g, 0, 6, 16, 18, C.ink);
        fill(g, end === 'left' ? 1 : 0, 6, end ? 15 : 16, 4, '#d8a870');
        fill(g, 0, 6, 16, 1, '#ecc58f');
        fill(g, end === 'left' ? 1 : 0, 10, end ? 15 : 16, 13, '#a86e3c');
        for (let x = 3; x < 16; x += 8) fill(g, x, 12, 1, 9, '#8a5a30');
        fill(g, 0, 21, 16, 2, '#6f4524');
        if (end === 'left') fill(g, 0, 6, 1, 18, C.ink);
        if (end === 'right') fill(g, 15, 6, 1, 18, C.ink);
        return c;
    }

    function mailSlots() {
        const { c, g } = makeCanvas(16, 32);
        fill(g, 0, 3, 16, 24, C.woodDeep);
        for (let r = 0; r < 4; r++) {
            for (let k = 0; k < 3; k++) {
                const x = 1 + k * 5;
                const y = 4 + r * 6;
                fill(g, x, y, 4, 5, '#2e1c10');
                const v = hash(k, r, 11);
                if (v < 0.5) fill(g, x, y + 2, 4, 3, v < 0.25 ? C.white : '#fff3b8');
                else if (v < 0.65) fill(g, x, y + 1, 4, 4, '#c79a5e');
            }
        }
        return c;
    }

    function packages() {
        const { c, g } = makeCanvas(16, 16);
        ellipse(g, 8, 15, 7, 1, C.shadow);
        fill(g, 1, 7, 9, 8, C.ink);
        fill(g, 2, 8, 7, 6, '#c79a5e');
        fill(g, 5, 8, 1, 6, '#e8d6a8');
        fill(g, 7, 2, 8, 7, C.ink);
        fill(g, 8, 3, 6, 5, '#d6aa6a');
        fill(g, 8, 5, 6, 1, '#e8d6a8');
        return c;
    }

    function postScale() {
        const { c, g } = makeCanvas(16, 24);
        ellipse(g, 8, 22, 6, 1, C.shadow);
        fill(g, 2, 13, 12, 9, C.ink);
        fill(g, 3, 14, 10, 7, '#c9ced8');
        ellipse(g, 8, 17, 3, 2, C.white);
        dot(g, 9, 16, C.red);
        fill(g, 1, 10, 14, 3, C.ink);
        fill(g, 2, 10, 12, 2, '#9aa3b2');
        return c;
    }

    function contactBoard() {
        const { c, g } = makeCanvas(32, 32);
        fill(g, 1, 2, 30, 24, C.ink);
        fill(g, 2, 3, 28, 22, '#2753d6');
        fill(g, 4, 5, 24, 18, C.white);
        pixelText(g, 'HELLO', 7, 6, '#2753d6');
        fill(g, 9, 13, 14, 8, C.ink);
        fill(g, 10, 14, 12, 6, '#fff3b8');
        for (let i = 0; i < 6; i++) {
            dot(g, 10 + i, 14 + Math.floor(i / 1.5), '#c9a24a');
            dot(g, 21 - i, 14 + Math.floor(i / 1.5), '#c9a24a');
        }
        return c;
    }

    function stampPoster() {
        const { c, g } = makeCanvas(16, 16);
        fill(g, 2, 1, 12, 13, C.ink);
        fill(g, 3, 2, 10, 11, C.white);
        for (let i = 3; i < 13; i += 2) {
            dot(g, i, 2, C.greyLight);
            dot(g, i, 12, C.greyLight);
        }
        fill(g, 5, 4, 6, 6, '#e05b50');
        fill(g, 6, 5, 4, 2, C.white);
        return c;
    }

    /* ---------- items, quests, and fish ---------- */

    function sparkle(frame) {
        const { c, g } = makeCanvas(9, 9);
        const r = [1, 2, 3, 2][frame % 4];
        fill(g, 4, 4 - r, 1, r * 2 + 1, C.white);
        fill(g, 4 - r, 4, r * 2 + 1, 1, C.white);
        dot(g, 4, 4, '#fff6b0');
        return c;
    }

    function csvFile() {
        const { c, g } = makeCanvas(12, 12);
        fill(g, 2, 1, 8, 10, C.ink);
        fill(g, 3, 2, 6, 8, C.white);
        fill(g, 7, 1, 3, 3, C.greyLight);
        fill(g, 4, 4, 4, 1, '#3fbf6a');
        fill(g, 4, 6, 4, 1, '#3fbf6a');
        fill(g, 4, 8, 3, 1, '#3fbf6a');
        return c;
    }

    const FISH = {
        bluegill: { body: '#6c8f6a', back: '#3f5e45', belly: '#f0a84a', bars: '#4d6b4d', spot: '#1d2a3a', len: 20 },
        largemouth: { body: '#7d9a52', back: '#4c6630', belly: '#ecebcf', stripe: '#3c4f24', len: 24 },
        smallmouth: { body: '#9b7c4b', back: '#6b532e', belly: '#e8d9b0', bars: '#6b532e', len: 23 },
        perch: { body: '#e0c24a', back: '#7a8a3a', belly: '#f6ecc0', bars: '#4f6a2a', fin: '#f08c3c', len: 20 },
        trout: { body: '#a5b3a6', back: '#687d62', belly: '#eef0ea', stripe: '#e8849a', spots: '#2a2a2a', len: 24 },
        crappie: { body: '#c9d0bc', back: '#5e6e52', belly: '#f2f2ea', spots: '#3d4a36', fin: '#6f7d62', len: 20 },
        walleye: { body: '#c2a85a', back: '#76652e', belly: '#efe6c6', blotch: '#6a5a28', eye: '#f2f2da', len: 26 },
        musky: { body: '#b2bb82', back: '#6f7a4a', belly: '#eeeed6', spots: '#4f5a2e', len: 30 },
    };

    function fishSprite(kind) {
        const f = FISH[kind];
        const L = f.len;
        const { c, g } = makeCanvas(L + 2, 12);
        const bodyW = L - 6;
        const cy = 6;
        const inside = (x, y) => ((x - (bodyW / 2 + 1)) / (bodyW / 2)) ** 2 + ((y - cy) / 4.2) ** 2 <= 1;
        paintShape(g, L - 4, 12, inside, (x, y) => {
            if (y < cy - 1) return f.back;
            if (y > cy + 1) return f.belly;
            return f.body;
        }, C.ink);
        // tail
        for (let i = 0; i < 5; i++) fill(g, L - 5 + i, cy - 1 - i, 1, 3 + i * 2, i === 4 ? C.ink : f.fin || f.back);
        // dorsal fin
        fill(g, Math.round(bodyW * 0.35), 1, Math.round(bodyW * 0.35), 1, f.fin || f.back);
        // patterns
        if (f.bars) for (let x = 5; x < bodyW - 1; x += 3) fill(g, x, cy - 3, 1, 5, f.bars);
        if (f.stripe) fill(g, 3, cy, bodyW - 3, 1, f.stripe);
        if (f.spots) for (let i = 0; i < 7; i++) dot(g, 4 + ((hash(i, L, 1) * (bodyW - 5)) | 0), cy - 3 + ((hash(i, L, 2) * 5) | 0), f.spots);
        if (f.blotch) for (let x = 5; x < bodyW - 2; x += 4) fill(g, x, cy - 3, 2, 2, f.blotch);
        if (f.spot) fill(g, 5, cy - 1, 2, 2, f.spot);
        // eye and mouth
        fill(g, 2, cy - 2, 2, 2, f.eye || C.white);
        dot(g, 2, cy - 2, C.ink);
        dot(g, 1, cy + 1, C.ink);
        return c;
    }

    function portrait(frames, talking) {
        const { c, g } = makeCanvas(24, 24);
        fill(g, 0, 0, 24, 24, '#dcefff');
        fill(g, 0, 17, 24, 7, '#c3dcf5');
        g.drawImage(frames.down[0], 0, 0, 16, 21, 4, 3, 16, 21);
        // (the mouth sits on the last row of the face, between the eyes)
        if (talking) fill(g, 10, 14, 4, 1, '#7a3b32');
        else fill(g, 11, 14, 2, 1, '#c98a6e');
        return c;
    }

    function build() {
        const people = {};
        for (const [id, p] of Object.entries(PEOPLE)) people[id] = characterFrames(p.style, p.pal);
        const buildings = {};
        for (const [id, make] of Object.entries(BUILDINGS)) buildings[id] = make();
        return {
            people,
            buildings,
            portrait: { bryce: [portrait(people.bryce, false), portrait(people.bryce, true)] },
            reportBoard: reportBoard(),
            tree: tree(),
            bush: bush(),
            rock: rock(),
            fence: { mid: fence(false, false), left: fence(true, false), right: fence(false, true) },
            sign: signpost(),
            mailbox: mailbox(),
            board: noticeBoard(),
            chalkboard: chalkboard(),
            lamp: lamp(false),
            lampLit: lamp(true),
            bench: bench(),
            townSign: townSign('WELCOME TO', 'BRYCEKUNSCHICK.COM'),
            routeSign: routeSign('79'),
            fountain: [0, 1, 2, 3].map(fountainFrame),
            emote: emote(),
            dust: [0, 1, 2].map(dust),
            marker: marker(),
            tallFront: tallGrassFront(),
            room: {
                window: wallWindow(),
                storyBoard: storyBoard(),
                pennant: pennant(),
                diploma: diploma(),
                fishMount: fishMount(),
                bookshelf: bookshelf(),
                bed: bed(),
                laptopDesk: laptopDesk(),
                table: houseTable(),
                plant: plant(),
                tickerBoard: tickerBoard(),
                tickerStrip: tickerStrip(),
                tradingDesk: [0, 1].map(tradingDesk),
                whiteboard: whiteboard(),
                server: [0, 1, 2, 3].map(serverRack),
                dashboard: [0, 1].map(dashboardScreen),
                dbTerminal: dbTerminal(),
                aiStation: aiStation(),
                coffee: coffeeMaker(),
                counter: { left: counter('left'), mid: counter(null), right: counter('right') },
                mailSlots: mailSlots(),
                packages: packages(),
                scale: postScale(),
                contactBoard: contactBoard(),
                stampPoster: stampPoster(),
            },
            sparkle: [0, 1, 2, 3].map(sparkle),
            csv: csvFile(),
            fish: Object.fromEntries(Object.keys(FISH).map((k) => [k, fishSprite(k)])),
        };
    }

    return { T, C, build, renderGround, renderInterior, makeCanvas, pixelText };
})();
