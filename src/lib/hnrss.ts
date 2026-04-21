import { parse } from "node-html-parser";
import { RSSFeedDefinition } from "./rss";

const ALGOLIA_SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date";
const HN_BASE_URL = "https://news.ycombinator.com";
const HN_ITEM_URL = `${HN_BASE_URL}/item?id=`;
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
  includeDescription: boolean;
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

const cdata = (value: string) => `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;

const toRSSDate = (date: Date) => date.toUTCString().replace("GMT", "+0000");

const formatRSSDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return toRSSDate(new Date());
  }

  return toRSSDate(date);
};

const decodeText = (value?: string | null) => {
  if (!value) {
    return "";
  }

  return parse(`<span>${value}</span>`).textContent;
};

const normalizeHtml = (value?: string | null) => {
  if (!value) {
    return "";
  }

  return parse(`<div>${value}</div>`).querySelector("div")?.innerHTML ?? value;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

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
  const description = getSingleQueryValue(query.description);
  const link = getSingleQueryValue(query.link);
  const isStoryFeed = feed.source !== "bestcomments";
  const linkTo = isStoryFeed && link === "comments" ? "comments" : "article";
  const minPoints = isStoryFeed ? parsePositiveInt(query.points) : undefined;
  const minComments = isStoryFeed ? parsePositiveInt(query.comments) : undefined;

  return {
    count: Math.min(Math.max(count ?? DEFAULT_COUNT, 1), MAX_COUNT),
    includeDescription: description !== "0",
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

  const response = await getCached(url, () => fetchJSON<AlgoliaSearchResponse>(url));

  return response.hits ?? [];
};

const buildPaginatedHNUrl = (path: string, page: number) => {
  if (page <= 1) {
    return `${HN_BASE_URL}${path}`;
  }

  const separator = path.includes("?") ? "&" : "?";

  return `${HN_BASE_URL}${path}${separator}p=${page}`;
};

const scrapeItemIds = async (path: string, page: number) => {
  const url = buildPaginatedHNUrl(path, page);
  const html = await getCached(url, () => fetchText(url));
  const document = parse(html);

  return document
    .querySelectorAll("tr.athing")
    .map((node) => node.getAttribute("id"))
    .filter((id): id is string => Boolean(id));
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

  if (feed.source === "bestcomments") {
    params.set(
      "filters",
      ids.map((id) => `objectID:"${id}"`).join(" OR "),
    );

    return params;
  }

  params.set("tags", `(story,poll),(${ids.map((id) => `story_${id}`).join(",")})`);

  return params;
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

  for (let page = 1; hits.length < query.count; page += 1) {
    const pageIds = await scrapeItemIds(feed.scrapePath, page);

    if (pageIds.length === 0) {
      break;
    }

    const params = buildSpecialFeedParams(feed, query, pageIds);
    const pageHits = await fetchAlgolia(params);

    hits.push(...orderHitsByIds(pageIds, pageHits));

    if (pageIds.length < PAGE_SIZE) {
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

const buildStoryMetadata = (hit: AlgoliaSearchHit, commentsUrl: string) => {
  const metadata: string[] = [];

  if (hit.url) {
    metadata.push(
      `<p>Article URL: <a href="${escapeHtml(hit.url)}">${escapeHtml(hit.url)}</a></p>`,
    );
  }

  metadata.push(
    `<p>Comments URL: <a href="${escapeHtml(commentsUrl)}">${escapeHtml(commentsUrl)}</a></p>`,
  );
  metadata.push(`<p>Points: ${hit.points ?? 0}</p>`);
  metadata.push(`<p># Comments: ${hit.num_comments ?? 0}</p>`);

  return metadata;
};

const buildStoryDescription = (
  hit: AlgoliaSearchHit,
  commentsUrl: string,
) => {
  const storyText = normalizeHtml(hit.story_text);
  const metadata = buildStoryMetadata(hit, commentsUrl);

  if (storyText) {
    return [storyText, "<hr>", ...metadata].join("\n");
  }

  return metadata.join("\n");
};

const buildStoryItem = (
  hit: AlgoliaSearchHit,
  origin: string,
  query: RSSQueryOptions,
): RSSItem => {
  const commentsUrl = buildCommentsUrl(origin, hit.objectID);
  const articleUrl = hit.url ?? commentsUrl;

  return {
    title: decodeText(hit.title),
    description: query.includeDescription
      ? buildStoryDescription(hit, commentsUrl)
      : undefined,
    link: query.linkTo === "comments" ? commentsUrl : articleUrl,
    comments: commentsUrl,
    guid: `${HN_ITEM_URL}${hit.objectID}`,
    author: hit.author,
    pubDate: formatRSSDate(hit.created_at),
  };
};

const buildCommentItem = (
  hit: AlgoliaSearchHit,
  origin: string,
  query: RSSQueryOptions,
): RSSItem => {
  const storyId = hit.story_id ?? hit.objectID;
  const commentsUrl = buildCommentsUrl(origin, storyId, hit.objectID);

  return {
    title: `New comment by ${hit.author}`,
    description: query.includeDescription
      ? normalizeHtml(hit.comment_text)
      : undefined,
    link: commentsUrl,
    comments: commentsUrl,
    guid: `${HN_ITEM_URL}${hit.objectID}`,
    author: hit.author,
    pubDate: formatRSSDate(hit.created_at),
  };
};

const buildChannelTitle = (feed: RSSFeedDefinition) => `Hacker News: ${feed.title}`;

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
  let items: RSSItem[];

  if (feed.source === "bestcomments") {
    items = visibleHits.map((hit) => buildCommentItem(hit, requestUrl.origin, query));
  } else {
    items = visibleHits.map((hit) => buildStoryItem(hit, requestUrl.origin, query));
  }

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
