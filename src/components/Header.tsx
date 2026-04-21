import { useSSRContext } from "~/lib/context";
import { Link } from "./Link";
import { MagnifyingGlassIcon } from "./icons/MagnifyingGlassIcon";
import { MoonIcon } from "./icons/MoonIcon";
import { PaperAirplaneIcon } from "./icons/PaperAirplaneIcon";
import { RssIcon } from "./icons/RssIcon";
import { SunIcon } from "./icons/SunIcon";
import { SystemIcon } from "./icons/SystemIcon";

const LINKS = [
  { title: "Top", href: "/top" },
  { title: "New", href: "/new" },
  { title: "Ask", href: "/ask" },
  { title: "Show", href: "/show" },
];

export const Header = () => {
  const { url } = useSSRContext();

  return (
    <header className="header">
      <nav className="navigation">
        {LINKS.map((link) => (
          <Link
            className="link"
            activeClassName="link__active"
            href={link.href}
            isActive={link.href === url.pathname}
            data-prefetch
          >
            {link.title}
          </Link>
        ))}
      </nav>

      <button
        id="shareButton"
        className="iconButton"
        title="Share item"
        onclick="Share.sharePage()"
      >
        <PaperAirplaneIcon />
      </button>
      <Link className="iconButton" href="/rss" title="RSS feeds" aria-label="RSS feeds">
        <RssIcon />
      </Link>
      <a
        className="iconButton"
        title="Search Hacker News"
        href="https://hn.algolia.com"
        rel="noreferrer noopener"
      >
        <MagnifyingGlassIcon />
      </a>
      <button
        className="iconButton"
        title="Toggle theme"
        onclick="UI.switchTheme()"
      >
        <SystemIcon className="iconSystem" />
        <SunIcon className="iconLight" />
        <MoonIcon className="iconDark" />
      </button>
    </header>
  );
};
