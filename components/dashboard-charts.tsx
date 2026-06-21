"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SeriesItem = { label: string; value: number };
type StatusItem = { label: string; value: number; color: string };

export function DashboardCharts({ bookingSeries, statusSeries }: { bookingSeries: SeriesItem[]; statusSeries: StatusItem[] }) {
  const hasStatuses = statusSeries.some((item) => item.value > 0);
  return (
    <div className="dashboard-chart-grid">
      <section className="metric-panel chart-panel">
        <div className="metric-panel-title"><div><p className="eyebrow">VOLUMEN</p><h2>Reservas por período</h2></div></div>
        <div className="chart-container">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={bookingSeries} margin={{ top: 8, right: 4, left: -26, bottom: 0 }}>
              <CartesianGrid stroke="#e7ebe6" strokeDasharray="3 3" vertical={false} />
              <XAxis axisLine={false} dataKey="label" fontSize={10} tickLine={false} />
              <YAxis allowDecimals={false} axisLine={false} fontSize={10} tickLine={false} />
              <Tooltip contentStyle={{ border: "1px solid #dfe4df", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "#f1f5ef" }} />
              <Bar dataKey="value" fill="#2f6b4d" name="Reservas" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="metric-panel chart-panel status-chart-panel">
        <div className="metric-panel-title"><div><p className="eyebrow">DISTRIBUCIÓN</p><h2>Reservas por estado</h2></div></div>
        <div className="status-chart-body">
          <div className="pie-container">
            {hasStatuses ? <ResponsiveContainer height="100%" width="100%"><PieChart><Pie data={statusSeries} dataKey="value" innerRadius={48} nameKey="label" outerRadius={72} paddingAngle={2}>{statusSeries.map((item) => <Cell fill={item.color} key={item.label} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <span className="empty-chart">Sin datos</span>}
          </div>
          <div className="status-legend">{statusSeries.map((item) => <div key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
        </div>
      </section>
    </div>
  );
}
