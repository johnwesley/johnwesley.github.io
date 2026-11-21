(function () {
    var root = document.documentElement;
    var toggle = document.getElementById('theme-toggle');
    var media = window.matchMedia('(prefers-color-scheme: dark)');
    var KEY = 'theme-choice';

    // The previous script wrote 'theme' on every page load, not only on a
    // click, so that value is not a real choice: drop it.
    try { localStorage.removeItem('theme'); } catch (e) {}

    function saved() {
        try {
            var t = localStorage.getItem(KEY);
            return t === 'light' || t === 'dark' ? t : null;
        } catch (e) { return null; }
    }

    function apply(theme) {
        root.setAttribute('data-theme', theme);
        if (toggle) {
            toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        }
    }

    apply(saved() || (media.matches ? 'dark' : 'light'));

    media.addEventListener('change', function (e) {
        if (!saved()) apply(e.matches ? 'dark' : 'light');
    });

    if (toggle) {
        toggle.addEventListener('click', function () {
            var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            try { localStorage.setItem(KEY, next); } catch (e) {}
            apply(next);
        });
    }
})();
