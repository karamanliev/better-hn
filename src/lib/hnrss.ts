import { parse } from "node-html-parser";
import { RSSFeedDefinition } from "./rss";

const ALGOLIA_SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date";
const HN_BASE_URL = "https://news.ycombinator.com";
const HN_ITEM_URL = `${HN_BASE_URL}/item?id=`;
const HN_HOSTNAME = new URL(HN_BASE_URL).hostname;
const HN_PATH_REWRITES: Record<string, string> = {
  "/": "/",
  "/news": "/",
  "/newest": "/new",
  "/ask": "/ask",
  "/show": "/show",
};
const CACHE_TTL_MS = 120_000;
const DEFAULT_COUNT = 30;
const MAX_COUNT = 100;
const PAGE_SIZE = 30;
const REQUEST_HEADERS = { "user-agent": "better-hn rss/1.0" };
const JSON_REQUEST_HEADERS = {
  ...REQUEST_HEADERS,
  accept: "application/json",
};

interface AlgoliaSearchResponse {
  hits: AlgoliaSearchHit[];
}

interface AlgoliaSearchHit {
  _tags: string[];
  objectID: string;
  title?: string | null;
  url?: string | null;
  author: string;
  created_at: string;
  story_title?: string | null;
  story_url?: string | null;
  story_text?: string | null;
  comment_text?: string | null;
  num_comments?: number | null;
  points?: number | null;
  story_id?: number | null;
}

interface RSSItem {
  title: string;
  description?: string;
  link: string;
  comments: string;
  guid: string;
  author: string;
  pubDate: string;
}

export interface RSSQueryOptions {
  count: number;
  descriptionMode: "meta" | "full" | "none";
  linkTo: "article" | "comments";
  minPoints?: number;
  minComments?: number;
}

const cache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

const getCached = <T>(key: string, load: () => Promise<T>) => {
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.value as Promise<T>;
  }

  const value = load().catch((error) => {
    cache.delete(key);
    throw error;
  });

  cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });

  return value;
};

const xmlEscape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const cdata = (value: string) =>
  `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;

const formatUTC = (date: Date) => date.toUTCString().replace("GMT", "+0000");

const toRSSDate = (value: Date | string) => {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return formatUTC(new Date());
  }

  return formatUTC(date);
};

const decodeText = (value?: string | null) => {
  if (!value) {
    return "";
  }

  return parse(`<span>${value}</span>`).textContent;
};

const parseDescriptionMode = (
  value: unknown,
): RSSQueryOptions["descriptionMode"] => {
  const raw = getSingleQueryValue(value);

  switch (raw) {
    case "full":
    case "meta":
    case "none":
      return raw;
    case "0":
      return "none";
    default:
      return "full";
  }
};

const clampCount = (count?: number) =>
  Math.min(Math.max(count ?? DEFAULT_COUNT, 1), MAX_COUNT);

const rewriteHackerNewsHref = (href: string, origin: string) => {
  try {
    const url = new URL(href, HN_BASE_URL);

    if (url.hostname !== HN_HOSTNAME) {
      return href;
    }

    if (url.pathname === "/item") {
      const id = url.searchParams.get("id");

      return id ? `${origin}/post/${id}${url.hash}` : href;
    }

    if (url.pathname === "/user") {
      const id = url.searchParams.get("id");

      return id ? `${origin}/user/${encodeURIComponent(id)}` : href;
    }

    const rewrittenPath = HN_PATH_REWRITES[url.pathname];

    if (rewrittenPath !== undefined) {
      return `${origin}${rewrittenPath}`;
    }

    return `${origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
};

const HN_TEXT_URL_REGEXP =
  /https?:\/\/news\.ycombinator\.com\S+|news\.ycombinator\.com\S+/g;

const rewriteHackerNewsText = (text: string, origin: string) =>
  text.replace(HN_TEXT_URL_REGEXP, (match) => {
    const href = match.startsWith("http") ? match : `https://${match}`;

    return rewriteHackerNewsHref(href, origin);
  });

const normalizeHtml = (value?: string | null, origin?: string) => {
  if (!value) {
    return "";
  }

  const root = parse(`<div>${value}</div>`).querySelector("div");

  if (!root) {
    return value;
  }

  if (origin) {
    for (const link of root.querySelectorAll("a")) {
      const href = link.getAttribute("href");

      if (!href) {
        continue;
      }

      const rewrittenHref = rewriteHackerNewsHref(href, origin);

      link.setAttribute("href", rewrittenHref);
      link.textContent = rewriteHackerNewsText(link.textContent, origin);
    }
  }

  return root.innerHTML;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const formatPlainNumber = (value: number) => String(value);

const getExternalArticleUrl = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);

    return url.hostname === HN_HOSTNAME ? undefined : url.toString();
  } catch {
    return undefined;
  }
};

const getDisplayDomain = (value?: string | null) => {
  const articleUrl = getExternalArticleUrl(value);

  if (!articleUrl) {
    return undefined;
  }

  try {
    return new URL(articleUrl).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
};

const buildUserLink = (origin: string, author: string) =>
  `<a href="${escapeHtml(`${origin}/user/${encodeURIComponent(author)}`)}">${escapeHtml(author)}</a>`;

const buildStrongUserLink = (origin: string, author: string) =>
  `<strong>${buildUserLink(origin, author)}</strong>`;

const wrapBracketLinksLine = (links: Array<{ href: string; label: string }>) =>
  `<p>${links
    .map(
      ({ href, label }) =>
        `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`,
    )
    .map((link) => `[${link}]`)
    .join(" ")}</p>`;

const appendDomainToTitle = (title: string, domain?: string) => {
  if (!domain) {
    return title;
  }

  return `${title} (${domain})`;
};

const getSingleQueryValue = (value: unknown) =>
  Array.isArray(value) ? value[0] : value;

const parsePositiveInt = (value: unknown) => {
  const raw = getSingleQueryValue(value);

  if (typeof raw !== "string" || raw === "") {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
};

export const parseRSSQuery = (
  query: Record<string, unknown>,
  feed: RSSFeedDefinition,
): RSSQueryOptions => {
  const count = parsePositiveInt(query.count);
  const link = getSingleQueryValue(query.link);
  const isStoryFeed = feed.source !== "comments";
  const linkTo = isStoryFeed && link === "comments" ? "comments" : "article";
  const descriptionMode = parseDescriptionMode(query.description);
  const minPoints = isStoryFeed ? parsePositiveInt(query.points) : undefined;
  const minComments = isStoryFeed
    ? parsePositiveInt(query.comments)
    : undefined;

  return {
    count: clampCount(count),
    descriptionMode,
    linkTo,
    minPoints,
    minComments,
  };
};

const createFetchError = (url: string) =>
  createError({
    statusCode: 502,
    statusMessage: `Failed to fetch ${url}`,
  });

const fetchResponse = async (
  url: string,
  headers: HeadersInit = REQUEST_HEADERS,
) => {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw createFetchError(url);
  }

  return response;
};

const fetchText = async (url: string) => {
  const response = await fetchResponse(url);

  return response.text();
};

const fetchJSON = async <T>(url: string) => {
  const response = await fetchResponse(url, JSON_REQUEST_HEADERS);

  return (await response.json()) as T;
};

const fetchAlgolia = async (params: URLSearchParams) => {
  const url = `${ALGOLIA_SEARCH_URL}?${params.toString()}`;

  const response = await getCached(url, () =>
    fetchJSON<AlgoliaSearchResponse>(url),
  );

  return response.hits ?? [];
};

const buildPaginatedHNUrl = (path: string, page: number) => {
  if (page <= 1) {
    return `${HN_BASE_URL}${path}`;
  }

  const separator = path.includes("?") ? "&" : "?";

  return `${HN_BASE_URL}${path}${separator}p=${page}`;
};

const parseScrapedPage = (html: string) => {
  const document = parse(html);

  return {
    ids: document
      .querySelectorAll("tr.athing")
      .map((node) => node.getAttribute("id"))
      .filter((id): id is string => Boolean(id)),
    nextPath:
      document.querySelector("a.morelink")?.getAttribute("href") ?? undefined,
  };
};

const scrapePage = async (path: string, page?: number) => {
  const url =
    page === undefined
      ? new URL(path, HN_BASE_URL).toString()
      : buildPaginatedHNUrl(path, page);
  const html = await getCached(url, () => fetchText(url));

  return parseScrapedPage(html);
};

const buildNumericFilters = (
  feed: RSSFeedDefinition,
  query: RSSQueryOptions,
) => {
  const filters: string[] = [];

  if (query.minPoints !== undefined) {
    filters.push(`points>=${query.minPoints}`);
  }

  if (query.minComments !== undefined) {
    filters.push(`num_comments>=${query.minComments}`);
  }

  if (feed.slug === "frontpage") {
    const cutoff = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    filters.push(`created_at_i>=${cutoff}`);
  }

  return filters;
};

const orderHitsByIds = (ids: string[], hits: AlgoliaSearchHit[]) => {
  const hitsById = new Map(hits.map((hit) => [hit.objectID, hit]));

  return ids
    .map((id) => hitsById.get(id))
    .filter((hit): hit is AlgoliaSearchHit => Boolean(hit));
};

const buildSpecialFeedParams = (
  feed: RSSFeedDefinition,
  query: RSSQueryOptions,
  ids: string[],
) => {
  const params = new URLSearchParams();
  const numericFilters = buildNumericFilters(feed, query);

  if (numericFilters.length > 0) {
    params.set("numericFilters", numericFilters.join(","));
  }

  params.set("hitsPerPage", String(ids.length));

  if (feed.source === "comments") {
    params.set("filters", ids.map((id) => `objectID:"${id}"`).join(" OR "));
  } else {
    params.set(
      "tags",
      `(story,poll),(${ids.map((id) => `story_${id}`).join(",")})`,
    );
  }

  return params;
};

const addPageHits = async (
  hits: AlgoliaSearchHit[],
  feed: RSSFeedDefinition,
  query: RSSQueryOptions,
  ids: string[],
) => {
  if (ids.length === 0) {
    return;
  }

  const params = buildSpecialFeedParams(feed, query, ids);
  const pageHits = await fetchAlgolia(params);

  hits.push(...orderHitsByIds(ids, pageHits));
};

const fetchSpecialFeedHits = async (
  feed: RSSFeedDefinition,
  query: RSSQueryOptions,
) => {
  if (!feed.scrapePath) {
    throw createError({
      statusCode: 500,
      statusMessage: `Missing scrape path for ${feed.slug}`,
    });
  }

  const hits: AlgoliaSearchHit[] = [];

  if (feed.slug === "highlights") {
    let nextPath = feed.scrapePath;

    while (nextPath && hits.length < query.count) {
      const scraped = await scrapePage(nextPath);

      if (scraped.ids.length === 0) {
        break;
      }

      await addPageHits(hits, feed, query, scraped.ids);

      if (scraped.ids.length < PAGE_SIZE) {
        break;
      }

      nextPath = scraped.nextPath;
    }

    return hits;
  }

  for (let page = 1; hits.length < query.count; page += 1) {
    const scraped = await scrapePage(feed.scrapePath, page);

    if (scraped.ids.length === 0) {
      break;
    }

    await addPageHits(hits, feed, query, scraped.ids);

    if (scraped.ids.length < PAGE_SIZE) {
      break;
    }
  }

  return hits;
};

const getAlgoliaHits = async (
  feed: RSSFeedDefinition,
  query: RSSQueryOptions,
) => {
  const params = new URLSearchParams();
  const numericFilters = buildNumericFilters(feed, query);

  if (numericFilters.length > 0) {
    params.set("numericFilters", numericFilters.join(","));
  }

  if (feed.source === "algolia") {
    if (!feed.algoliaTags) {
      throw createError({
        statusCode: 500,
        statusMessage: `Missing Algolia tags for ${feed.slug}`,
      });
    }

    params.set("tags", feed.algoliaTags);
    params.set("hitsPerPage", String(query.count));

    return fetchAlgolia(params);
  }

  return fetchSpecialFeedHits(feed, query);
};

const buildCommentsUrl = (
  origin: string,
  storyId: string | number,
  commentId?: string | number,
) => `${origin}/post/${storyId}${commentId ? `#${commentId}` : ""}`;

const buildDescriptionLinksLine = (
  discussionUrl: string,
  discussionLabel: string,
  articleUrl?: string,
) => {
  const links = [{ href: discussionUrl, label: discussionLabel }];

  if (articleUrl) {
    links.unshift({ href: articleUrl, label: "link" });
  }

  return wrapBracketLinksLine(links);
};

const appendDescriptionBody = (
  descriptionParts: string[],
  descriptionMode: RSSQueryOptions["descriptionMode"],
  bodyHtml: string,
) => {
  if (descriptionMode !== "full" || !bodyHtml) {
    return;
  }

  descriptionParts.push("<hr>");
  descriptionParts.push(`<div>${bodyHtml}</div>`);
};

const buildStoryDescription = (
  hit: AlgoliaSearchHit,
  origin: string,
  commentsUrl: string,
  query: RSSQueryOptions,
) => {
  if (query.descriptionMode === "none") {
    return undefined;
  }

  const articleUrl = getExternalArticleUrl(hit.url);
  const storyText = normalizeHtml(hit.story_text, origin);
  const descriptionParts: string[] = [];

  descriptionParts.push(
    `<p>Points: <strong>${escapeHtml(formatPlainNumber(hit.points ?? 0))}</strong> | Comments: <strong>${escapeHtml(formatPlainNumber(hit.num_comments ?? 0))}</strong> | submitted by ${buildStrongUserLink(origin, hit.author)}</p>`,
  );

  descriptionParts.push(
    buildDescriptionLinksLine(commentsUrl, "comments", articleUrl),
  );
  appendDescriptionBody(descriptionParts, query.descriptionMode, storyText);

  return descriptionParts.join("\n");
};

const buildCommentTitle = (hit: AlgoliaSearchHit) => {
  const storyTitle = decodeText(hit.story_title).trim();

  if (!storyTitle) {
    return `comment by ${hit.author}`;
  }

  return `comment by ${hit.author} in "${storyTitle}"`;
};

const buildCommentDescription = (
  hit: AlgoliaSearchHit,
  origin: string,
  commentUrl: string,
  query: RSSQueryOptions,
) => {
  if (query.descriptionMode === "none") {
    return undefined;
  }

  const storyUrl = getExternalArticleUrl(hit.story_url);
  const commentText = normalizeHtml(hit.comment_text, origin);
  const descriptionParts: string[] = [];

  descriptionParts.push(
    `<p>submitted by ${buildStrongUserLink(origin, hit.author)}</p>`,
  );

  descriptionParts.push(
    buildDescriptionLinksLine(commentUrl, "comment", storyUrl),
  );
  appendDescriptionBody(descriptionParts, query.descriptionMode, commentText);

  return descriptionParts.join("\n");
};

const buildStoryTitle = (hit: AlgoliaSearchHit) => {
  const title = decodeText(hit.title).trim();
  const domain = getDisplayDomain(hit.url);

  return appendDomainToTitle(title, domain);
};

const buildStoryItem = (
  hit: AlgoliaSearchHit,
  origin: string,
  query: RSSQueryOptions,
): RSSItem => {
  const commentsUrl = buildCommentsUrl(origin, hit.objectID);
  const articleUrl = hit.url ?? commentsUrl;

  return {
    title: buildStoryTitle(hit),
    description: buildStoryDescription(hit, origin, commentsUrl, query),
    link: query.linkTo === "comments" ? commentsUrl : articleUrl,
    comments: commentsUrl,
    guid: `${HN_ITEM_URL}${hit.objectID}`,
    author: hit.author,
    pubDate: toRSSDate(hit.created_at),
  };
};

const buildCommentItem = (
  hit: AlgoliaSearchHit,
  origin: string,
  query: RSSQueryOptions,
): RSSItem => {
  const storyId = hit.story_id ?? hit.objectID;
  const commentUrl = buildCommentsUrl(origin, storyId, hit.objectID);

  return {
    title: buildCommentTitle(hit),
    description: buildCommentDescription(hit, origin, commentUrl, query),
    link: commentUrl,
    comments: commentUrl,
    guid: `${HN_ITEM_URL}${hit.objectID}`,
    author: hit.author,
    pubDate: toRSSDate(hit.created_at),
  };
};

const buildChannelTitle = (feed: RSSFeedDefinition) =>
  `Hacker News: ${feed.title}`;

const buildItemDescriptionXML = (description?: string) => {
  if (!description) {
    return "";
  }

  return `<description>${cdata(description)}</description>`;
};

export const buildRSSFeedXML = async (
  feed: RSSFeedDefinition,
  query: RSSQueryOptions,
  requestUrl: URL,
) => {
  const hits = await getAlgoliaHits(feed, query);
  const visibleHits = hits.slice(0, query.count);
  const buildItem =
    feed.source === "comments" ? buildCommentItem : buildStoryItem;
  const items = visibleHits.map((hit) =>
    buildItem(hit, requestUrl.origin, query),
  );

  const lastBuildDate = toRSSDate(new Date());
  const docsUrl = `${requestUrl.origin}/rss`;

  const itemXML = items
    .map(
      (item) => `
    <item>
      <title>${cdata(item.title)}</title>
      ${buildItemDescriptionXML(item.description)}
      <pubDate>${xmlEscape(item.pubDate)}</pubDate>
      <link>${xmlEscape(item.link)}</link>
      <dc:creator>${xmlEscape(item.author)}</dc:creator>
      <comments>${xmlEscape(item.comments)}</comments>
      <guid isPermaLink="false">${xmlEscape(item.guid)}</guid>
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(buildChannelTitle(feed))}</title>
    <link>${xmlEscape(feed.channelLink)}</link>
    <description>Hacker News RSS</description>
    <docs>${xmlEscape(docsUrl)}</docs>
    <generator>better-hn rss</generator>
    <lastBuildDate>${xmlEscape(lastBuildDate)}</lastBuildDate>
    <atom:link href="${xmlEscape(requestUrl.toString())}" rel="self" type="application/rss+xml" />
${itemXML}
  </channel>
</rss>`;
};
