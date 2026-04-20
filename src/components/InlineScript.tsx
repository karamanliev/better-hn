import { Theme, THEME_COOKIE } from "~/lib/theme";

const themeCookiePrefix = `${THEME_COOKIE}=`;

const script = `
if (!("share" in navigator)) {
	document.body.classList.add("noshare");
}

(function () {
	function getStoredTheme() {
		let storedTheme = undefined;

		try {
			const themeCookie = document.cookie
				.split("; ")
				.find(cookie => cookie.startsWith("${themeCookiePrefix}"));
			storedTheme = themeCookie?.slice("${themeCookiePrefix}".length);
		} catch {}

		if (
			storedTheme === "${Theme.SYSTEM}" ||
			storedTheme === "${Theme.LIGHT}" ||
			storedTheme === "${Theme.DARK}"
		) {
			return storedTheme;
		}

		return "${Theme.SYSTEM}";
	}

	function getResolvedTheme(theme) {
		if (theme === "${Theme.SYSTEM}") {
			const userMedia = window.matchMedia("(prefers-color-scheme: dark)");
			return userMedia?.matches ? "${Theme.DARK}" : "${Theme.LIGHT}";
		}

		return theme;
	}

	const root = document.documentElement;
	const theme = getStoredTheme();
	const resolvedTheme = getResolvedTheme(theme);

	root.dataset.theme = theme;
	root.classList.toggle("dark", resolvedTheme === "${Theme.DARK}");
})();
`;

export const InlineScript = () => {
	return <script dangerouslySetInnerHTML={{ __html: script }} />;
};
