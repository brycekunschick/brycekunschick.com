/* The home page: a title screen, a little town with rooms to walk into, people, quests, and fishing. */
(() => {
    const A = window.TownArt;
    const canvas = document.getElementById('town');
    if (!A || !canvas || !canvas.getContext) return;

    const T = A.T;
    const ctx = canvas.getContext('2d');
    const art = A.build();
    const R = art.room;
    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touch = window.matchMedia('(pointer: coarse)').matches;
    root.classList.toggle('is-touch', touch);

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => [...document.querySelectorAll(sel)];
    const params = new URLSearchParams(window.location.search);

    /* ======================================================================
       Storage: where you are (this visit) and quest progress (kept between visits)
       ====================================================================== */

    const MODE_KEY = 'bk-mode';
    const STATE_KEY = 'bk-town-v3';
    const QUEST_KEY = 'bk-town-quests-v2';

    const readJSON = (area, key) => {
        try {
            return JSON.parse(window[area].getItem(key) || 'null');
        } catch (e) {
            return null;
        }
    };
    const writeJSON = (area, key, value) => {
        try {
            window[area].setItem(key, JSON.stringify(value));
        } catch (e) { /* storage unavailable */ }
    };
    const setMode = (m) => {
        try {
            sessionStorage.setItem(MODE_KEY, m);
        } catch (e) { /* storage unavailable */ }
    };

    const saved = readJSON('sessionStorage', STATE_KEY);
    const Q = Object.assign({
        seen: {},
        tour: { house: false, lab: false, post: false },
        tourDone: false,
        rod: false,
        lure: false, // traded to the fisherman for a bluegill and a perch
        bigDone: false,
        muskyDone: false,
        kinds: {}, // every species you've ever caught (the log below only keeps the latest 40)
        fish: [],
        csvQuest: false,
        csv: {},
        csvDone: false,
        letter: null,
    }, readJSON('localStorage', QUEST_KEY) || {});
    const saveQuests = () => writeJSON('localStorage', QUEST_KEY, Q);

    /* ======================================================================
       Scenes
       ====================================================================== */

    const scenes = {};
    const BLOCKING = new Set(['~', 'U', 'L', 'x']);

    function makeScene(id, w, h, opts) {
        const s = Object.assign({ id, w, h, objects: [], actors: [] }, opts);
        s.ground = Array.from({ length: h }, () => new Array(w).fill(opts.fill || '.'));
        s.solid = new Uint8Array(w * h);
        s.targetAt = new Map();
        s.get = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? (s.outside || '.') : s.ground[y][x]);
        s.paint = (x0, y0, x1, y1, k) => {
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s.ground[y][x] = k;
        };
        scenes[id] = s;
        return s;
    }

    function place(s, obj) {
        // fill in defaults without touching getters (some sprites change with the time of day)
        for (const [k, v] of Object.entries({ fw: 1, fh: 1, dx: 0, dy: 0, solid: true })) if (!(k in obj)) obj[k] = v;
        obj.scene = s;
        if (!('sortY' in obj)) obj.sortY = (obj.y + obj.fh) * T;
        s.objects.push(obj);
        for (let y = obj.y; y < obj.y + obj.fh; y++) {
            for (let x = obj.x; x < obj.x + obj.fw; x++) {
                if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
                if (obj.solid) s.solid[y * s.w + x] = 1;
                if (obj.id) s.targetAt.set(y * s.w + x, obj);
            }
        }
        return obj;
    }

    function removeObject(obj) {
        const s = obj.scene;
        s.objects.splice(s.objects.indexOf(obj), 1);
        for (let y = obj.y; y < obj.y + obj.fh; y++) {
            for (let x = obj.x; x < obj.x + obj.fw; x++) {
                const i = y * s.w + x;
                if (s.targetAt.get(i) === obj) s.targetAt.delete(i);
                if (obj.solid) s.solid[i] = 0;
            }
        }
    }

    /* ---------------- The town ---------------- */

    const town = makeScene('town', 48, 36, { kind: 'town', bg: '#2d5e36', label: 'brycekunschick.com' });
    const g0 = town.ground;

    town.paint(17, 13, 29, 23, 'o');
    g0[13][17] = '.';
    g0[13][29] = '.';
    town.paint(9, 11, 10, 15, '=');
    town.paint(9, 14, 16, 15, '=');
    town.paint(35, 11, 36, 15, '=');
    town.paint(30, 14, 36, 15, '=');
    town.paint(9, 22, 16, 23, '=');
    town.paint(30, 22, 38, 23, '=');
    town.paint(37, 24, 38, 25, '=');
    town.paint(22, 24, 24, 35, '=');
    for (const [y, x0, x1] of [[26, 35, 39], [27, 33, 41], [28, 32, 42], [29, 32, 42], [30, 33, 41], [31, 35, 39]]) town.paint(x0, y, x1, y, '~');
    town.paint(37, 26, 38, 29, '#');
    town.paint(5, 26, 13, 30, '"');
    for (const [x, y] of [[5, 26], [13, 26], [5, 30], [13, 30], [12, 30]]) g0[y][x] = '.';
    for (const [x, y] of [[6, 11], [7, 11], [12, 11], [13, 11], [15, 9], [16, 9], [16, 10], [25, 9], [26, 10], [25, 10],
        [31, 17], [31, 18], [30, 18], [42, 15], [42, 16], [18, 26], [19, 26], [27, 25], [28, 25], [28, 26], [15, 19], [15, 20]]) {
        g0[y][x] = '*';
    }
    town.frames = [0, 1, 2, 3].map((f) => A.renderGround(town, f));

    const tree = (x, y) => place(town, { x, y, fw: 2, fh: 2, dy: -8, img: art.tree });
    for (let y = 0; y < town.h; y += 2) {
        for (let x = 0; x < town.w; x += 2) {
            const edge = x < 4 || x >= 44 || y < 4 || y >= 32;
            if (!edge || (y >= 32 && (x === 22 || x === 24))) continue;
            tree(x, y);
        }
    }
    for (const [x, y] of [[14, 5], [19, 6], [26, 5], [30, 5], [4, 12], [42, 12], [4, 21], [42, 19], [15, 28], [27, 27], [18, 9], [28, 9]]) tree(x, y);
    for (const [x, y] of [[6, 9], [13, 9], [31, 9], [40, 9], [13, 18], [34, 18], [42, 22], [20, 29], [26, 30], [29, 30], [4, 24]]) {
        place(town, { x, y, img: art.bush });
    }
    for (const [x, y] of [[30, 31], [16, 31], [43, 25]]) place(town, { x, y, img: art.rock });

    const buildings = {};
    function addBuilding(id, x, y, label) {
        const b = art.buildings[id];
        const fw = b.day.width / T;
        const fh = b.day.height / T;
        const door = { x: x + Math.floor(b.door.x / T), y: y + fh - 1 };
        buildings[id] = { id, x, y, fw, fh, art: b, door, open: false, label };
        place(town, {
            id, x, y, fw, fh, label,
            stand: [[door.x, door.y + 1]],
            faceTiles: [[door.x, door.y]],
            get img() {
                const bb = buildings[id];
                const night = nightLevel > 0.5;
                if (bb.open) return night ? bb.art.openNight : bb.art.open;
                return night ? bb.art.night : bb.art.day;
            },
        });
    }
    addBuilding('house', 7, 6, "Bryce's House");
    addBuilding('lab', 32, 5, 'Project Lab');
    addBuilding('post', 6, 17, 'Post Office');
    addBuilding('trading', 35, 17, 'Trading Post');

    place(town, { x: 6, y: 12, img: art.fence.left });
    place(town, { x: 7, y: 12, img: art.fence.mid });
    place(town, { x: 8, y: 12, img: art.fence.right });
    place(town, { x: 11, y: 12, img: art.fence.left });
    place(town, { x: 12, y: 12, img: art.fence.mid });
    place(town, { x: 13, y: 12, img: art.fence.right });

    const fountain = place(town, { x: 22, y: 17, fw: 3, fh: 3, get img() { return art.fountain[waterFrame]; } });
    place(town, { id: 'board', label: 'Town Board', x: 22, y: 13, fw: 2, dy: -8, img: art.board });
    place(town, { x: 19, y: 17, fw: 2, img: art.bench });
    place(town, { x: 26, y: 17, fw: 2, img: art.bench });
    const lamps = [[18, 13], [28, 13], [18, 23], [28, 23]].map(([x, y]) => place(town, {
        x, y, dy: -16, get img() { return nightLevel > 0.5 ? art.lampLit : art.lamp; },
    }));

    place(town, { id: 'signHouse', label: 'Sign', x: 8, y: 11, img: art.sign });
    place(town, { id: 'signLab', label: 'Sign', x: 34, y: 11, img: art.sign });
    place(town, { id: 'signPost', label: 'Sign', x: 8, y: 22, img: art.sign });
    place(town, { id: 'signTrading', label: 'Sign', x: 39, y: 22, img: art.sign });
    place(town, { id: 'signDock', label: 'Fishing Dock', x: 39, y: 25, img: art.sign });
    place(town, { id: 'report', label: 'Fishing report', x: 32, y: 24, fw: 2, dy: -8, img: art.reportBoard, face: 'up' });
    place(town, { id: 'mailbox', label: 'Mailbox', x: 12, y: 21, dy: -8, img: art.mailbox });
    place(town, { id: 'chalkboard', label: 'Chalkboard', x: 34, y: 21, dy: -8, img: art.chalkboard });
    place(town, { id: 'townSign', label: 'Town sign', x: 17, y: 25, fw: 5, dy: -16, img: art.townSign });
    place(town, { id: 'routeSign', label: 'Route 79', x: 25, y: 30, dy: -8, img: art.routeSign });

    /* ---------------- Rooms ---------------- */

    function makeRoom(id, w, h, label, mat, hint) {
        const s = makeScene(id, w, h, { kind: 'room', room: id, bg: '#0b0c10', fill: 'f', outside: 'x', label, mat, hint });
        s.paint(0, 0, w - 1, 0, 'U');
        s.paint(0, 1, w - 1, 1, 'L');
        s.ground[mat[1]][mat[0]] = 'e';
        return s;
    }
    // things hung on the wall are checked from the tile just below them
    const onWall = (s, o) => place(s, Object.assign({ face: 'up', dy: -4 }, o));

    // Bryce's house
    const house = makeRoom('house', 11, 9, "Bryce's House", [5, 8], 'Check out the story board on the wall!');
    house.paint(3, 4, 7, 6, 'r');
    onWall(house, { x: 1, y: 1, img: R.window });
    onWall(house, { id: 'storyBoard', label: 'Story board', x: 3, y: 0, fw: 2, fh: 2, dy: 0, img: R.storyBoard, main: true });
    onWall(house, { id: 'fishMount', label: 'Fish mount', x: 5, y: 1, img: R.fishMount });
    onWall(house, { id: 'pennant', label: 'WVU pennant', x: 6, y: 1, img: R.pennant });
    onWall(house, { id: 'diploma', label: 'Diploma', x: 7, y: 1, img: R.diploma });
    onWall(house, { x: 9, y: 1, img: R.window });
    place(house, { x: 0, y: 2, dy: -8, img: R.plant });
    place(house, { id: 'bookshelf', label: 'Bookshelf', x: 1, y: 2, fw: 2, dy: -16, img: R.bookshelf });
    place(house, { id: 'bed', label: 'Bed', x: 9, y: 2, fh: 2, img: R.bed });
    place(house, { x: 10, y: 2, dy: -8, img: R.plant });
    place(house, { id: 'laptop', label: 'Laptop', x: 0, y: 5, fw: 2, dy: -8, img: R.laptopDesk });
    place(house, { id: 'houseTable', label: 'Table', x: 8, y: 6, fw: 2, dy: -8, img: R.table });
    house.frames = [A.renderInterior(house, 'house')];

    // Project Lab
    let labFrame = 0;
    let serverFrame = 0;
    const lab = makeRoom('lab', 15, 10, 'Project Lab', [7, 9], 'Every station in the lab is a project. Walk up to anything with a marker.');
    onWall(lab, { id: 'ticker', label: 'Ticker board', x: 1, y: 0, fw: 3, dy: 4, img: R.tickerBoard, ticker: true, stand: [[1, 3], [2, 3], [3, 3]] });
    place(lab, { id: 'tradingDesk', label: 'Trading desk', x: 1, y: 2, fw: 3, dy: -16, face: 'up', main: true, get img() { return R.tradingDesk[labFrame]; } });
    onWall(lab, { id: 'whiteboard', label: 'Whiteboard', x: 5, y: 0, fw: 2, fh: 2, dy: 0, img: R.whiteboard });
    onWall(lab, { x: 8, y: 1, img: R.window });
    place(lab, { id: 'coffee', label: 'Coffee machine', x: 8, y: 2, dy: -8, img: R.coffee });
    onWall(lab, { id: 'dashboard', label: 'Fishing Dashboard', x: 10, y: 0, fw: 2, fh: 2, dy: 0, main: true, get img() { return R.dashboard[labFrame]; } });
    for (const x of [12, 13, 14]) {
        place(lab, { id: 'servers', label: 'Server rack', x, y: 2, dy: -16, face: 'up', get img() { return R.server[(serverFrame + x) % 4]; } });
    }
    place(lab, { id: 'aiStation', label: 'AI Fishing Report', x: 5, y: 5, fw: 2, dy: -8, face: 'up', main: true, img: R.aiStation });
    place(lab, { id: 'dbTerminal', label: 'Database terminal', x: 12, y: 5, fw: 2, dy: -8, face: 'up', img: R.dbTerminal });
    place(lab, { x: 0, y: 8, dy: -8, img: R.plant });
    place(lab, { x: 14, y: 8, dy: -8, img: R.plant });
    lab.frames = [A.renderInterior(lab, 'lab')];

    // Post Office
    const post = makeRoom('post', 11, 9, 'Post Office', [5, 8], 'Talk to the mailman at the counter to get in touch.');
    post.paint(4, 5, 6, 7, 'r');
    for (let x = 1; x <= 8; x++) place(post, { x, y: 0, fh: 2, img: R.mailSlots });
    onWall(post, { x: 0, y: 1, img: R.stampPoster });
    onWall(post, { id: 'contactBoard', label: 'Contact board', x: 9, y: 0, fw: 2, fh: 2, dy: 0, img: R.contactBoard, main: true, stand: [[10, 2]] });
    for (let x = 0; x <= 8; x++) {
        const img = x === 0 ? R.counter.left : x === 8 ? R.counter.right : R.counter.mid;
        place(post, { id: 'counter', label: 'Counter', x, y: 3, dy: -8, img, stand: [[4, 4]], face: 'up' });
    }
    place(post, { id: 'packages', label: 'Packages', x: 0, y: 2, img: R.packages });
    place(post, { id: 'scale', label: 'Postal scale', x: 9, y: 2, dy: -8, img: R.scale });
    place(post, { id: 'postBench', label: 'Bench', x: 1, y: 6, fw: 2, img: art.bench });
    place(post, { x: 0, y: 8, dy: -8, img: R.plant });
    place(post, { x: 10, y: 8, dy: -8, img: R.plant });
    post.frames = [A.renderInterior(post, 'post')];

    /* ---------------- Lost files (a side quest) ---------------- */

    // Where the files can turn up. Each visit hides two outside and one indoors, and the spots
    // stay put once you've picked one up or taken the quest.
    const CSV_PLACES = {
        grass: { where: 'in the tall grass', spots: [['town', 7, 27], ['town', 11, 28], ['town', 9, 29]] },
        east: { where: 'out by the east woods', spots: [['town', 43, 15], ['town', 43, 17], ['town', 43, 23]] },
        west: { where: 'along the west edge of town', spots: [['town', 5, 15], ['town', 5, 24], ['town', 4, 19]] },
        houseBack: { where: "behind Bryce's House", spots: [['town', 8, 5], ['town', 11, 5]] },
        labBack: { where: 'behind the Project Lab', spots: [['town', 34, 4], ['town', 38, 4]] },
        pond: { where: 'down by the pond', spots: [['town', 33, 31], ['town', 43, 28], ['town', 32, 27]] },
        route: { where: 'near the Route 79 sign', spots: [['town', 27, 31], ['town', 26, 29]] },
        trading: { where: 'behind the Trading Post', spots: [['town', 38, 16], ['town', 40, 16]] },
        house: { where: "in Bryce's House", indoor: true, spots: [['house', 10, 7], ['house', 1, 7]] },
        lab: { where: 'in the Project Lab', indoor: true, spots: [['lab', 13, 8], ['lab', 1, 6]] },
        post: { where: 'in the Post Office', indoor: true, spots: [['post', 9, 7], ['post', 8, 5]] },
    };
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];
    const shuffled = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    function hideFiles() {
        const outside = shuffled(Object.keys(CSV_PLACES).filter((k) => !CSV_PLACES[k].indoor)).slice(0, 2);
        const inside = pick(Object.keys(CSV_PLACES).filter((k) => CSV_PLACES[k].indoor));
        return Object.fromEntries(['a', 'b', 'c'].map((key, i) => {
            const area = [outside[0], outside[1], inside][i];
            return [key, [area].concat(pick(CSV_PLACES[area].spots))];
        }));
    }
    const validSpots = (spots) => spots && ['a', 'b', 'c'].every((k) => Array.isArray(spots[k]) && CSV_PLACES[spots[k][0]] && scenes[spots[k][1]]);
    if (!validSpots(Q.csvSpots) || (!Q.csvQuest && !Object.keys(Q.csv).length)) Q.csvSpots = hideFiles();
    for (const [key, [, sid, x, y]] of Object.entries(Q.csvSpots)) {
        if (Q.csv[key]) continue;
        place(scenes[sid], { id: 'csv', csvKey: key, label: 'Something shiny', x, y, solid: false, item: true, img: art.csv, dx: 2, dy: 2 });
    }
    // the places still hiding a file ("in the tall grass", "in Bryce's House"...), for the stranger's hints
    const missingFiles = () => ['a', 'b', 'c'].filter((k) => !Q.csv[k]).map((k) => CSV_PLACES[Q.csvSpots[k][0]]);
    const listOf = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] || '');

    /* ======================================================================
       People
       ====================================================================== */

    const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    let scene = town;

    class Actor {
        constructor(o) {
            Object.assign(this, { dir: 'down', alpha: 1, z: 0, visible: true, steps: 0, move: null, emote: 0, carry: 0 }, o);
            this.px = this.x * T;
            this.py = this.y * T;
            this.scene.actors.push(this);
        }

        get sortY() {
            return this.py + T + 0.5;
        }

        place(x, y, dir) {
            this.x = x;
            this.y = y;
            this.px = x * T;
            this.py = y * T;
            this.move = null;
            this.carry = 0;
            if (dir) this.dir = dir;
        }

        startMove(tx, ty, dur, ghost = false) {
            // carry over time left from the last step so continuous walking never hitches
            const carry = Math.min(0.5, (this.carry || 0) / dur);
            this.carry = 0;
            this.move = { fx: this.x, fy: this.y, tx, ty, t: carry, dur, ghost };
            this.x = tx;
            this.y = ty;
        }

        step(dir, dur) {
            const [dx, dy] = DIRS[dir];
            this.dir = dir;
            if (!walkable(this.x + dx, this.y + dy, this, this.scene)) return false;
            this.startMove(this.x + dx, this.y + dy, dur);
            return true;
        }

        update(dt) {
            if (this.emote > 0) this.emote -= dt;
            const m = this.move;
            if (!m) return;
            m.t += dt / m.dur;
            if (m.t >= 1) {
                this.carry = (m.t - 1) * m.dur;
                this.px = m.tx * T;
                this.py = m.ty * T;
                this.move = null;
                this.steps++;
                if (this.onArrive) this.onArrive();
                if (m.resolve) m.resolve();
            } else {
                this.px = (m.fx + (m.tx - m.fx) * m.t) * T;
                this.py = (m.fy + (m.ty - m.fy) * m.t) * T;
            }
        }

        frame() {
            if (!this.move) return 0;
            const t = this.move.t;
            if (t < 0.15 || t > 0.85) return 0;
            return this.steps % 2 ? 1 : 2;
        }

        async walk(tiles, dur = 0.26) {
            for (const [x, y] of tiles) {
                this.dir = dirBetween(this.x, this.y, x, y);
                await new Promise((resolve) => {
                    this.startMove(x, y, dur);
                    this.move.resolve = resolve;
                    if (fastForward) this.update(dur);
                });
            }
        }

        face(target) {
            this.dir = dirBetween(this.x, this.y, target.x, target.y);
        }
    }

    const dirBetween = (x0, y0, x1, y1) => {
        const dx = x1 - x0;
        const dy = y1 - y0;
        if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
        return dy > 0 ? 'down' : 'up';
    };

    function walkable(x, y, who, s = scene) {
        if (x < 0 || y < 0 || x >= s.w || y >= s.h) return false;
        if (s.solid[y * s.w + x]) return false;
        if (BLOCKING.has(s.ground[y][x])) return false;
        for (const a of s.actors) if (a !== who && a.visible && a.x === x && a.y === y) return false;
        return true;
    }

    const player = new Actor({ scene: town, kind: 'visitor', x: 23, y: 15, dir: 'down', label: 'You' });
    const bryce = new Actor({ scene: town, kind: 'bryce', x: 18, y: 15, dir: 'left', id: 'bryce', name: 'Bryce', label: 'Bryce' });
    const fisher = new Actor({ scene: town, kind: 'fisher', x: 38, y: 29, dir: 'right', id: 'fisher', name: 'Fisherman', label: 'Fisherman' });
    const stranger = new Actor({ scene: town, kind: 'stranger', x: 27, y: 25, dir: 'down', id: 'stranger', name: 'Stranger', label: 'Stranger', home: { x0: 25, y0: 24, x1: 29, y1: 26 } });
    const mailman = new Actor({ scene: post, kind: 'mailman', x: 4, y: 2, dir: 'down', id: 'mailman', name: 'Mailman', label: 'Mailman', stand: [[4, 4]] });
    const assistant = new Actor({ scene: lab, kind: 'assistant', x: 9, y: 7, dir: 'left', id: 'assistant', name: 'Lab Assistant', label: 'Lab Assistant' });

    /* ======================================================================
       Time, tweens, and the screen overlays
       ====================================================================== */

    let clock = 0;
    let waterFrame = 0;
    let fastForward = false;
    const tweens = [];

    function tween(from, to, secs, set, ease = (t) => t) {
        return new Promise((resolve) => {
            if (fastForward || secs <= 0) {
                if (set) set(to);
                resolve();
                return;
            }
            tweens.push({ from, to, secs, set, ease, t: 0, resolve });
        });
    }

    const wait = (secs) => tween(0, 1, secs, null);
    const easeIn = (t) => t * t;
    const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

    let fade = 0;
    let iris = 1;
    const fadeTo = (v, secs = 0.28) => tween(fade, v, secs, (x) => { fade = x; });

    /* ======================================================================
       Day and night, from the visitor's clock (the sun/moon button overrides it)
       ====================================================================== */

    const ramp = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
    function skyByClock() {
        const d = new Date();
        const h = d.getHours() + d.getMinutes() / 60;
        const night = h >= 12 ? ramp(h, 19.75, 20.75) : 1 - ramp(h, 5.5, 6.5);
        const dusk = h >= 12 ? ramp(h, 17.75, 19) * (1 - ramp(h, 20, 21)) : ramp(h, 5.25, 6.25) * (1 - ramp(h, 6.75, 7.75));
        return { night, dusk };
    }

    let nightOverride = saved && typeof saved.night === 'boolean' ? saved.night : null;
    let sky = skyByClock();
    const skyTarget = () => (nightOverride == null ? sky : { night: nightOverride ? 1 : 0, dusk: 0 });
    let nightLevel = skyTarget().night;
    let duskLevel = skyTarget().dusk;
    const timeToggle = $('#time-toggle');

    function syncTimeUI() {
        const isNight = skyTarget().night > 0.5;
        root.classList.toggle('is-night', isNight);
        timeToggle.setAttribute('aria-pressed', String(isNight));
        const label = isNight ? 'Switch to day' : 'Switch to night';
        timeToggle.setAttribute('aria-label', label);
        timeToggle.title = nightOverride == null ? `${label} (following your clock)` : label;
    }
    syncTimeUI();
    timeToggle.addEventListener('click', () => {
        nightOverride = !(skyTarget().night > 0.5);
        syncTimeUI();
        save();
    });
    setInterval(() => {
        sky = skyByClock();
        syncTimeUI();
    }, 30000);

    /* ======================================================================
       Canvas size and camera
       ====================================================================== */

    let S = 4;
    let dpr = 1;
    let viewW = 0;
    let viewH = 0;
    const cam = { x: 0, y: 0 };
    let camMix = null;
    const light = document.createElement('canvas');
    const lg = light.getContext('2d');

    function computeScale() {
        const cw = window.innerWidth;
        const ch = window.innerHeight;
        // tile size in CSS px; short screens (a phone on its side) zoom out so you can still see around you
        const target = Math.min(cw < 600 ? 34 : Math.max(40, Math.min(64, cw / 30)), Math.max(24, ch / 12));
        let base = Math.max(1, Math.floor((target * dpr) / T + 0.25));
        const forced = Number(params.get('scale'));
        if (forced > 0) base = forced;
        S = base;
        if (scene.kind === 'room') {
            // rooms are small, so zoom in a little while keeping the whole room in view
            // (on a narrow phone, zoom out one step if that's what it takes to fit the room)
            const fits = (s) => scene.w * T * s <= canvas.width - 24 * dpr && (scene.h + 2.5) * T * s <= canvas.height;
            S = base + 2;
            while (S > Math.max(1, base - 1) && !fits(S)) S--;
        }
        viewW = canvas.width / S;
        viewH = canvas.height / S;
        light.width = Math.ceil(viewW) + 2;
        light.height = Math.ceil(viewH) + 2;
    }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 3);
        const cw = window.innerWidth;
        const ch = window.innerHeight;
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        computeScale();
        ctx.imageSmoothingEnabled = false;
    }
    resize();
    window.addEventListener('resize', resize);

    function updateCamera() {
        const mw = scene.w * T;
        const mh = scene.h * T;
        let x = player.px + 8 - viewW / 2;
        let y = player.py + 4 - viewH / 2;
        if (titleMode) {
            const t = clock * 0.07;
            x = 23.5 * T + Math.sin(t) * 9 * T - viewW / 2;
            y = 18 * T + Math.sin(t * 0.73) * 5 * T - viewH / 2;
        }
        const clamp = (v, size, total) => (size >= total ? (total - size) / 2 : Math.max(0, Math.min(total - size, v)));
        x = clamp(x, viewW, mw);
        y = clamp(y, viewH, mh);
        // rooms sit a little lower so the top bar doesn't crowd the back wall
        if (scene.kind === 'room' && viewH >= mh) y -= (36 * dpr) / S;
        if (camMix) {
            const k = easeInOut(camMix.t);
            x = camMix.x + (x - camMix.x) * k;
            y = camMix.y + (y - camMix.y) * k;
        }
        cam.x = Math.round(x * S) / S;
        cam.y = Math.round(y * S) / S;
    }

    const toScreenX = (wx) => Math.round((wx - cam.x) * S);
    const toScreenY = (wy) => Math.round((wy - cam.y) * S);

    function blit(img, wx, wy, alpha = 1) {
        const x = toScreenX(wx);
        const y = toScreenY(wy);
        const w = img.width * S;
        const h = img.height * S;
        if (x > canvas.width || y > canvas.height || x + w < 0 || y + h < 0) return;
        if (alpha !== 1) ctx.globalAlpha = Math.max(0, alpha);
        ctx.drawImage(img, x, y, w, h);
        ctx.globalAlpha = 1;
    }

    function pxRect(wx, wy, w, h, col) {
        ctx.fillStyle = col;
        ctx.fillRect(toScreenX(wx), toScreenY(wy), Math.round(w * S), Math.round(h * S));
    }

    function shadowAt(cx, cy, rx, ry, col) {
        for (let r = -ry; r <= ry; r++) {
            const half = Math.round(rx * Math.sqrt(1 - (r * r) / ((ry + 0.5) ** 2)));
            if (half > 0) pxRect(cx - half, cy + r, half * 2, 1, col);
        }
    }

    /* ======================================================================
       Little bits of life in town
       ====================================================================== */

    const particles = [];
    const ripples = [];
    let nextSmoke = 0;
    let nextFish = 3;

    const flowerSpots = [];
    for (let y = 0; y < town.h; y++) for (let x = 0; x < town.w; x++) if (g0[y][x] === '*') flowerSpots.push([x, y]);
    const butterflies = reduceMotion ? [] : [0, 1, 2].map((i) => {
        const [x, y] = flowerSpots[(i * 7) % flowerSpots.length];
        return { hx: x * T + 8, hy: y * T, phase: i * 2.1, col: ['#ffffff', '#ffd84a', '#f59ac0'][i] };
    });
    const fireflies = reduceMotion ? [] : [[9, 28], [7, 27], [11, 29], [35, 25], [40, 24], [31, 29], [36, 31], [16, 25],
        [27, 29], [42, 27], [6, 14], [14, 7], [20, 8], [41, 13], [5, 22], [29, 11]].map(([x, y], i) => ({ hx: x * T + 8, hy: y * T + 4, phase: i * 1.7 }));

    const isWater = (x, y) => town.get(x, y) === '~';
    const pondTiles = [];
    for (let y = 0; y < town.h; y++) {
        for (let x = 0; x < town.w; x++) {
            const inner = isWater(x, y) && isWater(x, y - 1) && isWater(x, y + 1) && isWater(x - 1, y) && isWater(x + 1, y);
            if (inner && !(x >= 36 && x <= 41 && y >= 28 && y <= 30)) pondTiles.push([x, y]);
        }
    }

    function updateLife(dt) {
        if (reduceMotion) return;
        nextSmoke -= dt;
        if (nextSmoke <= 0) {
            nextSmoke = 1.1 + Math.random() * 0.6;
            const h = buildings.house;
            particles.push({ kind: 'smoke', x: h.x * T + 74, y: h.y * T - 1, vx: 2 + Math.random() * 2, vy: -9, life: 0, max: 3.2 });
        }
        nextFish -= dt;
        if (nextFish <= 0 && pondTiles.length) {
            nextFish = 5 + Math.random() * 6;
            const [x, y] = pondTiles[(Math.random() * pondTiles.length) | 0];
            ripples.push({ x: x * T + 8, y: y * T + 8, t: 0 });
        }
        for (const p of particles) {
            p.life += dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.kind === 'leaf') p.vy += 90 * dt;
        }
        for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life > particles[i].max) particles.splice(i, 1);
        for (const r of ripples) r.t += dt;
        for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i].t > 1.6) ripples.splice(i, 1);
    }

    function leaves(x, y) {
        if (reduceMotion) return;
        for (let i = 0; i < 4; i++) {
            particles.push({ kind: 'leaf', x: x * T + 4 + Math.random() * 8, y: y * T + 8, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 18, life: 0, max: 0.45 });
        }
    }

    function drawLife() {
        for (const p of particles) {
            const k = p.life / p.max;
            if (p.kind === 'smoke') {
                const size = 2 + Math.floor(k * 3);
                ctx.globalAlpha = 0.55 * (1 - k);
                pxRect(Math.round(p.x + Math.sin(p.life * 2) * 2), Math.round(p.y), size, size, '#eef0f4');
                ctx.globalAlpha = 1;
            } else if (p.kind === 'leaf') {
                pxRect(Math.round(p.x), Math.round(p.y), 1, 1, k < 0.5 ? '#72c262' : '#4c9e4c');
            } else if (p.kind === 'dust') {
                blit(art.dust[Math.min(2, Math.floor(k * 3))], p.x - 12, p.y - 4, 1 - k * 0.5);
            }
        }
        for (const r of ripples) {
            const k = r.t / 1.6;
            if (r.t < 0.35) {
                const hop = Math.sin((r.t / 0.35) * Math.PI) * 6;
                pxRect(r.x - 2 + Math.round(r.t * 10), r.y - Math.round(hop), 3, 1, '#d5e6f2');
            }
            const rad = 2 + k * 9;
            ctx.globalAlpha = 0.8 * (1 - k);
            for (let a = 0; a < 20; a++) {
                const ang = (a / 20) * Math.PI * 2;
                pxRect(Math.round(r.x + Math.cos(ang) * rad), Math.round(r.y + Math.sin(ang) * rad * 0.5), 1, 1, '#e8f7ff');
            }
            ctx.globalAlpha = 1;
        }
        if (nightLevel < 0.5) {
            for (const b of butterflies) {
                const t = clock * 0.9 + b.phase;
                const x = b.hx + Math.sin(t) * 10 + Math.sin(t * 2.3) * 4;
                const y = b.hy - 6 + Math.cos(t * 1.3) * 5;
                const flap = Math.floor(clock * 8 + b.phase * 3) % 2;
                pxRect(Math.round(x) - (flap ? 2 : 1), Math.round(y), flap ? 2 : 1, 2, b.col);
                pxRect(Math.round(x) + 1, Math.round(y), flap ? 2 : 1, 2, b.col);
                pxRect(Math.round(x), Math.round(y), 1, 2, '#3a3a3a');
            }
        }
    }

    function drawFireflies() {
        if (nightLevel < 0.05) return;
        ctx.globalCompositeOperation = 'lighter';
        for (const f of fireflies) {
            const t = clock * 0.6 + f.phase;
            const glow = Math.max(0, Math.sin(t * 2.2)) ** 2 * nightLevel;
            if (glow < 0.05) continue;
            const x = Math.round(f.hx + Math.sin(t) * 14);
            const y = Math.round(f.hy + Math.cos(t * 0.7) * 8);
            ctx.globalAlpha = glow * 0.35;
            pxRect(x - 1, y - 1, 3, 3, '#ffe27a');
            ctx.globalAlpha = glow;
            pxRect(x, y, 1, 1, '#fff6b0');
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    /* ======================================================================
       Sunset and night lighting (outdoors only)
       ====================================================================== */

    const lights = [];
    for (const l of lamps) lights.push({ x: l.x * T + 8, y: l.y * T - 10, r: 44, a: 0.95 });
    for (const b of Object.values(buildings)) {
        for (const w of b.art.windows) lights.push({ x: b.x * T + w.x + w.w / 2, y: b.y * T + w.y + w.h / 2 + 6, r: 22, a: 0.85 });
        lights.push({ x: b.door.x * T + 8, y: b.door.y * T + 10, r: 16, a: 0.5 });
    }
    lights.push({ x: fountain.x * T + 24, y: fountain.y * T + 24, r: 26, a: 0.35 });

    function drawSky() {
        if (duskLevel > 0.01) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = `rgba(255, 176, 120, ${0.42 * duskLevel})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'source-over';
        }
        if (nightLevel < 0.01) return;
        const ox = Math.floor(cam.x);
        const oy = Math.floor(cam.y);
        lg.globalCompositeOperation = 'source-over';
        lg.clearRect(0, 0, light.width, light.height);
        lg.fillStyle = `rgba(12, 18, 52, ${0.62 * nightLevel})`;
        lg.fillRect(0, 0, light.width, light.height);
        lg.globalCompositeOperation = 'destination-out';
        const all = lights.concat([{ x: player.px + 8, y: player.py + 4, r: 30, a: 0.55 }]);
        for (const L of all) {
            const x = L.x - ox;
            const y = L.y - oy;
            if (x < -L.r || y < -L.r || x > light.width + L.r || y > light.height + L.r) continue;
            const r = L.r * (L.r > 40 ? 1 + Math.sin(clock * 7 + L.x) * 0.03 : 1);
            const grad = lg.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, `rgba(0,0,0,${L.a})`);
            grad.addColorStop(0.6, `rgba(0,0,0,${L.a * 0.45})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            lg.fillStyle = grad;
            lg.fillRect(x - r, y - r, r * 2, r * 2);
        }
        lg.globalCompositeOperation = 'source-over';
        ctx.drawImage(light, 0, 0, light.width, light.height, toScreenX(ox), toScreenY(oy), light.width * S, light.height * S);

        ctx.globalCompositeOperation = 'lighter';
        for (const l of lamps) {
            const x = (l.x * T + 8 - cam.x) * S;
            const y = (l.y * T - 10 - cam.y) * S;
            const r = 30 * S;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, `rgba(255, 196, 110, ${0.22 * nightLevel})`);
            grad.addColorStop(1, 'rgba(255, 196, 110, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    /* ======================================================================
       Guidance: markers over things worth checking, and "!" over people with quests
       ====================================================================== */

    let highlight = null;

    function needsVisit(id) {
        return (id === 'house' && !Q.tour.house) || (id === 'lab' && !Q.tour.lab) || (id === 'post' && !Q.tour.post);
    }

    function questGiver(a) {
        if (a === fisher) {
            return !Q.rod || (!Q.lure && caught('bluegill') && caught('perch'))
                || (Q.lure && !Q.bigDone && bigCaught() >= BIG_FISH.length) || (caught('musky') && !Q.muskyDone);
        }
        if (a === stranger) return !Q.csvQuest || (csvFound() >= 3 && !Q.csvDone);
        if (a === mailman) return !Q.letter;
        if (a === bryce) return Q.letter === 'carrying';
        return false;
    }

    function drawGuides() {
        const bob = Math.round(Math.sin(clock * 6) * 2);
        if (scene === town) {
            for (const id of ['house', 'lab', 'post']) {
                if (!needsVisit(id) || highlight === id) continue;
                const b = buildings[id];
                blit(art.marker, b.door.x * T + 4, b.door.y * T - 24 + bob);
            }
        } else {
            for (const o of scene.objects) {
                if (!o.main || Q.seen[o.id]) continue;
                blit(art.marker, o.x * T + (o.fw * T) / 2 - 4, o.y * T + o.dy - 11 + bob);
            }
        }
        for (const a of scene.actors) {
            if (a === player || !a.visible || !questGiver(a)) continue;
            const x = a.px + 7;
            const y = a.py - 22 + bob;
            pxRect(x - 1, y - 1, 4, 10, '#262a36');
            pxRect(x, y, 2, 6, '#ffd84a');
            pxRect(x, y + 7, 2, 1, '#ffd84a');
        }
    }

    function drawTabMarker(spot) {
        if (scene !== town) return;
        let wx;
        let wy;
        let label;
        if (spot === 'dock') {
            wx = 38 * T;
            wy = 26 * T - 4;
            label = 'Fishing Dock';
        } else {
            const b = buildings[spot];
            if (!b) return;
            wx = b.door.x * T + 4;
            wy = b.door.y * T - 14;
            label = b.label;
        }
        const bob = Math.round(Math.sin(clock * 6) * 2);
        const sx = (wx + 4 - cam.x) * S;
        const sy = (wy - cam.y) * S;
        const margin = 28 * dpr;
        if (sx > margin && sy > margin && sx < canvas.width - margin && sy < canvas.height - margin) {
            blit(art.marker, wx, wy - 10 + bob);
            return;
        }
        const left = 40 * dpr;
        const right = canvas.width - 40 * dpr;
        const top = 150 * dpr;
        const bottom = canvas.height - 70 * dpr;
        const cx = canvas.width / 2;
        const cy = (top + bottom) / 2;
        const ang = Math.atan2(sy - cy, sx - cx);
        const vx = Math.cos(ang);
        const vy = Math.sin(ang);
        const reach = Math.min(
            vx > 0 ? (right - cx) / vx : vx < 0 ? (left - cx) / vx : Infinity,
            vy > 0 ? (bottom - cy) / vy : vy < 0 ? (top - cy) / vy : Infinity,
        );
        const ex = cx + vx * reach;
        const ey = cy + vy * reach;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        const u = 3 * dpr;
        ctx.fillStyle = '#262a36';
        ctx.fillRect(-4 * u, -4 * u, 8 * u, 8 * u);
        ctx.fillStyle = '#ffd84a';
        for (let i = 0; i < 4; i++) ctx.fillRect((-2 + i) * u, (-3 + i) * u, u, (6 - i * 2) * u);
        ctx.restore();
        ctx.font = `${Math.round(14 * dpr)}px "Pixelify Sans", monospace`;
        ctx.textAlign = 'center';
        const ty = ey + (ey > cy ? -20 : 30) * dpr;
        const tw = ctx.measureText(label).width + 14 * dpr;
        const lx = Math.max(8 * dpr + tw / 2, Math.min(canvas.width - 8 * dpr - tw / 2, ex));
        ctx.fillStyle = '#262a36';
        ctx.fillRect(lx - tw / 2, ty - 15 * dpr, tw, 21 * dpr);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, lx, ty);
    }

    /* ======================================================================
       Drawing
       ====================================================================== */

    let hover = null;
    let walkTarget = null;
    let fishing = null;

    function drawActor(a) {
        const lift = Math.max(0, a.z);
        const shrink = Math.max(0.35, 1 - lift / 70);
        ctx.globalAlpha = a.alpha;
        shadowAt(a.px + 8, a.py + 15, Math.round(6 * shrink), 1, 'rgba(24, 40, 32, 0.28)');
        ctx.globalAlpha = 1;
        blit(art.people[a.kind][a.dir][a.frame()], a.px, a.py - 8 - lift, a.alpha);
        const tx = Math.round(a.px / T);
        const ty = Math.round(a.py / T);
        if (!lift && a.scene === town && town.get(tx, ty) === '"') blit(art.tallFront, tx * T, ty * T + 8, a.alpha);

        if (a === fisher && fisher.dir === 'right') {
            const hx = a.px + 12;
            const hy = a.py + 6;
            for (let i = 0; i <= 12; i++) pxRect(hx + i, hy - Math.round(i * 0.75), 1, 1, i < 3 ? '#5f3d20' : '#8d5d31');
            drawLine(hx + 12, hy - 9, a.px + 40, a.py + 9 + Math.round(Math.sin(clock * 2.6)));
            drawBobber(a.px + 40, a.py + 9 + Math.round(Math.sin(clock * 2.6)), false);
        }
        if (a === player && fishing) {
            const [dx, dy] = DIRS[player.dir];
            const hx = a.px + 8 + dx * 6;
            const hy = a.py + 4 + dy * 4;
            const bx = fishing.tx * T + 8;
            const biting = fishing.phase === 'bite';
            const by = fishing.ty * T + 8 + (biting ? 2 : Math.round(Math.sin(clock * 3)));
            drawLine(hx, hy - 6, bx, by);
            drawBobber(bx, by, biting);
        }
        if (a.emote > 0) blit(art.emote, a.px, a.py - 30 - lift);
    }

    function drawLine(x0, y0, x1, y1) {
        for (let i = 1; i < 16; i++) {
            const t = i / 16;
            pxRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 3), 1, 1, 'rgba(240, 244, 250, 0.85)');
        }
    }

    function drawBobber(x, y, dipping) {
        if (dipping) {
            ctx.globalAlpha = 0.9;
            for (let a = 0; a < 12; a++) {
                const ang = (a / 12) * Math.PI * 2;
                pxRect(Math.round(x + Math.cos(ang) * 4), Math.round(y + Math.sin(ang) * 2), 1, 1, '#e8f7ff');
            }
            ctx.globalAlpha = 1;
            pxRect(x - 1, y, 3, 1, '#e05b50');
            return;
        }
        pxRect(x - 1, y - 1, 3, 2, '#e05b50');
        pxRect(x - 1, y + 1, 3, 1, '#fbfbf7');
    }

    function drawTicker(o) {
        const strip = R.tickerStrip;
        const w = 44;
        const off = Math.floor(clock * 14) % strip.width;
        const x = o.x * T + o.dx + 2;
        const y = o.y * T + o.dy + 6;
        const part = (sx, sw, dx) => {
            if (sw <= 0) return;
            ctx.drawImage(strip, sx, 0, sw, 5, toScreenX(x + dx), toScreenY(y), sw * S, 5 * S);
        };
        const w1 = Math.min(w, strip.width - off);
        part(off, w1, 0);
        part(0, w - w1, w1);
    }

    function render() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = scene.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const gimg = scene.frames[scene.frames.length > 1 ? waterFrame : 0];
        const sx = Math.max(0, Math.floor(cam.x));
        const sy = Math.max(0, Math.floor(cam.y));
        const sw = Math.min(gimg.width - sx, Math.ceil(viewW) + 2);
        const sh = Math.min(gimg.height - sy, Math.ceil(viewH) + 2);
        if (sw > 0 && sh > 0) ctx.drawImage(gimg, sx, sy, sw, sh, toScreenX(sx), toScreenY(sy), sw * S, sh * S);

        if (walkTarget && walkTarget.t > 0) {
            ctx.globalAlpha = Math.min(1, walkTarget.t * 2);
            const x = walkTarget.x * T;
            const y = walkTarget.y * T;
            const col = '#fbfbf7';
            pxRect(x, y, 4, 1, col); pxRect(x, y, 1, 4, col);
            pxRect(x + 12, y, 4, 1, col); pxRect(x + 15, y, 1, 4, col);
            pxRect(x, y + 15, 4, 1, col); pxRect(x, y + 12, 1, 4, col);
            pxRect(x + 12, y + 15, 4, 1, col); pxRect(x + 15, y + 12, 1, 4, col);
            ctx.globalAlpha = 1;
        }

        const list = [];
        const vx0 = cam.x - 48;
        const vx1 = cam.x + viewW + 48;
        const vy0 = cam.y - 48;
        const vy1 = cam.y + viewH + 64;
        for (const o of scene.objects) {
            const ox = o.x * T;
            const oy = o.y * T;
            if (ox + o.fw * T < vx0 || ox > vx1 || oy + o.fh * T < vy0 || oy > vy1) continue;
            list.push(o);
        }
        for (const a of scene.actors) if (a.visible) list.push(a);
        list.sort((a, b) => a.sortY - b.sortY);

        for (const d of list) {
            if (d instanceof Actor) {
                drawActor(d);
                continue;
            }
            blit(d.img, d.x * T + d.dx, d.y * T + d.dy);
            if (d.ticker) drawTicker(d);
            if (d.item) {
                const f = Math.floor(clock * 6 + d.x) % 4;
                blit(art.sparkle[f], d.x * T + 10, d.y * T - 2);
            }
        }

        if (scene === town) {
            const labB = buildings.lab;
            if (Math.floor(clock * 1.4) % 2 === 0) pxRect(labB.x * T + 22, labB.y * T - 1, 1, 1, '#ff4d4d');
            drawLife();
            drawSky();
            drawFireflies();
        }

        if (!titleMode) {
            drawGuides();
            if (highlight) drawTabMarker(highlight);
        }

        if (fade > 0.001) {
            ctx.fillStyle = `rgba(10, 11, 18, ${fade})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        if (iris < 1) {
            const cx = (player.px + 8 - cam.x) * S;
            const cy = (player.py + 2 - cam.y) * S;
            const max = Math.hypot(canvas.width, canvas.height);
            ctx.fillStyle = '#0a0b12';
            ctx.beginPath();
            ctx.rect(0, 0, canvas.width, canvas.height);
            ctx.arc(cx, cy, Math.max(0, iris * max), 0, Math.PI * 2, true);
            ctx.fill('evenodd');
        }
    }

    /* ======================================================================
       Speech box
       ====================================================================== */

    const dialogEl = $('.dialog');
    const dialogText = $('.dialog-text');
    const dialogName = $('.dialog-name');
    const choicesEl = $('.dialog-choices');
    const live = $('#dialog-live');
    let talk = null;

    // Anything about Bryce is said by Bryce: his portrait pops up and his mouth moves while the text types.
    // A page is a plain string (whoever is talking), or B('...') for Bryce himself.
    const B = (text) => ({ who: 'bryce', text });
    const pageText = (page) => (typeof page === 'string' ? page : page.text);
    const faceEl = $('.dialog-face');
    const faceCtx = faceEl.querySelector('canvas').getContext('2d');
    let faceFrame = -1;

    function drawFace(open) {
        const f = open ? 1 : 0;
        if (f === faceFrame) return;
        faceFrame = f;
        faceCtx.clearRect(0, 0, 24, 24);
        faceCtx.drawImage(art.portrait.bryce[f], 0, 0);
    }

    function showFace(on) {
        const was = !faceEl.hidden;
        faceEl.hidden = !on;
        root.classList.toggle('has-face', on);
        if (on && !was) {
            drawFace(false);
            faceEl.classList.remove('is-popping');
            void faceEl.offsetWidth; // restart the pop-in
            faceEl.classList.add('is-popping');
        }
    }

    function say(pages, opts = {}) {
        if (fastForward) return Promise.resolve(null);
        clearStatus();
        return new Promise((resolve) => {
            talk = { pages: [].concat(pages), i: 0, typed: 0, full: false, name: opts.name || null, choices: opts.choices || null, choosing: false, sel: 0, resolve };
            dialogEl.hidden = false;
            root.classList.add('is-talking');
            held.length = 0;
            showPage();
        });
    }

    function showPage() {
        const page = talk.pages[talk.i];
        const name = page.who === 'bryce' ? 'Bryce' : talk.name;
        dialogName.hidden = !name;
        dialogName.textContent = name || '';
        showFace(name === 'Bryce');
        talk.typed = 0;
        talk.full = false;
        dialogText.textContent = '';
        dialogEl.classList.remove('is-waiting');
        live.textContent = (name ? name + ': ' : '') + pageText(page);
    }

    function updateTalk(dt) {
        if (!talk || talk.full || talk.choosing) return;
        const text = pageText(talk.pages[talk.i]);
        talk.typed += dt * (reduceMotion ? 400 : 62);
        const n = Math.min(text.length, Math.floor(talk.typed));
        dialogText.textContent = text.slice(0, n);
        // flap the mouth while the words come out (shut on spaces, so it follows the rhythm)
        if (!faceEl.hidden) drawFace(n < text.length && text[n] !== ' ' && Math.floor(clock * 9) % 2 === 0);
        if (n >= text.length) {
            talk.full = true;
            if (!faceEl.hidden) drawFace(false);
            if (talk.i === talk.pages.length - 1 && talk.choices) showChoices();
            else dialogEl.classList.add('is-waiting');
        }
    }

    function showChoices() {
        talk.choosing = true;
        choicesEl.innerHTML = '';
        talk.choices.forEach((label, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('role', 'menuitem');
            b.textContent = label;
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                endTalk(i);
            });
            b.addEventListener('mouseenter', () => selectChoice(i));
            choicesEl.appendChild(b);
        });
        choicesEl.hidden = false;
        selectChoice(0);
    }

    function selectChoice(i) {
        talk.sel = (i + talk.choices.length) % talk.choices.length;
        [...choicesEl.children].forEach((b, j) => b.classList.toggle('is-selected', j === talk.sel));
        choicesEl.children[talk.sel].focus({ preventScroll: true });
    }

    function advance() {
        if (!talk) return;
        if (talk.choosing) {
            endTalk(talk.sel);
            return;
        }
        if (!talk.full) {
            talk.typed = 1e9;
            updateTalk(0);
            return;
        }
        if (talk.i < talk.pages.length - 1) {
            talk.i++;
            showPage();
            return;
        }
        endTalk(null);
    }

    function endTalk(choice) {
        const t = talk;
        talk = null;
        dialogEl.hidden = true;
        choicesEl.hidden = true;
        dialogEl.classList.remove('is-waiting');
        showFace(false);
        root.classList.remove('is-talking');
        live.textContent = '';
        if (document.activeElement && choicesEl.contains(document.activeElement)) canvas.focus({ preventScroll: true });
        if (t) setTimeout(() => t.resolve(choice), 0);
    }

    // A one-line status in the speech box (used while fishing)
    function status(text) {
        dialogName.hidden = true;
        showFace(false);
        dialogText.textContent = text;
        live.textContent = text;
        dialogEl.hidden = false;
        dialogEl.classList.remove('is-waiting');
        root.classList.add('is-talking');
    }

    function clearStatus() {
        if (talk) return;
        dialogEl.hidden = true;
        root.classList.remove('is-talking');
    }

    $('.dialog-box').addEventListener('click', () => {
        if (fishing) fishAction();
        else advance();
    });

    /* ======================================================================
       Panels, toasts, and the fish card
       ====================================================================== */

    const backdrop = $('.backdrop');
    let panel = null;

    function openPanel(name) {
        return new Promise((resolve) => {
            if (panel) closePanel();
            const el = document.getElementById('panel-' + name);
            if (!el) {
                resolve();
                return;
            }
            if (name === 'journal') renderJournal();
            panel = { el, resolve, returnFocus: document.activeElement };
            held.length = 0;
            path = null;
            backdrop.hidden = false;
            el.hidden = false;
            root.classList.add('is-talking');
            requestAnimationFrame(() => {
                backdrop.classList.add('is-open');
                el.classList.add('is-open');
            });
            // focus the panel's text (arrow keys scroll it), so an extra Enter left over from the speech box
            // doesn't land on the close button (a yes/no box focuses its safe answer instead)
            const body = el.querySelector('.panel-body');
            body.tabIndex = -1;
            (el.querySelector('[data-autofocus]') || body).focus({ preventScroll: true });
        });
    }

    function closePanel() {
        if (!panel) return;
        const { el, resolve, returnFocus } = panel;
        panel = null;
        el.classList.remove('is-open');
        backdrop.classList.remove('is-open');
        if (!talk) root.classList.remove('is-talking');
        setTimeout(() => {
            if (!panel) backdrop.hidden = true;
            if (!el.classList.contains('is-open')) el.hidden = true;
        }, 250);
        if (returnFocus && returnFocus.focus && returnFocus !== document.body && !returnFocus.closest('.title-screen')) returnFocus.focus({ preventScroll: true });
        else canvas.focus({ preventScroll: true });
        resolve();
    }

    $$('.panel-close').forEach((b) => b.addEventListener('click', () => closePanel()));
    backdrop.addEventListener('click', () => closePanel());

    document.addEventListener('click', (e) => {
        const opener = e.target.closest('[data-open]');
        if (!opener) return;
        e.preventDefault();
        closeMenu();
        openPanel(opener.dataset.open);
    });

    const toastEl = $('.toast');
    const toastQueue = [];
    let toastBusy = false;
    function toast(text, kind = '') {
        toastQueue.push([text, kind]);
        if (!toastBusy) nextToast();
    }
    function nextToast() {
        const item = toastQueue.shift();
        if (!item) {
            toastBusy = false;
            return;
        }
        toastBusy = true;
        const [text, kind] = item;
        toastEl.textContent = text;
        toastEl.dataset.kind = kind;
        toastEl.hidden = false;
        requestAnimationFrame(() => toastEl.classList.add('is-shown'));
        setTimeout(() => {
            toastEl.classList.remove('is-shown');
            setTimeout(() => {
                toastEl.hidden = true;
                nextToast();
            }, 300);
        }, 3200);
    }

    const fishCard = $('.fishcard');
    function showFishCard(entry) {
        const cv = fishCard.querySelector('canvas');
        const img = art.fish[entry.kind];
        const scale = Math.floor(96 / img.width) || 3;
        cv.width = img.width * scale;
        cv.height = img.height * scale;
        const c2 = cv.getContext('2d');
        c2.imageSmoothingEnabled = false;
        c2.drawImage(img, 0, 0, cv.width, cv.height);
        fishCard.querySelector('strong').textContent = entry.name;
        fishCard.querySelector('span').textContent = `${entry.len} in · ${entry.spot} · ${entry.time} · ${entry.sky}`;
        fishCard.hidden = false;
        requestAnimationFrame(() => fishCard.classList.add('is-shown'));
    }
    function hideFishCard() {
        fishCard.classList.remove('is-shown');
        setTimeout(() => { fishCard.hidden = true; }, 250);
    }

    /* ======================================================================
       The fishing report board: live water numbers, worked out the same way /cheat and /river do
       ====================================================================== */

    const reportPanel = $('#panel-report');
    const reportOut = reportPanel.querySelector('.report-out');
    const reportBtns = [...reportPanel.querySelectorAll('[data-river]')];
    const reportCache = {};
    const CHEAT_HIGH = 5000; // cfs: above this Cheat Lake is high and murky
    const OHIO_HIGH = 1000; // m³/s: above this the Ohio is ripping
    let reportLoader = null; // the little bobber animation while a report loads
    let reportToken = 0;

    const pad2 = (n) => String(n).padStart(2, '0');
    const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const hourKey = (d) => `${isoDate(d)}T${pad2(d.getHours())}:00`;
    const fmtNum = (n) => Math.round(n).toLocaleString('en-US');
    const pctText = (pct, vs) => (pct == null || !isFinite(pct) ? '' : `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% vs ${vs}`);

    async function fetchJSON(url) {
        const ctl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = setTimeout(() => { if (ctl) ctl.abort(); }, 15000);
        try {
            const r = await fetch(url, ctl ? { signal: ctl.signal } : {});
            if (!r.ok) throw Object.assign(new Error(`the server said ${r.status}`), { status: r.status });
            return await r.json();
        } finally {
            clearTimeout(timer);
        }
    }

    // The gauges hiccup now and then (a 503 here and there), so try once more before giving up
    async function getJSON(url) {
        try {
            return await fetchJSON(url);
        } catch (e) {
            if (e.name === 'AbortError' || (e.status && e.status < 500)) throw e;
            await new Promise((r) => setTimeout(r, 1500));
            return fetchJSON(url);
        }
    }

    // Cheat Lake: the latest hourly Albright + Big Sandy discharge (the lake's inflow),
    // and how it compares with the readings nearest to 24 hours earlier
    async function cheatReport() {
        const data = await getJSON('https://waterservices.usgs.gov/nwis/iv/?format=json&sites=03070260,03070500'
            + '&parameterCd=00060&period=P3D&siteStatus=all');
        const pts = {};
        for (const ts of (data.value && data.value.timeSeries) || []) {
            const list = [];
            for (const v of ts.values[0].value) {
                const x = parseFloat(v.value);
                if (!isNaN(x) && x > -999) list.push([new Date(v.dateTime), x]);
            }
            pts[ts.sourceInfo.siteCode[0].value] = list.sort((a, b) => a[0] - b[0]);
        }
        const alb = pts['03070260'] || [];
        const bs = pts['03070500'] || [];
        if (!alb.length) throw new Error('the lake gauge had no reading');
        const hourly = (list) => {
            const buckets = new Map();
            for (const [t, v] of list) {
                const k = hourKey(t);
                if (!buckets.has(k)) buckets.set(k, []);
                buckets.get(k).push(v);
            }
            return new Map([...buckets.keys()].sort().map((k) => [k, buckets.get(k).reduce((a, b) => a + b, 0) / buckets.get(k).length]));
        };
        const albH = hourly(alb);
        const bsH = hourly(bs);
        let lastBS = bsH.size ? bsH.values().next().value : null;
        let cfs = null;
        for (const [k, v] of albH) {
            if (bsH.has(k)) lastBS = bsH.get(k);
            cfs = v + (lastBS ?? 0);
        }
        const dayAgo = (list) => {
            if (!list.length) return null;
            const target = Date.now() - 24 * 3600e3;
            let best = list[0];
            for (const p of list) if (Math.abs(p[0] - target) < Math.abs(best[0] - target)) best = p;
            return best[1];
        };
        const albAgo = dayAgo(alb);
        const base = albAgo == null ? null : albAgo + (dayAgo(bs) ?? 0);
        if (cfs == null || !isFinite(cfs)) throw new Error('the reading was blank');
        return { river: 'cheat', cfs, pct: base ? ((cfs - base) / base) * 100 : null, at: alb[alb.length - 1][0] };
    }

    // The Ohio: the river model's median discharge for today where I fish, with the week before and after
    async function ohioReport() {
        const d = (await getJSON('https://flood-api.open-meteo.com/v1/flood?latitude=40.464&longitude=-80.601'
            + '&daily=river_discharge,river_discharge_median&past_days=7&forecast_days=8')).daily;
        if (!d || !d.time) throw new Error('the river model sent nothing back');
        const rows = d.time.map((date, i) => ({ date, q: (d.river_discharge_median && d.river_discharge_median[i]) ?? d.river_discharge[i] }));
        const today = rows.findIndex((r) => r.date === isoDate(new Date()));
        if (today < 0 || rows[today].q == null) throw new Error("there's no number for today yet");
        const prev = today > 0 ? rows[today - 1].q : null;
        return { river: 'ohio', q: rows[today].q, pct: prev ? ((rows[today].q - prev) / prev) * 100 : null, rows, today };
    }

    function drawFaceOn(cv) {
        const g = cv.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.drawImage(art.portrait.bryce[0], 0, 0);
    }

    function bryceSays(text) {
        return `<div class="report-say"><canvas width="24" height="24" aria-hidden="true"></canvas><p><strong>Bryce</strong>${text}</p></div>`;
    }

    function renderReport(r) {
        reportLoader = null;
        const cheat = r.river === 'cheat';
        const value = cheat ? r.cfs : r.q;
        const high = value > (cheat ? CHEAT_HIGH : OHIO_HIGH);
        const pct = pctText(r.pct, cheat ? '24 h ago' : 'yesterday');
        const trend = r.pct > 8 ? 'is-up' : r.pct < -8 ? 'is-down' : '';
        const verdict = cheat
            ? (high ? `Over ${fmtNum(CHEAT_HIGH)} cfs, Cheat gets high and murky. Just stick to the pond in town today!`
                : `Under ${fmtNum(CHEAT_HIGH)} cfs. Cheat Lake looks fishable today!`)
            : (high ? `Over ${fmtNum(OHIO_HIGH)} m³/s, the Ohio is flowing fast. Probably not a good idea to fish there today. Stick to the pond in town!`
                : `Under ${fmtNum(OHIO_HIGH)} m³/s. The Ohio looks fishable today!`);
        reportOut.innerHTML = `
            <div class="report-card">
                <p class="report-label">${cheat ? 'Current inflow' : 'Discharge trajectory (m³/s)'}</p>
                ${cheat ? '' : '<canvas class="report-chart" role="img" aria-label="River discharge for the past week and the week ahead"></canvas>'
                    + `<p class="report-src">Past week, today, next week. Red line: ${fmtNum(OHIO_HIGH)} m³/s.</p>`}
                <p class="report-num">${fmtNum(value)}<small>${cheat ? 'cfs' : 'm³/s today'}</small></p>
                ${pct ? `<p class="report-delta ${trend}">${pct}</p>` : ''}
                <p class="report-src">${cheat ? `USGS gauges · ${r.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'GloFAS river model'}</p>
            </div>
            ${bryceSays(verdict)}`;
        if (!cheat) drawTrajectory(reportOut.querySelector('.report-chart'), r);
        drawFaceOn(reportOut.querySelector('.report-say canvas'));
    }

    function renderReportError(river, err) {
        reportLoader = null;
        const why = err && err.name === 'AbortError' ? 'it took too long' : (err && err.message) || 'something went wrong';
        reportOut.innerHTML = `
            <div class="report-error">
                <p><strong>Couldn't reach the ${river === 'cheat' ? 'lake gauges' : 'river model'}.</strong></p>
                <p class="muted">The numbers didn't load (${why.replace(/[<>&]/g, '')}). The fish will wait.</p>
                <button class="btn box" type="button" data-retry="${river}">Try again</button>
            </div>`;
    }

    async function showReport(river) {
        reportBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.river === river)));
        const token = ++reportToken;
        const cached = reportCache[river];
        if (cached && Date.now() - cached.at < 10 * 60e3) {
            renderReport(cached.data);
            return;
        }
        reportOut.innerHTML = '<div class="report-loading"><canvas width="64" height="24" aria-hidden="true"></canvas>'
            + `<p>Checking the ${river === 'cheat' ? 'lake' : 'river'}<span class="report-dots" aria-hidden="true"></span></p></div>`;
        reportLoader = { cv: reportOut.querySelector('canvas'), t0: clock };
        const started = performance.now();
        let data = null;
        let err = null;
        try {
            data = await (river === 'cheat' ? cheatReport() : ohioReport());
        } catch (e) {
            err = e;
        }
        // give the bobber a moment on screen so a fast answer doesn't just flash
        const hold = 900 - (performance.now() - started);
        if (hold > 0) await new Promise((r) => setTimeout(r, hold));
        if (token !== reportToken) return;
        if (err || !data) {
            renderReportError(river, err);
            return;
        }
        reportCache[river] = { at: Date.now(), data };
        renderReport(data);
    }

    reportBtns.forEach((b) => b.addEventListener('click', () => showReport(b.dataset.river)));
    reportOut.addEventListener('click', (e) => {
        const retry = e.target.closest('[data-retry]');
        if (retry) showReport(retry.dataset.retry);
    });

    function openReport() {
        return openPanel('report');
    }

    // A bobber on the water, and now and then a fish jumps
    function drawReportLoader() {
        if (!reportLoader || !reportLoader.cv.isConnected) return;
        const g = reportLoader.cv.getContext('2d');
        const t = clock - reportLoader.t0;
        g.fillStyle = '#dcefff';
        g.fillRect(0, 0, 64, 24);
        g.fillStyle = '#4a86d0';
        g.fillRect(0, 13, 64, 11);
        g.fillStyle = '#9cc6f2';
        for (let x = 0; x < 64; x += 8) g.fillRect((x + Math.floor(t * 6)) % 64, 15 + ((x / 8) % 2) * 4, 3, 1);
        // line and bobber
        const by = 12 + Math.round(Math.sin(t * 3.2));
        g.fillStyle = 'rgba(38, 42, 54, 0.55)';
        for (let i = 0; i < 12; i++) g.fillRect(8 + i * 2, Math.round(2 + (by - 2) * (i / 12) ** 1.6), 1, 1);
        g.fillStyle = '#e05b50';
        g.fillRect(31, by - 2, 3, 2);
        g.fillStyle = '#fbfbf7';
        g.fillRect(31, by, 3, 1);
        // a fish hops every few seconds
        const hop = (t % 2.6) / 0.7;
        if (hop < 1) {
            const fx = 44 + hop * 12;
            const fy = 14 - Math.sin(hop * Math.PI) * 8;
            g.fillStyle = '#6c8f6a';
            g.fillRect(Math.round(fx), Math.round(fy), 4, 2);
            g.fillRect(Math.round(fx) + 4, Math.round(fy) - 1, 1, 4);
        }
    }

    // A little bar chart: the past week, today, and the week ahead, with the "too fast" line
    function drawTrajectory(cv, r) {
        const d = Math.min(window.devicePixelRatio || 1, 3);
        const w = cv.clientWidth || 300;
        const h = cv.clientHeight || 84;
        cv.width = Math.round(w * d);
        cv.height = Math.round(h * d);
        const g = cv.getContext('2d');
        const u = Math.max(1, Math.round(2 * d)); // one "pixel" of pixel art
        const vals = r.rows.map((row) => row.q).filter((q) => q != null);
        const top = Math.max(OHIO_HIGH * 1.25, ...vals) * 1.08;
        const n = r.rows.length;
        const gap = u;
        const bw = Math.floor((cv.width - gap * (n - 1)) / n);
        const base = cv.height - 6 * u;
        const y = (q) => Math.round(base - (q / top) * (base - u));
        r.rows.forEach((row, i) => {
            if (row.q == null) return;
            const x = i * (bw + gap);
            const past = i < r.today;
            g.fillStyle = i === r.today ? '#2753d6' : past ? '#7ea0e6' : '#c3d4f5';
            g.fillRect(x, y(row.q), bw, base - y(row.q));
            if (i === r.today) {
                g.fillStyle = '#262a36';
                g.fillRect(x, base + u, bw, 2 * u);
            }
        });
        // the line where the Ohio gets too fast to fish
        g.fillStyle = '#e05b50';
        const ly = y(OHIO_HIGH);
        for (let x = 0; x < cv.width; x += 4 * u) g.fillRect(x, ly, 2 * u, u);
        g.fillStyle = '#262a36';
        g.fillRect(0, base, cv.width, u);
    }

    /* ======================================================================
       Restart: wipe the quests and start the visit over
       ====================================================================== */

    let restarting = false;
    $('[data-restart]').addEventListener('click', async () => {
        restarting = true;
        try {
            localStorage.removeItem(QUEST_KEY);
            sessionStorage.removeItem(STATE_KEY);
        } catch (e) { /* storage unavailable */ }
        setMode('game');
        try {
            sessionStorage.setItem('bk-restart', '1');
        } catch (e) { /* storage unavailable */ }
        closePanel();
        busy = true;
        leaving = true;
        await fadeTo(1, 0.3);
        window.location.reload();
    });
    $('[data-cancel]').addEventListener('click', () => closePanel());

    /* ======================================================================
       Quests and the journal
       ====================================================================== */

    const SPECIES = {
        bluegill: { name: 'Bluegill', min: 5, max: 9 },
        perch: { name: 'Yellow Perch', min: 6, max: 11 },
        largemouth: { name: 'Largemouth Bass', min: 10, max: 21 },
        smallmouth: { name: 'Smallmouth Bass', min: 9, max: 18 },
        trout: { name: 'Rainbow Trout', min: 9, max: 17 },
        crappie: { name: 'Crappie', min: 7, max: 13 },
        walleye: { name: 'Walleye', min: 14, max: 25 },
        musky: { name: 'Musky', min: 30, max: 45 },
    };
    // What bites depends on what's tied on: the old rod only gets panfish; the spinner gets the rest,
    // plus a 1 in 50 shot at a musky.
    const ROD_BITES = { bluegill: 60, perch: 40 };
    const SPINNER_BITES = { bluegill: 16, perch: 14, largemouth: 16, smallmouth: 15, trout: 13, crappie: 15, walleye: 11 };
    const MUSKY_ODDS = 1 / 50;
    const BIG_FISH = ['largemouth', 'smallmouth', 'trout', 'crappie', 'walleye'];
    const caught = (kind) => !!Q.kinds[kind];
    const bigCaught = () => BIG_FISH.filter(caught).length;

    function rollFish() {
        if (Q.lure && Math.random() < MUSKY_ODDS) return 'musky';
        const table = Q.lure ? SPINNER_BITES : ROD_BITES;
        const total = Object.values(table).reduce((sum, w) => sum + w, 0);
        let roll = Math.random() * total;
        return Object.keys(table).find((k) => (roll -= table[k]) < 0) || 'bluegill';
    }

    const fishKinds = () => Object.keys(Q.kinds).length;
    const csvFound = () => Object.keys(Q.csv).length;

    function quests() {
        const panfish = ['bluegill', 'perch'].filter(caught).length;
        const big = bigCaught();
        const found = csvFound();
        const tourCount = ['house', 'lab', 'post'].filter((k) => Q.tour[k]).length;
        const nextTour = !Q.tour.house ? "Read the story board in Bryce's House"
            : !Q.tour.lab ? 'Check the trading desk and fish dashboard in the Lab'
                : 'Talk to the mailman at the Post Office';
        return [
            { id: 'tour', title: 'Explore town', done: Q.tourDone, detail: Q.tourDone ? 'You saw everything!' : `${nextTour} (${tourCount}/3)` },
            {
                id: 'fish', title: "Gone fishin'", done: Q.lure,
                detail: Q.lure ? 'You traded up for a SPINNER.' : !Q.rod ? 'Talk to the fisherman on the dock'
                    : panfish >= 2 ? 'Bring your bluegill and perch to the fisherman' : `Catch a bluegill and a perch (${panfish}/2)`,
            },
            Q.lure && {
                id: 'big', title: 'Bigger fish', done: Q.bigDone,
                detail: Q.bigDone ? 'The fisherman is impressed.' : big >= BIG_FISH.length ? 'Show the fisherman your catch'
                    : `Catch ${BIG_FISH.length} new species with the spinner (${big}/${BIG_FISH.length})`,
            },
            Q.lure && {
                id: 'musky', title: 'The fish of 10,000 casts', done: Q.muskyDone,
                detail: Q.muskyDone ? 'A legend!' : caught('musky') ? 'Show the fisherman your musky!' : 'Catch a musky',
            },
            {
                id: 'csv', title: 'Lost files', done: Q.csvDone,
                detail: Q.csvDone ? 'The pipeline runs again.' : !Q.csvQuest ? 'A hooded stranger waits south of the plaza'
                    : found >= 3 ? 'Bring the files to the stranger' : `Find 3 lost CSV files (${found}/3)`,
            },
            {
                id: 'letter', title: 'Special delivery', done: Q.letter === 'delivered',
                detail: Q.letter === 'delivered' ? 'Delivered!' : Q.letter === 'carrying' ? 'Bring the letter to Bryce' : 'The mailman needs a hand',
            },
        ].filter(Boolean);
    }

    const trackerList = $('.tracker-list');
    const trackerCount = $('.tracker-count');
    function updateTracker() {
        const list = quests();
        trackerCount.textContent = `${list.filter((q) => q.done).length}/${list.length}`;
        trackerList.innerHTML = '';
        for (const q of list) {
            const li = document.createElement('li');
            li.className = q.done ? 'is-done' : '';
            li.innerHTML = '<strong></strong><span></span>';
            li.querySelector('strong').textContent = q.title;
            li.querySelector('span').textContent = q.detail;
            trackerList.appendChild(li);
        }
    }

    function renderJournal() {
        const qEl = $('.journal-quests');
        qEl.innerHTML = '';
        for (const q of quests()) {
            const li = document.createElement('li');
            li.className = q.done ? 'is-done' : '';
            li.innerHTML = '<strong></strong><span></span>';
            li.querySelector('strong').textContent = (q.done ? '✔ ' : '') + q.title;
            li.querySelector('span').textContent = q.detail;
            qEl.appendChild(li);
        }
        const fEl = $('.journal-fish');
        if (!Q.fish.length) {
            fEl.innerHTML = '<p class="muted">Nothing yet. Borrow a rod from the fisherman on the dock.</p>';
            return;
        }
        const rows = Q.fish.slice().reverse().map((f) => `<tr><td>${f.name}</td><td>${f.len} in</td><td>${f.spot}</td><td>${f.time}</td><td>${f.sky}</td></tr>`).join('');
        fEl.innerHTML = `<table><thead><tr><th>Species</th><th>Length</th><th>Spot</th><th>Time</th><th>Sky</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    function markSeen(id) {
        if (Q.seen[id]) return;
        Q.seen[id] = true;
        if (id === 'storyBoard') Q.tour.house = true;
        if (Q.seen.tradingDesk && Q.seen.dashboard) Q.tour.lab = true;
        if (id === 'mailman') Q.tour.post = true;
        checkTour();
        saveQuests();
        updateTracker();
    }

    function checkTour() {
        if (!Q.tourDone && Q.tour.house && Q.tour.lab && Q.tour.post) {
            Q.tourDone = true;
            toast('Quest complete: Explore town!', 'win');
        }
    }

    function questDone(title) {
        toast(`Quest complete: ${title}!`, 'win');
        saveQuests();
        updateTracker();
    }

    const tracker = $('.tracker');
    const trackerHead = $('.tracker-head');
    let trackerWanted = !touch && window.innerWidth > 700;
    function setTrackerOpen(open) {
        tracker.classList.toggle('is-collapsed', !open);
        trackerHead.setAttribute('aria-expanded', String(open));
    }
    setTrackerOpen(trackerWanted);
    trackerHead.addEventListener('click', () => {
        trackerWanted = tracker.classList.contains('is-collapsed');
        setTrackerOpen(trackerWanted);
    });
    updateTracker();

    /* ======================================================================
       Getting between places
       ====================================================================== */

    let busy = false;
    let leaving = false;

    function save() {
        writeJSON('sessionStorage', STATE_KEY, {
            intro: true,
            scene: scene.id,
            player: [player.x, player.y, player.dir],
            bryce: [bryce.x, bryce.y, bryce.dir],
            night: nightOverride,
        });
    }

    async function go(url) {
        busy = true;
        leaving = true;
        path = null;
        if (/site\.html/.test(url)) setMode('site');
        save();
        await fadeTo(1, 0.3);
        window.location.href = url;
    }

    function switchScene(s, x, y, dir) {
        const from = player.scene;
        from.actors.splice(from.actors.indexOf(player), 1);
        scene = s;
        player.scene = s;
        s.actors.push(player);
        player.place(x, y, dir);
        walkTarget = null;
        path = null;
        pending = null;
        computeScale();
        updateCamera();
        root.dataset.scene = s.id;
        // indoors, tuck the quest list away so it doesn't cover the room
        setTrackerOpen(s.kind === 'room' ? false : trackerWanted);
    }

    async function enterBuilding(id) {
        const b = buildings[id];
        const room = scenes[id];
        busy = true;
        path = null;
        player.dir = 'up';
        b.open = true;
        await wait(0.16);
        await new Promise((resolve) => {
            player.startMove(b.door.x, b.door.y, 0.24, true);
            player.move.resolve = resolve;
        });
        await tween(1, 0, 0.12, (v) => { player.alpha = v; });
        await fadeTo(1, 0.25);
        b.open = false;
        switchScene(room, room.mat[0], room.mat[1], 'up');
        player.alpha = 1;
        await fadeTo(0, 0.3);
        showBanner(room.label);
        if (!Q.seen['enter:' + id]) {
            Q.seen['enter:' + id] = true;
            saveQuests();
            toast(room.hint, 'tip');
        }
        busy = false;
        save();
    }

    async function exitRoom() {
        const b = buildings[scene.id];
        busy = true;
        path = null;
        await fadeTo(1, 0.25);
        b.open = true;
        switchScene(town, b.door.x, b.door.y + 1, 'down');
        await fadeTo(0, 0.3);
        await wait(0.12);
        b.open = false;
        busy = false;
        save();
    }

    /* ======================================================================
       Fishing
       ====================================================================== */

    const skyLabel = () => (nightLevel > 0.5 ? 'Clear night' : duskLevel > 0.3 ? 'Sunset' : 'Sunny');

    function goFishing(tx, ty) {
        busy = true;
        path = null;
        pending = null;
        fishing = { tx, ty, t: 0, phase: 'wait', biteAt: 1.6 + Math.random() * 2.6, window: touch ? 1.25 : 0.95 };
        status(touch ? 'You cast your line... (tap when you get a bite)' : 'You cast your line... (press Enter when you get a bite)');
        return new Promise((resolve) => { fishing.resolve = resolve; }).then(async (result) => {
            const spot = town.get(player.x, player.y) === '#' ? 'The dock' : 'Pond shore';
            fishing = null;
            clearStatus();
            if (result === 'early') await say('Too soon! The fish swam off.');
            else if (result === 'missed') await say('It got away...');
            else if (result === 'caught') await landFish(spot);
            busy = false;
        });
    }

    function finishFishing(result) {
        if (!fishing || fishing.done) return;
        fishing.done = true;
        fishing.resolve(result);
    }

    function fishAction() {
        if (!fishing) return;
        if (fishing.phase === 'wait') finishFishing('early');
        else if (fishing.phase === 'bite') finishFishing('caught');
    }

    function updateFishing(dt) {
        if (!fishing || fishing.done) return;
        fishing.t += dt;
        if (fishing.phase === 'wait' && fishing.t >= fishing.biteAt) {
            fishing.phase = 'bite';
            fishing.biteEnd = fishing.t + fishing.window;
            player.emote = fishing.window;
            status(touch ? 'Oh! A bite! Tap now!' : 'Oh! A bite! Press Enter!');
        } else if (fishing.phase === 'bite' && fishing.t > fishing.biteEnd) {
            finishFishing('missed');
        }
    }

    async function landFish(spot) {
        const kind = rollFish();
        const sp = SPECIES[kind];
        const len = Math.round((sp.min + Math.random() * (sp.max - sp.min)) * 2) / 2;
        const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const first = !Q.fish.length;
        const isNew = !caught(kind);
        const entry = { kind, name: sp.name, len, spot, time, sky: skyLabel() };
        Q.kinds[kind] = true;
        Q.fish.push(entry);
        if (Q.fish.length > 40) Q.fish.shift();
        saveQuests();
        updateTracker();
        showFishCard(entry);
        await say([
            kind === 'musky' ? `WHOA! You caught a MUSKY! ${len} inches!` : `You caught a ${sp.name.toUpperCase()}! ${len} inches.`,
            first ? B("It's in your journal now, with the spot, the time, and the sky. That's how I log my catches too.")
                : isNew ? 'A new species for your journal!' : 'Logged in your journal.',
        ]);
        hideFishCard();
        if (!Q.lure && caught('bluegill') && caught('perch') && isNew) toast('A bluegill and a perch! Bring them to the fisherman.', 'tip');
        if (Q.lure && !Q.bigDone && isNew && bigCaught() >= BIG_FISH.length) toast('All five! Go show the fisherman.', 'tip');
        if (kind === 'musky' && isNew) toast('A MUSKY! Go show the fisherman!', 'win');
    }

    /* ======================================================================
       What happens when you check things
       ====================================================================== */

    const counters = {};
    const lineOf = (arr, key) => {
        counters[key] = (counters[key] || 0) + 1;
        return arr[(counters[key] - 1) % arr.length];
    };
    let lastBryce = -1;
    const randomLine = (arr) => {
        let i = (Math.random() * arr.length) | 0;
        if (i === lastBryce) i = (i + 1) % arr.length;
        lastBryce = i;
        return arr[i];
    };

    const BRYCE_LINES = [
        ["I'm a Data Solutions Specialist at Maxim Crane Works. It's a lot of Power BI and cloud data these days."],
        ['Before Maxim, I was a BI Developer at Halliburton. I built automated pipelines with Alteryx on SAP ECC and S/4.'],
        ['I changed my major twice at WVU before landing on Management Information Systems. Turns out I love data and automation.'],
        ['My options trading algorithm pulls live quotes from the Robinhood API. When it spots a pricing inefficiency, it places a limit order by itself.'],
        ['I backtest every trading strategy before it goes live. Returns are nice, but I watch the max drawdown.'],
        ['Every fish I catch goes into a SQL Server database, along with the weather and water level at that moment.'],
        ['I built an AI fishing report that scrapes USGS and NWS data and has a local LLM write it up for each spot.'],
        ['I grew up in Canonsburg, PA. Played baseball at Canon-McMillan and worked at TopGolf.'],
        ['Most weekends at WVU, I was out hiking and fishing in the mountains.'],
        ['I spent the summer of 2023 interning at Halliburton in Houston. I helped roll out SAP Concur for travel and expenses.'],
        ["ALTO Research is the next big project. It's locked in the Trading Post until it's ready."],
        [touch ? 'Want the regular website? Site Mode is in the menu up top.' : 'Want the regular website? Hit Site Mode in the corner.'],
        ['If you want to reach me, the Post Office has everything. Or email kunschickbryce@gmail.com.'],
    ];

    const EVENTS = {
        house: () => enterBuilding('house'),
        lab: () => enterBuilding('lab'),
        post: () => enterBuilding('post'),

        trading: async () => {
            const c = await say([
                'The door is locked. A note is taped to it.',
                '"ALTO RESEARCH. Advanced algorithmic research. Opening soon."',
                B("ALTO is my next big project. It isn't ready yet, so the door stays locked for now."),
            ], { choices: ['Read about ALTO', 'Leave it'] });
            if (c === 0) await go('alto.html');
        },

        signHouse: () => say(["BRYCE'S HOUSE", B('My story starts here: Canonsburg, WVU, Halliburton, and now Maxim Crane Works.')]),
        signLab: () => say(['PROJECT LAB', B("Trading algorithms, fishing data, and everything else I've built.")]),
        signPost: () => say(['POST OFFICE', B('The quickest way to reach me.')]),
        signTrading: () => say('TRADING POST\nHome of ALTO Research. Opening soon.'),
        signDock: async () => {
            const c = await say(['FISHING DOCK', B('I log every fish I catch, along with the water level and weather that went with it.')],
                { choices: ['Open the Fishing Dashboard', 'Not now'] });
            if (c === 0) await go('fishing-dashboard.html');
        },
        report: () => openReport(),
        townSign: () => say('WELCOME TO BRYCEKUNSCHICK.COM\nPopulation: Bryce, a few locals, and you.'),
        routeSign: () => say('ROUTE 79 SOUTH\nMorgantown, WV'),
        mailbox: async () => {
            const c = await say(['A mailbox. The little red flag is up.', B('Want to send me a letter? Email works best: kunschickbryce@gmail.com.')],
                { choices: ['Write an email', 'Close'] });
            if (c === 0) window.location.href = 'mailto:kunschickbryce@gmail.com';
        },
        chalkboard: () => say(['A price chart, drawn in chalk. Almost every candle is green.', B('My trading desk is over in the Project Lab.')]),
        board: () => say([
            'TOWN BOARD',
            B("Here's what I'm focused on these days."),
            B('DATA AUTOMATION\nI build automated workflows that connect APIs, databases, and analytics tools.'),
            B('ALGORITHMIC TRADING\nI build automated trading strategies based on quantitative research.'),
            B('FISHING ANALYTICS\nI track water levels, weather, and my catch logs, all in one place.'),
            'A note is pinned at the bottom: "HELP WANTED. The fisherman, the mailman, and a hooded stranger could all use a hand."',
        ]),
        water: async (tile) => {
            if (Q.rod && Array.isArray(tile)) return goFishing(tile[0], tile[1]);
            return say(lineOf(["The water is calm and clear. You'd need a rod to fish.", 'Something swirled under the surface. The fisherman on the dock has a spare rod.'], 'water'));
        },

        bryce: async () => {
            if (Q.letter === 'carrying') {
                await say([
                    'A letter for me? Thanks!',
                    'Let\'s see... "Dear Bryce, what\'s the best way to get in touch?"',
                    "Easy: email kunschickbryce@gmail.com, or find me on LinkedIn. I'd love to hear from you.",
                ], { name: 'Bryce' });
                Q.letter = 'delivered';
                questDone('Special delivery');
                return;
            }
            await say(randomLine(BRYCE_LINES), { name: 'Bryce' });
        },

        stranger: async () => {
            const found = csvFound();
            const left = missingFiles().map((p) => p.where);
            if (!Q.csvQuest && found < 3) {
                await say([
                    '...',
                    "I'm just passing through. But I noticed something.",
                    'Three CSV files fell out of a data pipeline and scattered around town.',
                    found === 0 ? `One's ${left[0]}. One's ${left[1]}. And one... ended up ${left[2]}.`
                        : found === 1 ? `Looks like you already have one. The other two are ${listOf(left)}.`
                            : `Looks like you already have two. The last one is ${left[0]}.`,
                    'Find all three for me. I have my reasons.',
                ], { name: 'Stranger' });
                Q.csvQuest = true;
                saveQuests();
                updateTracker();
                toast('New quest: Lost files', 'tip');
                return;
            }
            if (found >= 3 && !Q.csvDone) {
                await say([
                    Q.csvQuest ? 'All three. Nice work.' : "Those CSV files... you found all three? I've been looking for those.",
                    "I'll make sure these get back where they belong.",
                    B('Hey, those are my pipeline files! Thanks for tracking them down.'),
                    B('I build automated pipelines that pull data from APIs and databases, so reports update themselves. No copying and pasting spreadsheets.'),
                ], { name: 'Stranger' });
                Q.csvQuest = true;
                Q.csvDone = true;
                questDone('Lost files');
                return;
            }
            if (!Q.csvDone) {
                await say(`You've found ${found} of 3. Look ${listOf(left)}.`, { name: 'Stranger' });
                return;
            }
            await say(lineOf([
                "Whatever ALTO is, it isn't ready yet. The Trading Post is still locked tight.",
                "I've been to a lot of towns. Not many have a fish database.",
                'You never saw me.',
            ], 'stranger'), { name: 'Stranger' });
        },

        fisher: async () => {
            const name = { name: 'Fisherman' };
            if (!Q.rod) {
                await say([
                    'Nice day for it. You fish?',
                    'Here, borrow my OLD ROD. Mind you, it only catches bluegill and perch.',
                ], name);
                Q.rod = true;
                saveQuests();
                updateTracker();
                toast('You got an OLD ROD!', 'win');
                await say([
                    touch
                        ? 'Tap the water to cast. When you get a bite, tap fast!'
                        : 'Face the water and press Enter (or click the water) to cast. When you get a bite, press Enter fast!',
                    "Bring me a bluegill and a perch, and I'll trade you something better.",
                ], name);
                return;
            }
            if (!Q.lure) {
                if (!caught('bluegill') || !caught('perch')) {
                    const need = ['bluegill', 'perch'].filter((k) => !caught(k)).map((k) => 'a ' + SPECIES[k].name.toLowerCase());
                    await say(`Bring me a bluegill and a perch, and the lure's yours. You still need ${listOf(need)}.`, name);
                    return;
                }
                await say([
                    "A bluegill and a perch! Fine fish. I'll take 'em.",
                    "Here's my lucky SPINNER. Bass, trout, crappie, and walleye can't resist it.",
                ], name);
                Q.lure = true;
                questDone("Gone fishin'");
                toast('You got a SPINNER!', 'win');
                await say([
                    'Catch a largemouth, a smallmouth, a trout, a crappie, and a walleye, then come show me.',
                    "And if you're patient... there's a musky in that pond. The fish of ten thousand casts.",
                ], name);
                toast('New quests: Bigger fish, and the fish of 10,000 casts', 'tip');
                return;
            }
            if (bigCaught() >= BIG_FISH.length && !Q.bigDone) {
                const c = await say([
                    "Largemouth, smallmouth, trout, crappie, AND walleye? Now you're fishing like Bryce.",
                    B('Every fish I catch goes into my database: species, length, the spot, the time, the weather, and the water level.'),
                    B('Then I turn it into a report. Want to see it?'),
                ], { name: 'Fisherman', choices: ['Open the Fishing Dashboard', 'Maybe later'] });
                Q.bigDone = true;
                questDone('Bigger fish');
                if (c === 0) await go('fishing-dashboard.html');
                return;
            }
            if (caught('musky') && !Q.muskyDone) {
                await say([
                    'Is that... a MUSKY?!',
                    "Forty years on this dock and I've never landed one. You're a legend.",
                    B("Okay, that's impressive. Most people fish for years before they land a musky."),
                ], name);
                Q.muskyDone = true;
                questDone('The fish of 10,000 casts');
                return;
            }
            const n = fishKinds();
            const c = await say(lineOf([
                [`Caught ${n} kinds so far. That spinner gets the big ones biting.`],
                [Q.muskyDone ? "Still can't believe you landed that musky." : 'The musky is the fish of ten thousand casts. Keep at it.'],
                ['Back in my day we just looked at the sky.', B('These days I check the gauges. The fishing report board by the pond has the live numbers.')],
            ], 'fisher').concat(B("Want to see every fish I've caught? My Fishing Dashboard has them all.")), { name: 'Fisherman', choices: ['Open the Fishing Dashboard', 'Keep fishing'] });
            if (c === 0) await go('fishing-dashboard.html');
        },

        // House
        storyBoard: async () => {
            await say(['A board covered in photos and notes.', B("That's my story, start to finish. Take a look!")]);
            await openPanel('about');
        },
        fishMount: () => say(['A mounted bass.', B("Don't worry, that one's logged in my database.")]),
        pennant: () => say(['A West Virginia University pennant.', B('I graduated from WVU in 2024 with a degree in Management Information Systems.')]),
        diploma: () => say(['A framed diploma.', B('Management Information Systems, with minors in Finance and Data Analytics.')]),
        bookshelf: () => say('Finance books, a SQL reference, and a stack of fishing magazines.'),
        bed: () => say('A neatly made bed. Mostly.'),
        laptop: () => say('The laptop is open to a Power BI report. Of course it is.'),
        houseTable: () => say('A mug of coffee, still warm.'),

        // Lab
        assistant: async () => {
            const c = await say(lineOf([
                [
                    'Welcome to the Project Lab! Every station in here is a different project.',
                    'The trading desk is on the left. The fishing servers and dashboard are on the right. The AI station is in the middle.',
                    touch ? 'Tap anything with a marker over it to learn more.' : 'Walk up to anything with a marker over it and press Enter.',
                ],
                ['Want the whole list at once? I keep a copy of every project.'],
            ], 'assistant'), { name: 'Lab Assistant', choices: ['See all projects', 'Thanks!'] });
            if (c === 0) await openPanel('projects');
        },
        tradingDesk: async () => {
            const c = await say([
                'TRADING DESK\nThree monitors. All candlestick charts.',
                B('This is where my trading algorithms live.'),
                B('OPTIONS TRADING ALGORITHM (July 2024 to now)\nIt pulls live options quotes from the Robinhood API and looks for pricing inefficiencies.'),
                B('When a trade fits my hypothesis, the algorithm places a limit order through the API automatically.'),
                B('EQUITIES TRADING ALGORITHMS (September 2024 to now)\nLow-frequency strategies. I backtest them for returns and max drawdowns, then deploy them to trade on their own.'),
            ], { choices: ['View the options algo on GitHub', 'See all projects', 'Close'] });
            if (c === 0) window.open('https://github.com/brycekunschick/OptionsAlgo', '_blank', 'noopener');
            if (c === 1) await go('my-projects.html');
        },
        ticker: () => say('The ticker board scrolls through quotes. The trading desk below it is where the algorithms live.'),
        whiteboard: () => say('Looks like Bryce is working on something.'),
        coffee: () => say('The coffee machine. Fuel for backtesting.'),
        dashboard: async () => {
            const c = await say([
                'FISHING DASHBOARD',
                B('This is a Power BI report of every fish I catch.'),
                B('Each catch shows the species, where and when I caught it, and the weather and water levels at that moment.'),
            ], { choices: ['Open the Fishing Dashboard', 'Close'] });
            if (c === 0) await go('fishing-dashboard.html');
        },
        servers: async () => {
            const c = await say([
                'SERVER RACK',
                B('My fishing database lives here, in SQL Server.'),
                B('Python scripts load my catches and the weather data into tables. SQL views match every catch to the conditions at that place and time.'),
            ], { choices: ['View the database on GitHub', 'Close'] });
            if (c === 0) window.open('https://github.com/brycekunschick/FishingData', '_blank', 'noopener');
        },
        dbTerminal: () => say('A terminal full of SQL. SELECT * FROM catches... Looks like a good day on the water.'),
        aiStation: async () => {
            const c = await say([
                'AI FISHING REPORT',
                B('I built this in April 2025. It scrapes live data from USGS and the National Weather Service.'),
                B('Then a local LLM (gemma3:4b) writes a fishing report for each spot, based on the real conditions.'),
            ], { choices: ['View it on GitHub', 'Close'] });
            if (c === 0) window.open('https://github.com/brycekunschick/FishingReport', '_blank', 'noopener');
        },

        // Post Office
        mailman: async () => {
            const c = await say([
                'Welcome to the Post Office! Looking to get in touch with Bryce?',
                B('Email is the fastest way to reach me: kunschickbryce@gmail.com.'),
                B("I'm on LinkedIn and GitHub too, or you can leave me a message with the contact form."),
            ], { name: 'Mailman', choices: ['Email Bryce', 'Open LinkedIn', 'Use the contact form', 'Just browsing'] });
            if (c === 0) window.location.href = 'mailto:kunschickbryce@gmail.com';
            if (c === 1) window.open('https://www.linkedin.com/in/brycekunschick/', '_blank', 'noopener');
            if (c === 2) {
                await go('contact.html');
                return;
            }
            if (!Q.letter) {
                await say([
                    'Oh! Before you go. This letter came in for Bryce.',
                    "Could you run it over to him? He's usually out by the fountain.",
                ], { name: 'Mailman' });
                Q.letter = 'carrying';
                saveQuests();
                updateTracker();
                toast('You got a LETTER for Bryce!', 'win');
            } else if (Q.letter === 'carrying') {
                await say('Still got that letter? Bryce is usually by the fountain.', { name: 'Mailman' });
            }
        },
        counter: () => EVENTS.mailman(),
        contactBoard: async () => {
            await say('A board full of ways to say hello.');
            await openPanel('contact');
        },
        packages: () => say('Packages waiting to go out.'),
        scale: () => say('A postal scale. It reads 0.0 oz.'),
        postBench: () => say('A bench for waiting. No line today.'),

        csv: (obj) => pickUpCsv(obj),
        bug: () => say(['A wild BUG appeared!', B('I got this. Unit test, go!'), 'The BUG fled!']),
        exit: async () => {
            await say(['The road to Morgantown, WV.', B('I studied at West Virginia University down this way, 2020 to 2024.'), 'Better stick around town for now.']);
            await player.walk([[player.x, player.y - 1]], 0.22);
            player.dir = 'up';
        },
        leave: () => exitRoom(),
    };

    async function pickUpCsv(obj) {
        if (!obj || Q.csv[obj.csvKey]) return;
        Q.csv[obj.csvKey] = true;
        removeObject(obj);
        saveQuests();
        updateTracker();
        const n = csvFound();
        await say(Q.csvQuest
            ? `You found a lost CSV file! (${n}/3)`
            : `You found a CSV file. Someone must have dropped it. (${n}/3)`);
        if (n >= 3 && !Q.csvDone) {
            toast(Q.csvQuest ? 'All 3 files found! Bring them to the stranger.' : 'Three CSV files... maybe someone in town is looking for these.', 'tip');
        }
    }

    async function runEvent(id, source, extra) {
        const fn = EVENTS[id];
        if (!fn) return;
        busy = true;
        path = null;
        const npc = source instanceof Actor ? source : null;
        const obj = source && !(source instanceof Actor) ? source : null;
        const prevDir = npc && npc.dir;
        if (npc && npc !== mailman) npc.face(player);
        if (id === 'mailman' || id === 'counter') markSeen('mailman');
        if (obj && obj.main) markSeen(obj.id);
        try {
            await fn(extra || obj);
        } finally {
            if (npc === fisher) fisher.dir = prevDir;
            if (!leaving && !fishing) busy = false;
        }
    }

    function objectAhead() {
        const [dx, dy] = DIRS[player.dir];
        const fx = player.x + dx;
        const fy = player.y + dy;
        const npc = scene.actors.find((a) => a !== player && a.visible && a.x === fx && a.y === fy);
        if (npc) return { npc };
        const obj = scene.targetAt.get(fy * scene.w + fx);
        if (obj) return { obj };
        if (scene === town && town.get(fx, fy) === '~') return { water: [fx, fy] };
        return null;
    }

    function interactAhead() {
        const ahead = objectAhead();
        if (!ahead) return;
        if (ahead.npc) runEvent(ahead.npc.id, ahead.npc);
        else if (ahead.obj) runEvent(ahead.obj.id, ahead.obj);
        else if (ahead.water) runEvent('water', null, ahead.water);
    }

    /* ======================================================================
       Getting around
       ====================================================================== */

    const held = [];
    const pressedAt = {};
    let running = false;
    let path = null;
    let pending = null;
    let chained = false;
    let turnUntil = 0;
    let grassSteps = 0;
    let bugSeen = false;

    function findPath(sx, sy, goals) {
        const s = scene;
        const start = sy * s.w + sx;
        if (goals.has(start)) return [];
        const prev = new Int32Array(s.w * s.h).fill(-1);
        const seen = new Uint8Array(s.w * s.h);
        const queue = [start];
        seen[start] = 1;
        for (let qi = 0; qi < queue.length; qi++) {
            const cur = queue[qi];
            const cx = cur % s.w;
            const cy = (cur / s.w) | 0;
            for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
                const ni = ny * s.w + nx;
                if (seen[ni] || !walkable(nx, ny, player)) continue;
                seen[ni] = 1;
                prev[ni] = cur;
                if (goals.has(ni)) {
                    const out = [];
                    for (let p = ni; p !== start; p = prev[p]) out.unshift([p % s.w, (p / s.w) | 0]);
                    return out;
                }
                queue.push(ni);
            }
        }
        return null;
    }

    function aroundTiles(tiles) {
        const out = [];
        for (const [x, y] of tiles) {
            for (const [dx, dy] of Object.values(DIRS)) {
                const nx = x + dx;
                const ny = y + dy;
                if (tiles.some(([tx, ty]) => tx === nx && ty === ny)) continue;
                if (walkable(nx, ny, player) || (nx === player.x && ny === player.y)) out.push([nx, ny]);
            }
        }
        return out;
    }

    function tilesOfObject(obj) {
        const tiles = [];
        for (let y = obj.y; y < obj.y + obj.fh; y++) for (let x = obj.x; x < obj.x + obj.fw; x++) tiles.push([x, y]);
        return tiles;
    }

    function standFor(obj) {
        if (obj.stand) return obj.stand;
        if (obj.item) return [[obj.x, obj.y]];
        if (obj.face === 'up') {
            const out = [];
            for (let x = obj.x; x < obj.x + obj.fw; x++) out.push([x, obj.y + obj.fh]);
            return out;
        }
        return aroundTiles(tilesOfObject(obj));
    }

    function headTo(goalTiles, action) {
        const goals = new Set(goalTiles.map(([x, y]) => y * scene.w + x));
        const route = findPath(player.x, player.y, goals);
        if (!route) return false;
        path = route;
        pending = action;
        const end = route.length ? route[route.length - 1] : [player.x, player.y];
        walkTarget = action ? null : { x: end[0], y: end[1], t: 1 };
        hideHintSoon();
        return true;
    }

    function onArrive() {
        const s = scene;
        if (s === town) {
            const tile = town.get(player.x, player.y);
            if (tile === '"') {
                leaves(player.x, player.y);
                grassSteps++;
                if (!bugSeen && grassSteps > 4 && Math.random() < 0.16) {
                    bugSeen = true;
                    path = null;
                    held.length = 0;
                    runEvent('bug');
                }
            }
            if (player.y >= 34) {
                path = null;
                held.length = 0;
                runEvent('exit');
            }
        } else if (s.mat && player.x === s.mat[0] && player.y === s.mat[1] && player.dir === 'down' && !pending) {
            path = null;
            held.length = 0;
            runEvent('leave');
            return;
        }
        // walking over a dropped file picks it up
        const obj = s.targetAt.get(player.y * s.w + player.x);
        if (obj && obj.item) {
            path = null;
            pending = null;
            held.length = 0;
            runEvent('csv', obj);
        }
        if (walkTarget && player.x === walkTarget.x && player.y === walkTarget.y) walkTarget = null;
    }
    player.onArrive = onArrive;

    function updatePlayer() {
        if (busy || talk || panel || player.move || titleMode) return;
        const dur = running ? 0.13 : 0.22;
        const d = held[held.length - 1];
        if (d) {
            path = null;
            pending = null;
            walkTarget = null;
            if (!chained && player.dir !== d) {
                player.dir = d;
                turnUntil = clock + 0.09;
                return;
            }
            if (clock < turnUntil) return;
            chained = player.step(d, dur);
            if (!chained) {
                const [dx, dy] = DIRS[d];
                const nx = player.x + dx;
                const ny = player.y + dy;
                const obj = scene.targetAt.get(ny * scene.w + nx);
                const b = obj && buildings[obj.id];
                if (scene === town && b && b.door.x === nx && b.door.y === ny) runEvent(b.id, obj);
                else if (scene.mat && d === 'down' && player.x === scene.mat[0] && player.y === scene.mat[1]) runEvent('leave');
            }
            return;
        }
        chained = false;
        if (path && path.length) {
            const [nx, ny] = path[0];
            if (walkable(nx, ny, player)) {
                path.shift();
                player.dir = dirBetween(player.x, player.y, nx, ny);
                player.startMove(nx, ny, dur);
            } else {
                path = null;
                walkTarget = null;
            }
            return;
        }
        if (pending) {
            const p = pending;
            pending = null;
            path = null;
            if (p.faceTiles && p.faceTiles.length) {
                let best = p.faceTiles[0];
                let bd = 1e9;
                for (const t of p.faceTiles) {
                    const d2 = Math.abs(t[0] - player.x) + Math.abs(t[1] - player.y);
                    if (d2 < bd) {
                        bd = d2;
                        best = t;
                    }
                }
                if (bd > 0) player.dir = dirBetween(player.x, player.y, best[0], best[1]);
            }
            runEvent(p.id, p.source, p.extra);
        }
    }

    function updateNPCs(dt) {
        const k = stranger;
        if (busy || talk || panel || k.move || scene !== town) return;
        k.wander = (k.wander ?? 2) - dt;
        if (k.wander > 0) return;
        k.wander = 1.6 + Math.random() * 2.8;
        const options = Object.keys(DIRS).filter((d) => {
            const [dx, dy] = DIRS[d];
            const nx = k.x + dx;
            const ny = k.y + dy;
            const h = k.home;
            return nx >= h.x0 && nx <= h.x1 && ny >= h.y0 && ny <= h.y1 && walkable(nx, ny, k, town)
                && Math.abs(nx - player.x) + Math.abs(ny - player.y) > 1;
        });
        if (Math.random() < 0.35 || !options.length) {
            k.dir = Object.keys(DIRS)[(Math.random() * 4) | 0];
            return;
        }
        k.step(options[(Math.random() * options.length) | 0], 0.32);
    }

    /* ======================================================================
       Input
       ====================================================================== */

    const KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
    const ACTION = new Set(['Enter', 'Space', 'KeyE', 'KeyZ']);
    const typingInto = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const onControl = (el) => el && el !== document.body && el !== canvas && el.closest && el.closest('a, button');

    window.addEventListener('keydown', (e) => {
        if (typingInto(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'Shift') running = true;

        if (titleMode) {
            const d = KEYS[e.code];
            if (d) {
                const btns = $$('.mode');
                const i = btns.indexOf(document.activeElement);
                btns[(i + (d === 'left' || d === 'up' ? -1 : 1) + btns.length) % btns.length].focus();
                e.preventDefault();
            }
            return;
        }

        if (panel) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closePanel();
            } else if (e.key === 'Tab') {
                trapFocus(e, panel.el);
            }
            return;
        }

        if (fishing) {
            if (ACTION.has(e.code)) {
                e.preventDefault();
                if (!e.repeat) fishAction();
            } else if (e.key === 'Escape') {
                finishFishing('reel');
            }
            return;
        }

        if (talk) {
            const d = KEYS[e.code];
            if (talk.choosing) {
                if (d === 'up' || d === 'down') {
                    e.preventDefault();
                    selectChoice(talk.sel + (d === 'up' ? -1 : 1));
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    endTalk(talk.choices.length - 1);
                    return;
                }
            }
            if (ACTION.has(e.code) || e.key === 'Escape') {
                e.preventDefault();
                if (!e.repeat) advance();
            }
            return;
        }

        if (e.key === 'Escape') {
            if (introRunning) skipIntro();
            closeMenu();
            return;
        }

        const d = KEYS[e.code];
        if (d) {
            e.preventDefault();
            if (!held.includes(d)) {
                held.push(d);
                pressedAt[d] = clock;
            }
            hideHintSoon();
            return;
        }
        if (ACTION.has(e.code) && !onControl(document.activeElement)) {
            e.preventDefault();
            if (!e.repeat && !busy && !player.move) interactAhead();
        }
        if (e.code === 'KeyJ' && !busy) openPanel('journal');
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') running = false;
        const d = KEYS[e.code];
        if (d) {
            const i = held.indexOf(d);
            if (i >= 0) held.splice(i, 1);
        }
    });

    window.addEventListener('blur', () => {
        held.length = 0;
        running = false;
    });

    function trapFocus(e, el) {
        const focusables = [...el.querySelectorAll('a[href], button:not([disabled])')].filter((n) => n.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!focusables.includes(document.activeElement)) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    function hitTest(clientX, clientY) {
        const wx = cam.x + (clientX * dpr) / S;
        const wy = cam.y + (clientY * dpr) / S;
        for (const a of scene.actors) {
            if (a === player || !a.visible) continue;
            if (wx >= a.px && wx < a.px + T && wy >= a.py - 8 && wy < a.py + T) return { actor: a, label: a.label };
        }
        const candidates = scene.objects.filter((o) => o.id).sort((a, b) => b.sortY - a.sortY);
        for (const o of candidates) {
            const img = o.img;
            const x0 = o.x * T + o.dx;
            const y0 = o.y * T + o.dy;
            if (wx >= x0 && wx < x0 + img.width && wy >= y0 && wy < y0 + img.height) return { obj: o, label: o.label };
        }
        const tx = Math.floor(wx / T);
        const ty = Math.floor(wy / T);
        if (scene === town && town.get(tx, ty) === '~') return { water: true, tx, ty, label: Q.rod ? 'Cast here' : null };
        if (scene.mat && tx === scene.mat[0] && ty === scene.mat[1]) return { mat: true, tx, ty, label: 'Exit' };
        return { tx, ty };
    }

    function tapAt(clientX, clientY) {
        if (panel || titleMode) return;
        if (fishing) {
            fishAction();
            return;
        }
        if (talk) {
            advance();
            return;
        }
        if (busy) return;
        const hit = hitTest(clientX, clientY);
        if (hit.actor) {
            const a = hit.actor;
            headTo(a.stand || aroundTiles([[a.x, a.y]]), { id: a.id, source: a, faceTiles: [[a.x, a.y]] });
        } else if (hit.obj) {
            const o = hit.obj;
            headTo(standFor(o), { id: o.id, source: o, faceTiles: o.item ? null : (o.faceTiles || tilesOfObject(o)) });
        } else if (hit.water) {
            headTo(aroundTiles([[hit.tx, hit.ty]]).filter(([x, y]) => town.get(x, y) !== '~'),
                { id: 'water', extra: [hit.tx, hit.ty], faceTiles: [[hit.tx, hit.ty]] });
        } else if (hit.mat) {
            if (player.x === hit.tx && player.y === hit.ty) runEvent('leave');
            else headTo([[hit.tx, hit.ty]], { id: 'leave' });
        } else if (walkable(hit.tx, hit.ty, player) || (hit.tx === player.x && hit.ty === player.y)) {
            headTo([[hit.tx, hit.ty]], null);
        }
    }

    canvas.tabIndex = -1;
    canvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        canvas.focus({ preventScroll: true });
        closeMenu();
        tapAt(e.clientX, e.clientY);
    });

    const tooltip = $('.tooltip');
    canvas.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || titleMode) return;
        const hit = hitTest(e.clientX, e.clientY);
        hover = hit.label || null;
        canvas.style.cursor = hit.label ? 'pointer' : 'default';
        if (hover && !talk && !panel && !fishing) {
            tooltip.hidden = false;
            tooltip.textContent = hover;
            tooltip.style.left = e.clientX + 'px';
            tooltip.style.top = e.clientY + 'px';
        } else {
            tooltip.hidden = true;
        }
    });
    canvas.addEventListener('pointerleave', () => {
        tooltip.hidden = true;
    });

    $$('.pad-btn').forEach((btn) => {
        const d = btn.dataset.dir;
        const down = (e) => {
            e.preventDefault();
            btn.classList.add('is-down');
            if (talk) {
                if (talk.choosing && (d === 'up' || d === 'down')) selectChoice(talk.sel + (d === 'up' ? -1 : 1));
                return;
            }
            if (!held.includes(d)) {
                held.push(d);
                pressedAt[d] = clock;
            }
            hideHintSoon();
        };
        const up = () => {
            btn.classList.remove('is-down');
            const i = held.indexOf(d);
            if (i >= 0) held.splice(i, 1);
        };
        btn.addEventListener('pointerdown', down);
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('pointerleave', up);
    });
    const aBtn = $('.pad-a');
    aBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        aBtn.classList.add('is-down');
        if (fishing) fishAction();
        else if (talk) advance();
        else if (!busy && !player.move) interactAhead();
    });
    aBtn.addEventListener('pointerup', () => aBtn.classList.remove('is-down'));
    aBtn.addEventListener('pointerleave', () => aBtn.classList.remove('is-down'));

    /* ======================================================================
       Top bar: tabs point at their building; links fade out; menu on small screens
       ====================================================================== */

    $$('[data-spot]').forEach((tab) => {
        const on = () => { highlight = tab.dataset.spot; };
        const off = () => { if (highlight === tab.dataset.spot) highlight = null; };
        tab.addEventListener('mouseenter', on);
        tab.addEventListener('focus', on);
        tab.addEventListener('mouseleave', off);
        tab.addEventListener('blur', off);
    });

    document.addEventListener('click', (e) => {
        const a = e.target.closest('a[href]');
        if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const href = a.getAttribute('href');
        if (a.target === '_blank' || /^(mailto:|https?:|#)/.test(href)) return;
        e.preventDefault();
        closeMenu();
        if (panel) closePanel();
        go(href);
    });

    const menuBtn = $('.menu-btn');
    const menu = $('#menu');
    function closeMenu() {
        if (menu.hidden) return;
        menu.hidden = true;
        menuBtn.setAttribute('aria-expanded', 'false');
    }
    menuBtn.addEventListener('click', () => {
        const open = menu.hidden;
        menu.hidden = !open;
        menuBtn.setAttribute('aria-expanded', String(open));
        if (open) menu.querySelector('a, button').focus({ preventScroll: true });
    });

    /* ======================================================================
       Hint and location banner
       ====================================================================== */

    const hint = $('.hint');
    let hintTimer = null;
    function showHint() {
        hint.hidden = false;
        hint.classList.remove('is-fading');
    }
    function hideHintSoon() {
        if (hint.hidden || hintTimer) return;
        hintTimer = setTimeout(() => {
            hint.classList.add('is-fading');
            setTimeout(() => { hint.hidden = true; }, 450);
        }, touch ? 5000 : 3500);
    }

    const banner = $('.location');
    let bannerTimer = null;
    function showBanner(text) {
        banner.textContent = text;
        banner.classList.add('is-shown');
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => banner.classList.remove('is-shown'), 2600);
    }

    /* ======================================================================
       Title screen: Game Mode or Site Mode
       ====================================================================== */

    let titleMode = root.classList.contains('is-title');

    if (titleMode) {
        player.visible = false;
        root.dataset.scene = 'title';
    }

    function chooseGame() {
        if (!titleMode) return;
        setMode('game');
        titleMode = false;
        root.classList.add('is-leaving-title');
        setTimeout(() => root.classList.remove('is-title', 'is-leaving-title'), 450);
        root.dataset.scene = 'town';
        camMix = { x: cam.x, y: cam.y, t: 0 };
        tween(0, 1, reduceMotion ? 0.01 : 1.1, (v) => { camMix.t = v; }).then(() => { camMix = null; });
        intro(true);
    }

    async function chooseSite(href) {
        setMode('site');
        busy = true;
        await fadeTo(1, 0.3);
        window.location.href = href;
    }

    $$('.mode').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (btn.dataset.mode === 'game') chooseGame();
            else chooseSite(btn.getAttribute('href'));
        });
    });

    /* ======================================================================
       Arrival
       ====================================================================== */

    let introRunning = false;
    const skipBtn = $('.skip-intro');

    function skipIntro() {
        if (!introRunning) return;
        fastForward = true;
        for (const tw of tweens.splice(0)) {
            if (tw.set) tw.set(tw.to);
            tw.resolve();
        }
        if (talk) endTalk(null);
    }
    skipBtn.addEventListener('click', skipIntro);

    async function intro(fromTitle) {
        introRunning = true;
        root.classList.add('is-intro');
        busy = true;
        skipBtn.hidden = false;
        player.visible = false;
        if (fromTitle) {
            iris = 1;
            await wait(reduceMotion ? 0.1 : 1.1);
        } else {
            iris = 0;
            await wait(0.3);
            if (reduceMotion) iris = 1;
            else await tween(0, 1, 1.1, (v) => { iris = v; }, easeIn);
        }
        showBanner(town.label);
        player.visible = true;
        if (!reduceMotion && !fastForward) {
            await tween(64, 0, 0.5, (v) => { player.z = v; }, easeIn);
            particles.push({ kind: 'dust', x: player.px + 8, y: player.py + 14, life: 0, max: 0.4 });
            await tween(0, 4, 0.08, (v) => { player.z = v; });
            await tween(4, 0, 0.1, (v) => { player.z = v; });
        }
        player.z = 0;
        await wait(0.45);
        bryce.dir = 'right';
        bryce.emote = fastForward ? 0 : 0.9;
        await wait(0.9);
        await bryce.walk([[19, 15], [20, 15], [21, 15]]);
        bryce.dir = 'right';
        player.dir = 'left';
        await say([
            'Oh, hey! You made it.',
            "I'm Bryce Kunschick. I'm a data automation developer and algorithmic trader.",
            'This little town is my website. Every building is a part of it.',
            'My house has my story, the Project Lab has my projects, and the Post Office has my contact info.',
            touch
                ? 'Tap anywhere to walk there, or use the pad. Tap people and signs to check them out.'
                : 'Walk with the arrow keys or WASD, or just click where you want to go. Press Enter to talk and read signs.',
            'Folks around town could use a hand, too. Your quests are up in the corner.',
            'Short on time? The tabs up top go straight to each page, and Site Mode is the classic website. Have fun!',
        ], { name: 'Bryce' });
        fastForward = false;
        player.visible = true;
        player.z = 0;
        iris = 1;
        fade = 0;
        bryce.emote = 0;
        if (bryce.x !== 21 || bryce.y !== 15) bryce.place(21, 15, 'right');
        if (player.x === 23 && player.y === 15) player.dir = 'left';
        skipBtn.hidden = true;
        introRunning = false;
        root.classList.remove('is-intro');
        busy = false;
        showHint();
        save();
    }

    async function welcomeBack() {
        const target = scenes[saved.scene] || town;
        const [px, py, pdir] = saved.player || [23, 15, 'down'];
        const [bx, by, bdir] = saved.bryce || [21, 15, 'right'];
        bryce.place(bx, by, bdir);
        if (target !== town) switchScene(target, px, py, pdir);
        else if (walkable(px, py, player)) player.place(px, py, pdir);
        if (bryce.x === player.x && bryce.y === player.y && scene === town) bryce.place(21, 15, 'right');
        root.dataset.scene = scene.id;
        busy = true;
        iris = 1;
        fade = 1;
        await fadeTo(0, 0.45);
        busy = false;
    }

    /* ======================================================================
       Main loop
       ====================================================================== */

    let last = performance.now();
    function tick(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        clock += dt;
        waterFrame = Math.floor(clock / 0.45) % 4;
        labFrame = Math.floor(clock / 0.6) % 2;
        serverFrame = Math.floor(clock / 0.3) % 4;

        for (let i = tweens.length - 1; i >= 0; i--) {
            const tw = tweens[i];
            tw.t = Math.min(1, tw.t + dt / tw.secs);
            if (tw.set) tw.set(tw.from + (tw.to - tw.from) * tw.ease(tw.t));
            if (tw.t >= 1) {
                tweens.splice(i, 1);
                tw.resolve();
            }
        }

        const target = skyTarget();
        nightLevel += (target.night - nightLevel) * Math.min(1, dt * 2.5);
        duskLevel += (target.dusk - duskLevel) * Math.min(1, dt * 2.5);

        for (const a of scene.actors) a.update(dt);
        updatePlayer();
        player.carry = 0;
        updateNPCs(dt);
        updateTalk(dt);
        updateFishing(dt);
        if (scene === town) updateLife(dt);
        if (walkTarget) walkTarget.t = Math.max(0, walkTarget.t - dt * 0.8);

        updateCamera();
        render();
        drawReportLoader();
        requestAnimationFrame(tick);
    }

    if (params.has('debug')) {
        window.__town = {
            player, bryce, stranger, fisher, mailman, assistant, buildings, scenes, cam, Q, hitTest, walkable, findPath, headTo,
            switchScene, runEvent, updateTracker, CSV_PLACES, rollFish, openReport, SPECIES,
            get scene() { return scene; },
            get S() { return S; },
            get busy() { return busy; },
            get path() { return path; },
            get talk() { return talk; },
            get fishing() { return fishing; },
        };
    }

    window.addEventListener('pagehide', () => {
        if (!titleMode && !restarting) save();
    });
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
            busy = false;
            leaving = false;
            fadeTo(0, 0.35);
        }
    });

    const start = () => {
        requestAnimationFrame((t) => {
            last = t;
            tick(t);
        });
        // (on the title screen nothing is pre-selected; arrow keys pick a button)
        if (titleMode) return;
        if (saved && saved.intro) welcomeBack();
        else intro(false);
    };
    if (document.fonts && document.fonts.ready) {
        Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(start);
    } else {
        start();
    }
})();
