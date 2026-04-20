export const enum Theme {
	LIGHT = "light",
	DARK = "dark",
	SYSTEM = "system",
}

export const DEFAULT_THEME: Theme = Theme.SYSTEM;

export const THEME_COOKIE = "bhn.theme";

const THEME_VALUES = [Theme.SYSTEM, Theme.LIGHT, Theme.DARK] as const;

export const isTheme = (theme: unknown): theme is Theme => {
	return typeof theme === "string" && THEME_VALUES.includes(theme as Theme);
};

export const getResolvedTheme = (theme: Theme, prefersDark = false) => {
	if (theme === Theme.SYSTEM) {
		return prefersDark ? Theme.DARK : Theme.LIGHT;
	}

	return theme;
};

export const getNextTheme = (theme: Theme) => {
	switch (theme) {
		case Theme.SYSTEM:
			return Theme.LIGHT;
		case Theme.LIGHT:
			return Theme.DARK;
		default:
			return Theme.SYSTEM;
	}
};

export const getThemeColor = (theme: Theme, prefersDark = false) => {
	return getResolvedTheme(theme, prefersDark) === Theme.LIGHT ? "#ffffff" : "#18181b";
};
