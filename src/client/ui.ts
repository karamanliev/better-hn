import Cookies from "js-cookie";
import {
	DEFAULT_THEME,
	THEME_COOKIE,
	Theme,
	getNextTheme,
	getResolvedTheme,
	getThemeColor,
	isTheme,
} from "../lib/theme";

const systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

const getPreferredDark = () => systemThemeMedia.matches;

const getTheme = () => {
	const storedTheme = Cookies.get(THEME_COOKIE);

	return isTheme(storedTheme) ? storedTheme : DEFAULT_THEME;
};

const setTheme = (theme: Theme) => {
	const root = document.documentElement;
	const resolvedTheme = getResolvedTheme(theme, getPreferredDark());

	root.dataset.theme = theme;
	root.classList.toggle("dark", resolvedTheme === Theme.DARK);
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute("content", getThemeColor(resolvedTheme));
	Cookies.set(THEME_COOKIE, theme, { expires: 365 * 24 * 60 * 60, sameSite: "lax" });
};

const updateTheme = () => {
	setTheme(getTheme());
};

const syncSystemTheme = () => {
	if (getTheme() !== Theme.SYSTEM) {
		return;
	}

	setTheme(Theme.SYSTEM);
};

(window as any).UI = {
	switchTheme() {
		setTheme(getNextTheme(getTheme()));
	},
};

systemThemeMedia.addEventListener("change", syncSystemTheme);

window.addEventListener("pageshow", () => {
	updateTheme();
});

updateTheme();
