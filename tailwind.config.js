const typography = require('@tailwindcss/typography');
const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ['selector', '[data-theme="dark"]'],
	
	content: [
		'./public/**/*.html',
		'./src/js/**/*.js',
		'./src/js/novel-editor/**/*.js',
	],
	
	theme: {
		extend: {
			fontFamily: {
				sans: ['Figtree', ...defaultTheme.fontFamily.sans],
			},
		},
	},
	
	plugins: [
		typography,
		require('daisyui')
	],
	
	daisyui: {
		themes: ["light", "dark"],
		darkTheme: "dark",
		base: true, // applies background color and foreground color for root element by default
		styled: true, // include daisyUI colors and design decisions for all components
		utils: true, // adds responsive and modifier utility classes
		logs: true, // Shows info about daisyUI version and used config in the console when building your CSS
	},
};
