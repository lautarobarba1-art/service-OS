import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardCharts } from "../components/dashboard-charts";

describe("DashboardCharts", () => {
  it("renders chart wrappers with explicit dimensions for Recharts", () => {
    const markup = renderToStaticMarkup(
      <DashboardCharts
        bookingSeries={[{ label: "Mon", value: 3 }]}
        statusSeries={[{ label: "Confirmed", value: 1, color: "#2f6b4d" }]}
      />,
    );

    expect(markup).toContain('style="width:100%;height:260px"');
    expect(markup).toContain('style="width:100%;height:180px"');
  });
});
