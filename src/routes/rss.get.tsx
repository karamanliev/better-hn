import { ServerTiming } from "tiny-server-timing";
import { Link } from "~/components/Link";
import { RSS_FEEDS, RSS_FEED_CATEGORIES, getRSSFeedPath } from "~/lib/rss";
import { renderPage } from "~/render";

const RSS_PARAMETERS = [
  {
    name: "points",
    scope: "Story feeds",
    description: "Only include stories with at least this many points.",
    example: "/rss/frontpage?points=100",
  },
  {
    name: "comments",
    scope: "Story feeds",
    description: "Only include stories with at least this many comments.",
    example: "/rss/show?comments=25",
  },
  {
    name: "count",
    scope: "All feeds",
    description:
      "Choose how many items to return. The default is 30 items, and the maximum is 100.",
    example: "/rss/newest?count=50",
  },
  {
    name: "link",
    scope: "Story feeds",
    description:
      "Controls each RSS item's main link. By default it points to the submitted article URL; use comments to point at this Better HN discussion page instead.",
    example: "/rss/frontpage?link=comments",
  },
  {
    name: "description",
    scope: "All implemented feeds",
    description:
      "Choose meta for metadata plus links, full to also include story text or comment excerpts, or none to remove descriptions entirely. The default is full.",
    example: "/rss/frontpage?description=meta",
  },
];

const RSS_FEED_SECTIONS = RSS_FEED_CATEGORIES.map((category) => ({
  category,
  feeds: RSS_FEEDS.filter((feed) => feed.category === category),
}));

export default defineEventHandler(async (event) => {
  const timing = new ServerTiming();

  return renderPage(
    <div class="rssPage">
      <div class="rssHero">
        <h1>RSS feeds</h1>
        <p>
          Real-time Hacker News feeds for this Better HN instance. Add query
          parameters to any feed URL to filter or reshape the output.
        </p>
        <p class="rssHeroNote">
          You can combine parameters, for example{" "}
          <code>/rss/show?points=100&amp;comments=25&amp;count=50</code>.
        </p>
      </div>

      {RSS_FEED_SECTIONS.map(({ category, feeds }) => (
        <section class="rssSection" key={category}>
          <h2>{category}</h2>
          <div class="rssFeedList">
            {feeds.map((feed) => {
              const feedPath = getRSSFeedPath(feed.slug);

              return (
                <article class="rssFeedCard" key={feed.slug}>
                  <div class="rssFeedCardHeader">
                    <h3>{feed.title}</h3>
                    <Link className="rssFeedUrl" href={feedPath}>
                      {feedPath}
                    </Link>
                  </div>
                  <p>{feed.summary}</p>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <section class="rssSection rssParametersSection">
        <h2>Feed parameters</h2>
        <p class="rssSectionIntro">
          These optional parameters are supported across the implemented feeds.
        </p>

        <div class="rssParameterList">
          {RSS_PARAMETERS.map((parameter) => (
            <article class="rssFeedCard parameter" key={parameter.name}>
              <div class="rssParameterHeader">
                <h3>
                  <code>{parameter.name}</code>
                </h3>
                <span class="rssParameterScope">{parameter.scope}</span>
              </div>

              <p>{parameter.description}</p>
              <code class="rssParameterExample">{parameter.example}</code>
            </article>
          ))}
        </div>
      </section>
    </div>,
    {
      title: "RSS feeds",
      event,
      timing,
    },
  );
});
