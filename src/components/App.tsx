import { PropsWithChildren } from "hono/jsx";
import { useSSRContext } from "~/lib/context";
import { Theme, getResolvedTheme } from "~/lib/theme";
import { InlineScript } from "./InlineScript";
import { Layout } from "./Layout";
import { Meta } from "./Meta";

export const App = ({ children }: PropsWithChildren) => {
  const { theme } = useSSRContext();
  const resolvedTheme = getResolvedTheme(theme);

  return (
    <html
      lang="en"
      class={resolvedTheme === Theme.DARK ? "dark" : undefined}
      data-theme={theme}
    >
      <Meta />

      <body>
        <InlineScript />

        <Layout>{children}</Layout>
      </body>
    </html>
  );
};
