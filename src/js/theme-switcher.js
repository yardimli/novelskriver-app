// NEW: Reusable theme switching logic.
document.addEventListener('DOMContentLoaded', () => {
	const themeToggleBtn = document.getElementById('theme-toggle');
	const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
	const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');
	const htmlTag = document.getElementById('html-tag');
	
	// Function to apply the theme
	const applyTheme = (theme) => {
		if (theme === 'dark') {
			htmlTag.classList.add('dark');
			themeToggleLightIcon.classList.remove('hidden');
			themeToggleDarkIcon.classList.add('hidden');
		} else {
			htmlTag.classList.remove('dark');
			themeToggleDarkIcon.classList.remove('hidden');
			themeToggleLightIcon.classList.add('hidden');
		}
	};
	
	// Check localStorage on initial load
	const savedTheme = localStorage.getItem('theme');
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
	applyTheme(initialTheme);
	
	// Add click listener
	themeToggleBtn.addEventListener('click', () => {
		const isDark = htmlTag.classList.contains('dark');
		const newTheme = isDark ? 'light' : 'dark';
		localStorage.setItem('theme', newTheme);
		applyTheme(newTheme);
	});
});
