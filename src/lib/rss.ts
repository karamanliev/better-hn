export type RSSFeedSlug =
  | "frontpage"
  | "newest"
  | "ask"
  | "show"
  | "polls"
  | "classic"
  | "best"
  | "active"
  | "highlights"
  | "bestcomments";

export type RSSFeedCategory =
  | "Firehose"
  | "Self-posts"
  | "Alternative"
  | "Comments";

export interface RSSFeedDefinition {
  slug: RSSFeedSlug;
  title: string;
  summary: string;
  category: RSSFeedCategory;
  channelLink: string;
  source: "algolia" | "special" | "comments";
  algoliaTags?: string;
  scrapePath?: string;
  topicName?: string;
}

export const RSS_FEEDS: RSSFeedDefinition[] = [
  {
    slug: "frontpage",
    title: "Front Page",
    summary: "New posts as they reach the Hacker News front page.",
    category: "Firehose",
    channelLink: "https://news.ycombinator.com/",
    source: "algolia",
    algoliaTags: "front_page",
    topicName: "top",
  },
  {
    slug: "newest",
    title: "Newest",
    summary: "New stories and polls as they are submitted.",
    category: "Firehose",
    channelLink: "https://news.ycombinator.com/newest",
    source: "algolia",
    algoliaTags: "(story,poll)",
    topicName: "new",
  },
  {
    slug: "ask",
    title: "Ask HN",
    summary: "Stories currently on the Ask HN page.",
    category: "Self-posts",
    channelLink: "https://news.ycombinator.com/ask",
    source: "special",
    scrapePath: "/ask",
    topicName: "ask",
  },
  {
    slug: "show",
    title: "Show HN",
    summary: "Stories currently on the Show HN page.",
    category: "Self-posts",
    channelLink: "https://news.ycombinator.com/show",
    source: "special",
    scrapePath: "/show",
    topicName: "show",
  },
  {
    slug: "polls",
    title: "Polls",
    summary: "New polls as they are submitted to Hacker News.",
    category: "Self-posts",
    channelLink: "https://news.ycombinator.com/",
    source: "algolia",
    algoliaTags: "poll",
  },
  {
    slug: "classic",
    title: "Classic",
    summary: "Stories from the Classic Hacker News homepage.",
    category: "Alternative",
    channelLink: "https://news.ycombinator.com/classic",
    source: "special",
    scrapePath: "/classic",
  },
  {
    slug: "best",
    title: "Best",
    summary: "Stories from the Best Hacker News page.",
    category: "Alternative",
    channelLink: "https://news.ycombinator.com/best",
    source: "special",
    scrapePath: "/best",
  },
  {
    slug: "active",
    title: "Active",
    summary: "Stories with the most active ongoing discussions.",
    category: "Alternative",
    channelLink: "https://news.ycombinator.com/active",
    source: "special",
    scrapePath: "/active",
  },
  {
    slug: "highlights",
    title: "Highlights",
    summary: "Hand-curated standout comments and subthreads from Hacker News.",
    category: "Comments",
    channelLink: "https://news.ycombinator.com/highlights",
    source: "comments",
    scrapePath: "/highlights",
  },
  {
    slug: "bestcomments",
    title: "Best Comments",
    summary: "Recent highly voted comments from across Hacker News.",
    category: "Comments",
    channelLink: "https://news.ycombinator.com/bestcomments",
    source: "comments",
    scrapePath: "/bestcomments",
  },
];

export const RSS_FEED_CATEGORIES: RSSFeedCategory[] = [
  "Firehose",
  "Self-posts",
  "Alternative",
  "Comments",
];

export const TOPIC_RSS_FEEDS: Partial<Record<string, RSSFeedSlug>> = {
  top: "frontpage",
  new: "newest",
  ask: "ask",
  show: "show",
};

export const getRSSFeedPath = (slug: RSSFeedSlug) => `/rss/${slug}`;

export const getRSSFeed = (slug?: string) => {
  if (!slug) {
    return undefined;
  }

  return RSS_FEEDS.find((feed) => feed.slug === slug);
};

export const getTopicRSSFeed = (topicName: string) => {
  const slug = TOPIC_RSS_FEEDS[topicName];

  return slug ? getRSSFeed(slug) : undefined;
};
