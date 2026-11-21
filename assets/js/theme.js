(function () {
    var root = document.documentElement;
    var toggle = document.getElementById('theme-toggle');
    var media = window.matchMedia('(prefers-color-scheme: dark)');

    function saved() {
        try {
            var t = localStorage.getItem('theme');
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
            try { localStorage.setItem('theme', next); } catch (e) {}
            apply(next);
        });
    }
})();
