(() => {
    const root = document.documentElement;

    /* Site Mode vs Game Mode: the home page (index.html) reads this to decide where to send you */
    try {
        sessionStorage.setItem('bk-mode', 'site');
    } catch (e) { /* storage unavailable */ }
    document.addEventListener('click', (e) => {
        const link = e.target.closest('[data-mode="game"]');
        if (!link) return;
        try {
            sessionStorage.setItem('bk-mode', 'game');
        } catch (err) { /* storage unavailable */ }
    });

    /* Header: hairline appears once the page scrolls */
    const header = document.querySelector('.site-header');
    const onScrollHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 4);
    onScrollHeader();
    window.addEventListener('scroll', onScrollHeader, { passive: true });

    /* Mobile menu */
    const toggle = document.querySelector('.menu-toggle');
    const menu = document.getElementById('menu');

    const setMenu = (open) => {
        toggle.setAttribute('aria-expanded', String(open));
        document.body.style.overflow = open ? 'hidden' : '';
        if (open) {
            menu.hidden = false;
            requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
        } else {
            menu.classList.remove('is-open');
            setTimeout(() => {
                if (toggle.getAttribute('aria-expanded') === 'false') menu.hidden = true;
            }, 400);
        }
    };

    if (toggle && menu) {
        toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
        menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
                setMenu(false);
                toggle.focus();
            }
        });
        window.matchMedia('(min-width: 761px)').addEventListener('change', (e) => {
            if (e.matches) setMenu(false);
        });
    }

    /* Intro: start once the fonts and portrait are ready, so nothing reflows or pops in mid-animation */
    const startIntro = () => {
        if (root.classList.contains('is-loaded')) return;
        root.classList.add('is-loaded');
        setTimeout(() => root.classList.add('is-settled'), 2600);
    };
    const portrait = document.querySelector('.profile-photo img');
    const ready = [
        document.fonts ? document.fonts.ready : null,
        portrait && portrait.decode ? portrait.decode().catch(() => { }) : null,
    ].filter(Boolean);
    Promise.all(ready).then(() => requestAnimationFrame(startIntro));
    setTimeout(startIntro, 1400);

    /* Scroll reveals: things that come into view together follow one another */
    const revealables = document.querySelectorAll('[data-reveal]');
    const reveal = (el, stagger) => {
        el.style.setProperty('--stagger', stagger + 'ms');
        el.classList.add('is-in');
        setTimeout(() => el.classList.add('is-done'), 1600 + stagger);
    };
    if (!('IntersectionObserver' in window)) {
        revealables.forEach((el) => el.classList.add('is-in', 'is-done'));
    } else {
        const io = new IntersectionObserver((entries) => {
            entries.filter((entry) => entry.isIntersecting).forEach((entry, i) => {
                reveal(entry.target, Math.min(i * 85, 600));
                io.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -6% 0px' });
        revealables.forEach((el) => io.observe(el));
    }

    /* Focus: light up whichever area crosses the middle of the screen */
    const blocks = [...document.querySelectorAll('.focus-block')];
    const index = document.querySelector('.focus-index');
    const marker = index && index.querySelector('.focus-marker');
    const indexLinks = index ? [...index.querySelectorAll('a')] : [];

    const placeMarker = () => {
        const active = indexLinks.find((a) => a.classList.contains('is-active'));
        if (!marker || !active) return;
        marker.style.setProperty('--y', active.offsetTop + 'px');
        marker.style.setProperty('--h', active.offsetHeight + 'px');
    };

    const setActive = (id) => {
        blocks.forEach((b) => b.classList.toggle('is-active', b.id === id));
        indexLinks.forEach((a) => {
            const on = a.getAttribute('href') === '#' + id;
            a.classList.toggle('is-active', on);
            if (on) a.setAttribute('aria-current', 'true');
            else a.removeAttribute('aria-current');
        });
        placeMarker();
    };

    if (blocks.length && 'IntersectionObserver' in window) {
        const band = new IntersectionObserver((entries) => {
            entries.forEach((entry) => { if (entry.isIntersecting) setActive(entry.target.id); });
        }, { rootMargin: '-45% 0px -50% 0px' });
        blocks.forEach((b) => band.observe(b));
    }
    placeMarker();
    window.addEventListener('resize', placeMarker);
    if (document.fonts) document.fonts.ready.then(placeMarker);

    /* Contact panel: unfolds to full width as it comes into view */
    const panel = document.querySelector('.contact-panel');
    if (panel && 'IntersectionObserver' in window) {
        const unfold = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                panel.classList.add('is-open');
                unfold.disconnect();
            }
        }, { rootMargin: '0px 0px -15% 0px' });
        unfold.observe(panel);
    } else if (panel) {
        panel.classList.add('is-open');
    }
})();
