const forms = require('@tailwindcss/forms');
const typography = require('@tailwindcss/typography');
const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: 'class',
	
	// MODIFIED: Updated paths to scan for classes in the new project structure.
	content: [
		'./public/**/*.html',
		'./src/js/**/*.js',
	],
	
	theme: {
		extend: {
			fontFamily: {
				sans: ['Figtree', ...defaultTheme.fontFamily.sans],
			},
		},
	},
	
	plugins: [forms, typography],
};
