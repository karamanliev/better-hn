import { buildRSSFeedXML, parseRSSQuery } from "~/lib/hnrss";
import { getRSSFeed } from "~/lib/rss";

export default defineEventHandler(async (event) => {
  const feed = getRSSFeed(getRouterParam(event, "feed"));

  if (!feed) {
    throw createError({ statusCode: 404, message: "Feed not found" });
  }

  const requestUrl = getRequestURL(event);
  const query = parseRSSQuery(getQuery(event), feed);
  const xml = await buildRSSFeedXML(feed, query, requestUrl);

  setHeader(event, "content-type", "application/rss+xml; charset=utf-8");
  setHeader(
    event,
    "cache-control",
    "public, max-age=120, stale-while-revalidate=120",
  );

  return xml;
});
