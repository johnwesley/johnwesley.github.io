const themeToggle = document.getElementById('theme-toggle');
const themeLabel = document.querySelector('label[for="theme-toggle"]');
const root = document.documentElement;

function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
        themeToggle.checked = true;
        themeLabel.textContent = '☀️ Light Mode';
    } else {
        themeToggle.checked = false;
        themeLabel.textContent = '🌙 Dark Mode';
    }
}

// Check for saved theme preference
const savedTheme = localStorage.getItem('theme');
// Check for system preference if no saved preference
const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

if (savedTheme) {
    applyTheme(savedTheme);
} else if (prefersDark) {
    applyTheme('dark');
} else {
    applyTheme('light'); // Default to light if nothing else
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('theme')) { // Only change if user hasn't manually set a theme
         applyTheme(e.matches ? 'dark' : 'light');
    }
});

// Handle manual theme toggle
themeToggle.addEventListener('change', function() {
    applyTheme(this.checked ? 'dark' : 'light');
}); 